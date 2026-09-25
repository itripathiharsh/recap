"""FastAPI service layer for Personal Meeting Recorder.

Per PHASE 4:
Provides management, query, and status endpoints for the dashboard:
- POST /api/meetings (Create meeting)
- GET /api/meetings (List meetings)
- GET /api/meetings/{id} (Get meeting details)
- PATCH /api/meetings/{id} (Update meeting)
- DELETE /api/meetings/{id} (Cancel/delete meeting)
- POST /api/meetings/{id}/start (Manually trigger meeting worker)
- POST /api/meetings/{id}/cancel (Cancel scheduled job)
- GET /api/meetings/{id}/transcript (Return transcript)
- GET /api/meetings/{id}/mom (Return MOM)
- GET /api/meetings/{id}/status (Return current state)
- GET /api/system/status (Worker online/offline, last heartbeat, metrics, model availability)
- POST /api/worker/heartbeat (Internal heartbeat updater)
"""

from datetime import datetime, timezone
import hmac
import json
import logging
import os
from pathlib import Path
import shutil
from typing import Any
import secrets
import time
import uuid

from fastapi import FastAPI, HTTPException, Query, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from pydantic import BaseModel, Field

from src.google_meet_client import (
    exchange_code_for_tokens,
    extract_meeting_code,
    generate_auth_url,
    get_conference_record_for_meeting,
    get_connection_status,
    get_meeting_participants,
    save_meeting_participants,
)
from src.job_state import (
    JobStatus,
    create_job,
    get_job,
    list_jobs,
    update_job_status,
)
from src.supabase_client import (
    db_create_meeting,
    db_get_meeting,
    db_list_meetings,
    db_record_system_event,
    db_update_meeting_status,
    get_supabase_client,
)

logger = logging.getLogger("api")

# In-memory OAuth state tracker for CSRF protection: state -> expiry_timestamp
_oauth_states: dict[str, float] = {}

app = FastAPI(
    title="Personal Meeting Recorder API",
    version="1.0.0",
    description="Backend API for managing meetings, reviewing transcripts, and viewing MOMs.",
)

# CORS middleware for Next.js dashboard
# Restrict via DASHBOARD_ORIGIN env (comma-separated origins); default "*".
_cors_origins = [
    o.strip() for o in os.getenv("DASHBOARD_ORIGIN", "*").split(",") if o.strip()
] or ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Remote access control --------------------------------------------------
# Loopback callers (worker heartbeat, OAuth callback, local curl) are always
# allowed. Non-loopback callers must present X-Internal-Token matching
# FASTAPI_AUTH_TOKEN. While FASTAPI_AUTH_TOKEN is unset the API behaves as
# before (remote allowed) and logs a startup warning; set the env var to
# close remote access. Health checks and the browser OAuth flow stay open.
_LOOPBACK_HOSTS = {"127.0.0.1", "::1", "localhost"}
_remote_token_warned = False


def _client_is_loopback(request: Request) -> bool:
    host = request.client.host if request.client else ""
    return host in _LOOPBACK_HOSTS or host.startswith("127.")


@app.middleware("http")
async def _restrict_remote_access(request: Request, call_next: Any) -> Any:
    path = request.url.path
    public_paths = ("/", "/health", "/api/auth/google", "/api/auth/google/callback")
    if path in public_paths or _client_is_loopback(request):
        return await call_next(request)

    expected = os.getenv("FASTAPI_AUTH_TOKEN", "").strip()
    provided = request.headers.get("X-Internal-Token", "")
    if expected:
        if not (provided and hmac.compare_digest(provided, expected)):
            return JSONResponse(
                status_code=403,
                content={"detail": "X-Internal-Token required for remote access"},
            )
        return await call_next(request)

    global _remote_token_warned
    if not _remote_token_warned:
        logger.warning(
            "FASTAPI_AUTH_TOKEN is not set: remote (non-loopback) access to "
            "the API is unrestricted. Set FASTAPI_AUTH_TOKEN in .env to "
            "require X-Internal-Token for remote callers."
        )
        _remote_token_warned = True
    return await call_next(request)


DEFAULT_RECORDINGS_DIR = Path("data/recordings")
DEFAULT_JOBS_DIR = Path("data/jobs")

