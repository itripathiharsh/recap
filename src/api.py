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
import json
import logging
import os
from pathlib import Path
import shutil
from typing import Any
import uuid

from fastapi import FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

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

app = FastAPI(
    title="Personal Meeting Recorder API",
    version="1.0.0",
    description="Backend API for managing meetings, reviewing transcripts, and viewing MOMs.",
)

# CORS middleware for Next.js dashboard
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Personal app; can be restricted via DASHBOARD_ORIGIN env var
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DEFAULT_RECORDINGS_DIR = Path("data/recordings")
DEFAULT_JOBS_DIR = Path("data/jobs")

# In-memory heartbeat tracker
_last_heartbeat: dict[str, Any] = {
    "timestamp": None,
    "status": "online",
    "current_meeting": None,
}


# --- Request/Response Models ---
class CreateMeetingRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    meet_link: str = Field(..., pattern=r"^https://meet\.google\.com/[a-z]{3}-[a-z]{4}-[a-z]{3}")
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
    start_str = req.scheduled_start.isoformat() if isinstance(req.scheduled_start, datetime) else str(req.scheduled_start)

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
        logger.warning("Could not initialize local job JSON for %s: %s", meeting_id, exc)

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
        results.append({
            "id": j.get("meeting_id"),
            "title": j.get("title", "Meeting"),
            "meet_link": j.get("meet_link"),
            "scheduled_start": j.get("scheduled_start"),
            "status": j.get("status"),
            "created_at": j.get("created_at"),
            "error_message": j.get("error"),
        })
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
def update_meeting_endpoint(meeting_id: str, req: UpdateMeetingRequest) -> dict[str, Any]:
    """Update meeting fields."""
    client = get_supabase_client()
    update_data: dict[str, Any] = {}
    if req.title is not None:
        update_data["title"] = req.title
    if req.scheduled_start is not None:
        update_data["scheduled_start"] = req.scheduled_start.isoformat() if isinstance(req.scheduled_start, datetime) else str(req.scheduled_start)
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
        update_job_status(meeting_id, "failed", error="Cancelled by user", force=True, jobs_dir=DEFAULT_JOBS_DIR)
    except Exception:
        pass
    return {"status": "cancelled", "meeting_id": meeting_id}


@app.post("/api/meetings/{meeting_id}/start")
def start_meeting_endpoint(meeting_id: str) -> dict[str, Any]:
    """Manually queue meeting for immediate start by worker."""
    db_update_meeting_status(meeting_id, "queued")
    try:
        update_job_status(meeting_id, JobStatus.PENDING.value, force=True, jobs_dir=DEFAULT_JOBS_DIR)
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
            res = client.table("transcripts").select("*").eq("meeting_id", meeting_id).execute()
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
        data["mom_markdown"] = mom_md.read_text(encoding="utf-8") if mom_md.exists() else ""
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
        "total_gb": round(disk_stat.total / (1024 ** 3), 1),
        "used_gb": round(disk_stat.used / (1024 ** 3), 1),
        "free_gb": round(disk_stat.free / (1024 ** 3), 1),
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
            res = client.table("meetings").select("id", count="exact").in_("status", ["scheduled", "queued", "recording", "processing"]).execute()
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