# In-memory heartbeat tracker
_last_heartbeat: dict[str, Any] = {
    "timestamp": None,
    "status": "online",
    "current_meeting": None,
}


@app.get("/")
@app.get("/health")
def health_check() -> dict[str, str]:
    """Health check endpoint for monitors and load balancers."""
    return {"status": "ok", "service": "meet-recorder-api"}


# --- Request/Response Models ---
class CreateMeetingRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    meet_link: str = Field(
        ..., pattern=r"^https://meet\.google\.com/[a-z]{3}-[a-z]{4}-[a-z]{3}"
    )
    scheduled_start: str | datetime
    expected_duration_minutes: int = Field(30, ge=5, le=180)


class UpdateMeetingRequest(BaseModel):
    title: str | None = None
    scheduled_start: str | datetime | None = None
    expected_duration_minutes: int | None = None


class HeartbeatRequest(BaseModel):
    status: str = "online"
    current_meeting: str | None = None
    metadata: dict[str, Any] = {}


# --- Endpoints ---


@app.post("/api/meetings", status_code=status.HTTP_201_CREATED)
def create_meeting_endpoint(req: CreateMeetingRequest) -> dict[str, Any]:
    """Create a new scheduled meeting in Supabase and local job state."""
    meeting_id = str(uuid.uuid4())
    start_str = (
        req.scheduled_start.isoformat()
        if isinstance(req.scheduled_start, datetime)
        else str(req.scheduled_start)
    )

    # 1. Create in Supabase
    db_meeting = db_create_meeting(
        title=req.title,
        meet_link=req.meet_link,
        scheduled_start=start_str,
        expected_duration_minutes=req.expected_duration_minutes,
        meeting_id=meeting_id,
    )

    # 2. Also initialize local JSON job for offline safety / local mirror
    try:
        create_job(
            meeting_id=meeting_id,
            meet_link=req.meet_link,
            title=req.title,
            scheduled_start=start_str,
            jobs_dir=DEFAULT_JOBS_DIR,
        )
    except Exception as exc:
        logger.warning(
            "Could not initialize local job JSON for %s: %s", meeting_id, exc
        )

    db_record_system_event(
        level="info",
        event_type="meeting_created",
        message=f"Created meeting '{req.title}'",
        meeting_id=meeting_id,
    )

    return db_meeting or {
        "id": meeting_id,
        "title": req.title,
        "meet_link": req.meet_link,
        "scheduled_start": start_str,
        "expected_duration_minutes": req.expected_duration_minutes,
        "status": "scheduled",
    }


@app.get("/api/meetings")
def list_meetings_endpoint(
    limit: int = Query(50, ge=1, le=100),
    status_filter: str | None = Query(None, alias="status"),
) -> list[dict[str, Any]]:
    """List meetings from Supabase with fallback to local JSON jobs."""
    meetings = db_list_meetings(limit=limit, status=status_filter)
    if meetings:
        return meetings

    # Fallback to local jobs
    local_jobs = list_jobs(jobs_dir=DEFAULT_JOBS_DIR)
    results = []
    for j in local_jobs:
        if status_filter and j.get("status") != status_filter:
            continue
        results.append(
            {
                "id": j.get("meeting_id"),
                "title": j.get("title", "Meeting"),
                "meet_link": j.get("meet_link"),
                "scheduled_start": j.get("scheduled_start"),
                "status": j.get("status"),
                "created_at": j.get("created_at"),
                "error_message": j.get("error"),
            }
        )
    return results[:limit]


@app.get("/api/meetings/{meeting_id}")
def get_meeting_endpoint(meeting_id: str) -> dict[str, Any]:
    """Retrieve meeting details from Supabase or local state."""
    meeting = db_get_meeting(meeting_id)
    if meeting:
        return meeting

    # Fallback to local job state
    try:
        job = get_job(meeting_id, jobs_dir=DEFAULT_JOBS_DIR)
        return {
            "id": job.get("meeting_id"),
            "title": job.get("title", "Meeting"),
            "meet_link": job.get("meet_link"),
            "scheduled_start": job.get("scheduled_start"),
            "status": job.get("status"),
            "created_at": job.get("created_at"),
            "error_message": job.get("error"),
        }
    except Exception:
        raise HTTPException(status_code=404, detail=f"Meeting {meeting_id} not found")


@app.patch("/api/meetings/{meeting_id}")
def update_meeting_endpoint(
    meeting_id: str, req: UpdateMeetingRequest
) -> dict[str, Any]:
    """Update meeting fields."""
    client = get_supabase_client()
    update_data: dict[str, Any] = {}
    if req.title is not None:
        update_data["title"] = req.title
    if req.scheduled_start is not None:
        update_data["scheduled_start"] = (
            req.scheduled_start.isoformat()
            if isinstance(req.scheduled_start, datetime)
            else str(req.scheduled_start)
        )
    if req.expected_duration_minutes is not None:
        update_data["expected_duration_minutes"] = req.expected_duration_minutes

    if client and update_data:
        try:
            client.table("meetings").update(update_data).eq("id", meeting_id).execute()
        except Exception as exc:
            logger.error("Failed to update meeting %s: %s", meeting_id, exc)

    return get_meeting_endpoint(meeting_id)


@app.delete("/api/meetings/{meeting_id}")
def delete_meeting_endpoint(meeting_id: str) -> dict[str, Any]:
    """Cancel or delete meeting."""
    db_update_meeting_status(meeting_id, "cancelled")
    try:
        update_job_status(
            meeting_id,
            "failed",
            error="Cancelled by user",
            force=True,
            jobs_dir=DEFAULT_JOBS_DIR,
        )
    except Exception:
        pass
    return {"status": "cancelled", "meeting_id": meeting_id}


@app.post("/api/meetings/{meeting_id}/start")
def start_meeting_endpoint(meeting_id: str) -> dict[str, Any]:
    """Manually queue meeting for immediate start by worker."""
    db_update_meeting_status(meeting_id, "queued")
    try:
        update_job_status(
            meeting_id, JobStatus.PENDING.value, force=True, jobs_dir=DEFAULT_JOBS_DIR
        )
    except Exception:
        pass
    db_record_system_event(
        level="info",
        event_type="manual_start_triggered",
        message="User manually triggered meeting start",
        meeting_id=meeting_id,
    )
    return {"status": "queued", "meeting_id": meeting_id}


@app.post("/api/meetings/{meeting_id}/cancel")
def cancel_meeting_endpoint(meeting_id: str) -> dict[str, Any]:
    """Cancel scheduled meeting."""
    return delete_meeting_endpoint(meeting_id)


@app.get("/api/meetings/{meeting_id}/transcript")
def get_transcript_endpoint(meeting_id: str) -> dict[str, Any]:
    """Return transcript JSON."""
    client = get_supabase_client()
    if client:
        try:
            res = (
                client.table("transcripts")
                .select("*")
                .eq("meeting_id", meeting_id)
                .execute()
            )
            if res.data:
                return res.data[0]
        except Exception:
            pass

    # Fallback to local final.json or transcript.json
    final_file = DEFAULT_RECORDINGS_DIR / meeting_id / "final.json"
    if final_file.exists():
        with open(final_file, "r", encoding="utf-8") as f:
            return json.load(f)

    transcript_file = DEFAULT_RECORDINGS_DIR / meeting_id / "transcript.json"
    if transcript_file.exists():
        with open(transcript_file, "r", encoding="utf-8") as f:
            return json.load(f)

    raise HTTPException(status_code=404, detail="Transcript not found for this meeting")


@app.get("/api/meetings/{meeting_id}/mom")
def get_mom_endpoint(meeting_id: str) -> dict[str, Any]:
    """Return MOM JSON and rendered markdown."""
    client = get_supabase_client()
    if client:
        try:
            res = client.table("mom").select("*").eq("meeting_id", meeting_id).execute()
            if res.data:
                return res.data[0]
        except Exception:
            pass

    # Fallback to local mom.json & mom.md
    rec_dir = DEFAULT_RECORDINGS_DIR / meeting_id
    mom_json = rec_dir / "mom.json"
    mom_md = rec_dir / "mom.md"

    if mom_json.exists():
        with open(mom_json, "r", encoding="utf-8") as f:
            data = json.load(f)
        data["mom_markdown"] = (
            mom_md.read_text(encoding="utf-8") if mom_md.exists() else ""
        )
        return data

    raise HTTPException(status_code=404, detail="MOM not found for this meeting")


@app.get("/api/meetings/{meeting_id}/status")
def get_meeting_status_endpoint(meeting_id: str) -> dict[str, Any]:
    """Return current state of meeting."""
    details = get_meeting_endpoint(meeting_id)
    return {
        "meeting_id": meeting_id,
        "status": details.get("status"),
        "error_message": details.get("error_message"),
        "started_at": details.get("started_at"),
        "ended_at": details.get("ended_at"),
    }


@app.get("/api/system/status")
def get_system_status_endpoint() -> dict[str, Any]:
    """Return worker status, hardware metrics, queue length, and model availability."""
    now = datetime.now(timezone.utc)

    # Disk usage
    rec_path = DEFAULT_RECORDINGS_DIR.resolve()
    disk_stat = shutil.disk_usage(rec_path if rec_path.exists() else Path("."))
    disk_usage = {
        "total_gb": round(disk_stat.total / (1024**3), 1),
        "used_gb": round(disk_stat.used / (1024**3), 1),
        "free_gb": round(disk_stat.free / (1024**3), 1),
        "percent_used": round((disk_stat.used / disk_stat.total) * 100, 1),
    }

    # Worker online/offline state
    last_hb = _last_heartbeat.get("timestamp")
    is_online = False
    if last_hb:
        delta = (now - last_hb).total_seconds()
        is_online = delta < 120  # Online if heartbeat within 2 minutes

    # Queue length
    client = get_supabase_client()
    queue_length = 0
    if client:
        try:
            res = (
                client.table("meetings")
                .select("id", count="exact")
                .in_("status", ["scheduled", "queued", "recording", "processing"])
                .execute()
            )
            queue_length = res.count or 0
        except Exception:
            pass

    # Model availability checks
    models_available = {
        "faster_whisper": True,
        "pyannote": bool(os.getenv("HUGGINGFACE_TOKEN")),
        "gemini": bool(os.getenv("GEMINI_API_KEY")),
        "groq": bool(os.getenv("GROQ_API_KEY")),
    }

    return {
        "worker_status": "online" if is_online else "idle",
        "last_heartbeat": last_hb.isoformat() if last_hb else None,
        "current_meeting": _last_heartbeat.get("current_meeting"),
        "queue_length": queue_length,
        "disk_usage": disk_usage,
        "models_available": models_available,
        "timestamp": now.isoformat(),
    }


@app.post("/api/worker/heartbeat")
def post_heartbeat_endpoint(req: HeartbeatRequest) -> dict[str, Any]:
    """Update worker heartbeat."""
    now = datetime.now(timezone.utc)
    _last_heartbeat["timestamp"] = now
    _last_heartbeat["status"] = req.status
    _last_heartbeat["current_meeting"] = req.current_meeting

    db_record_system_event(
        level="info",
        event_type="heartbeat",
        message=f"Worker heartbeat: status={req.status}",
        metadata={"current_meeting": req.current_meeting, **req.metadata},
    )
    return {"status": "ok", "received_at": now.isoformat()}


# --- Google Meet REST API & OAuth Endpoints ---


@app.get("/api/auth/google")
def google_auth_endpoint(
    redirect_uri: str | None = Query(None),
    as_json: bool = Query(False, alias="json"),
) -> Any:
    """Generate Google OAuth authorization URL requesting offline access with CSRF protection."""
    # Clean up expired states (> 10 minutes)
    now = time.time()
    expired = [s for s, exp in _oauth_states.items() if exp < now]
    for s in expired:
        _oauth_states.pop(s, None)

    state = secrets.token_urlsafe(32)
    _oauth_states[state] = now + 600.0  # 10 minutes TTL

    try:
        auth_url, _ = generate_auth_url(redirect_uri=redirect_uri, state=state)
    except Exception as exc:
        logger.error("Failed to generate Google auth URL: %s", exc)
        raise HTTPException(
            status_code=500,
            detail=f"Could not generate authorization URL: {exc}",
        )

    if as_json:
        return {"authorization_url": auth_url, "state": state}

    return RedirectResponse(
        url=auth_url, status_code=status.HTTP_307_TEMPORARY_REDIRECT
    )


@app.get("/api/auth/google/callback")
def google_auth_callback_endpoint(
    code: str | None = Query(None),
    state: str | None = Query(None),
    error: str | None = Query(None),
    redirect_uri: str | None = Query(None),
) -> Any:
    """Exchange OAuth authorization code for tokens, validate state, and store refresh token securely."""
    if error:
        logger.warning("Google OAuth error in callback: %s", error)
        return HTMLResponse(
            f"<h3>Google OAuth Error: {error}</h3><p>You may close this window.</p>",
            status_code=400,
        )

    if not code or not state:
        raise HTTPException(
            status_code=400,
            detail="Missing required parameters 'code' or 'state'.",
        )

    # Validate state for CSRF protection
    now = time.time()
    stored_expiry = _oauth_states.pop(state, None)
    if stored_expiry is None or stored_expiry < now:
        logger.warning("Invalid or expired OAuth state received: %s", state)
        raise HTTPException(
            status_code=400,
            detail="Invalid or expired OAuth state (CSRF verification failed).",
        )

    try:
        result = exchange_code_for_tokens(code=code, redirect_uri=redirect_uri)
    except Exception as exc:
        logger.error("Token exchange failed: %s", exc)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to exchange authorization code for tokens: {exc}",
        )

    account_identity = result.get("account_identity") or "Authorized User"
    html_content = f"""<!DOCTYPE html>
<html>
<head>
    <title>Google Meet Connected</title>
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background-color: #f8fafc; }}
        .card {{ background: white; padding: 32px 40px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); text-align: center; max-width: 420px; }}
        .badge {{ background-color: #ecfdf5; color: #059669; padding: 6px 12px; border-radius: 9999px; font-weight: 600; font-size: 13px; display: inline-block; margin-bottom: 16px; }}
        h2 {{ margin: 0 0 10px 0; color: #0f172a; }}
        p {{ color: #64748b; font-size: 14px; margin: 0 0 20px 0; }}
        .btn {{ display: inline-block; background-color: #2563eb; color: white; padding: 8px 16px; border-radius: 6px; text-decoration: none; font-size: 13px; font-weight: 500; }}
    </style>
</head>
<body>
    <div class="card">
        <div class="badge">&#10003; Connected</div>
        <h2>Google Meet Connected</h2>
        <p>Your Google Meet integration is now active for <strong>{account_identity}</strong>. You can safely close this tab and return to the dashboard.</p>
    </div>
</body>
</html>"""
    return HTMLResponse(content=html_content, status_code=200)


@app.get("/api/auth/google/status")
def google_auth_status_endpoint() -> dict[str, Any]:
    """Return Google Meet connection status and connected account identity without exposing tokens."""
    return get_connection_status()


@app.get("/api/meetings/{meeting_id}/participants")
def get_meeting_participants_endpoint(meeting_id: str) -> dict[str, Any]:
    """Retrieve participant names, join/leave times, and sessions via Google Meet REST API with DOM fallback."""
    # 1. Look up meeting in DB or local state
    meeting = None
    try:
        meeting = get_meeting_endpoint(meeting_id)
    except HTTPException:
        pass

    if not meeting:
        raise HTTPException(status_code=404, detail=f"Meeting {meeting_id} not found")

    meet_link = meeting.get("meet_link")
    scheduled_start = meeting.get("scheduled_start")
    participants_file = DEFAULT_RECORDINGS_DIR / meeting_id / "participants.json"

    # 2. Check if Google Meet REST API is connected
    api_status = get_connection_status()
    if api_status.get("connected") and meet_link:
        meet_code = extract_meeting_code(meet_link)
        conf_record = get_conference_record_for_meeting(
            meet_code, scheduled_time=scheduled_start
        )
        if conf_record and "name" in conf_record:
            conf_name = conf_record["name"]
            participants = get_meeting_participants(conf_name)
            if participants:
                saved = save_meeting_participants(
                    meeting_id=meeting_id,
                    participants=participants,
                    source="google_meet_api",
                    conference_record=conf_name,
                    recordings_dir=DEFAULT_RECORDINGS_DIR,
                    jobs_dir=DEFAULT_JOBS_DIR,
                )
                return saved

    # 3. Fallback to existing DOM participant extraction if available
    if participants_file.exists():
        try:
            with open(participants_file, "r", encoding="utf-8") as f:
                data = json.load(f)

            if isinstance(data, list):
                clean_list = []
                for item in data:
                    if isinstance(item, str):
                        clean_list.append(
                            {
                                "displayName": item,
                                "user_type": "unknown",
                                "source": "dom_fallback",
                            }
                        )
                    elif isinstance(item, dict):
                        clean_list.append(item)
                return {
                    "meeting_id": meeting_id,
                    "source": "dom_fallback",
                    "conference_record": None,
                    "participants": clean_list,
                }
            elif isinstance(data, dict):
                return data
        except Exception as exc:
            logger.warning(
                "Could not read participants file for %s: %s", meeting_id, exc
            )

    return {
        "meeting_id": meeting_id,
        "source": "none",
        "conference_record": None,
        "participants": [],
        "message": "No participant data available from Google Meet API or DOM fallback.",
    }


@app.get("/api/meetings/{meeting_id}/speakers")
def get_meeting_speakers_endpoint(meeting_id: str) -> dict[str, Any]:
    """Retrieve speaker mapping, participant roster, diarized speakers, resolved names, and confidence."""
    rec_dir = DEFAULT_RECORDINGS_DIR / meeting_id
    if not rec_dir.exists():
        raise HTTPException(
            status_code=404, detail=f"Recording data for meeting {meeting_id} not found"
        )

    # 1. Caption availability
    captions_file = rec_dir / "captions.json"
    captions_available = False
    if captions_file.exists():
        try:
            c_data = json.loads(captions_file.read_text(encoding="utf-8"))
            captions_available = bool(c_data.get("captions_available", False))
        except Exception:
            pass

    # 2. Participants
    participants_file = rec_dir / "participants.json"
    participants: list[Any] = []
    if participants_file.exists():
        try:
            p_data = json.loads(participants_file.read_text(encoding="utf-8"))
            if isinstance(p_data, dict):
                participants = p_data.get("participants", [])
            elif isinstance(p_data, list):
                participants = p_data
        except Exception:
            pass

    # 3. Diarized speakers from speakers.json
    speakers_file = rec_dir / "speakers.json"
    diarized_speakers: list[str] = []
    if speakers_file.exists():
        try:
            s_data = json.loads(speakers_file.read_text(encoding="utf-8"))
            diarized_speakers = sorted(
                list(
                    set(
                        t.get("speaker")
                        for t in s_data.get("speaker_turns", [])
                        if t.get("speaker")
                    )
                )
            )
        except Exception:
            pass

    # 4. Speaker mapping details
    mapping_file = rec_dir / "speaker_mapping.json"
    speakers_list: list[dict[str, Any]] = []
    if mapping_file.exists():
        try:
            m_data = json.loads(mapping_file.read_text(encoding="utf-8"))
            speakers_list = m_data.get("speakers", [])
        except Exception:
            pass

    # Fallback to final.json if speaker_mapping.json does not exist
    if not speakers_list:
        final_file = rec_dir / "final.json"
        if final_file.exists():
            try:
                f_data = json.loads(final_file.read_text(encoding="utf-8"))
                seen = set()
                for turn in f_data.get("turns", []):
                    spk_id = turn.get("speaker_id") or turn.get("speaker")
                    if spk_id and spk_id not in seen:
                        seen.add(spk_id)
                        name = turn.get("speaker")
                        speakers_list.append(
                            {
                                "speaker_id": spk_id,
                                "name": name,
                                "confidence": turn.get("confidence", 0.0)
                                or (1.0 if name != spk_id else 0.0),
                                "source": "final_transcript",
                            }
                        )
            except Exception:
                pass

    return {
        "meeting_id": meeting_id,
        "captions_available": captions_available,
        "participants": participants,
        "diarized_speakers": diarized_speakers,
        "speakers": speakers_list,
    }
