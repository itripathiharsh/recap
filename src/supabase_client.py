"""Supabase database and auth client helper for Meeting Recorder.

Provides typed helpers for interacting with:
- meetings
- jobs
- transcripts
- speaker_turns
- mom
- system_events
"""

from datetime import datetime, timezone
import logging
import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("supabase_client")

_client = None
_default_owner_id: str | None = None
_default_owner_resolved = False


def get_supabase_client() -> Any:
    """Return a singleton Supabase client instance."""
    global _client
    if _client is not None:
        return _client

    url = os.getenv("SUPABASE_URL", "").strip()
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    key = (
        service_key
        or os.getenv("SUPABASE_KEY", "").strip()
        or os.getenv("SUPABASE_ANON_KEY", "").strip()
    )

    if not url or not key:
        logger.warning(
            "SUPABASE_URL or SUPABASE_KEY not set; Supabase operations will be skipped or mocked."
        )
        return None

    if not service_key:
        logger.warning(
            "SUPABASE_SERVICE_ROLE_KEY is not set - falling back to %s. "
            "Row Level Security rejects anon writes, so backend inserts/updates "
            "will fail until the service role key is configured.",
            "SUPABASE_KEY",
        )

    try:
        from supabase import create_client

        _client = create_client(url, key)
        return _client
    except Exception as exc:
        logger.error("Failed to initialize Supabase client: %s", exc)
        return None


def resolve_default_owner_id() -> str | None:
    """Resolve the default meeting owner id for backend-created meetings.

    Reads MEETINGS_OWNER_ID first, falling back to a service-role lookup of
    MEETINGS_OWNER_EMAIL. The result is cached for the process lifetime.

    Returns:
        The owner's auth user id, or None when unconfigured or unresolvable.
    """
    global _default_owner_id, _default_owner_resolved
    if _default_owner_resolved:
        return _default_owner_id

    owner_id = os.getenv("MEETINGS_OWNER_ID", "").strip()
    if not owner_id:
        email = os.getenv("MEETINGS_OWNER_EMAIL", "").strip()
        client = get_supabase_client()
        if email and client is not None:
            try:
                res = client.rpc("get_auth_user_id", {"p_email": email}).execute()
                owner_id = (res.data or "").strip() if isinstance(res.data, str) else ""
            except Exception as exc:
                logger.warning(
                    "Could not resolve MEETINGS_OWNER_EMAIL to a user id: %s", exc
                )

    _default_owner_id = owner_id or None
    _default_owner_resolved = True
    return _default_owner_id


def db_create_meeting(
    title: str,
    meet_link: str,
    scheduled_start: str | datetime,
    expected_duration_minutes: int = 30,
    meeting_id: str | None = None,
    user_id: str | None = None,
) -> dict[str, Any] | None:
    """Insert a new meeting row into Supabase."""
    client = get_supabase_client()
    if not client:
        return None

    start_iso = (
        scheduled_start.isoformat()
        if isinstance(scheduled_start, datetime)
        else str(scheduled_start)
    )

    data: dict[str, Any] = {
        "title": title,
        "meet_link": meet_link,
        "scheduled_start": start_iso,
        "expected_duration_minutes": expected_duration_minutes,
        "status": "scheduled",
    }
    if meeting_id:
        data["id"] = meeting_id
    owner = user_id or resolve_default_owner_id()
    if owner:
        data["user_id"] = owner
        data["owner_id"] = owner
        data["workspace_type"] = "individual"
        data["visibility"] = "private"
    else:
        logger.warning(
            "Creating meeting %r without an owner (set MEETINGS_OWNER_ID or "
            "MEETINGS_OWNER_EMAIL). It stays invisible in the dashboard until "
            "scripts/backfill_meeting_ownership.py stamps an owner.",
            title,
        )

    try:
        res = client.table("meetings").insert(data).execute()
        return res.data[0] if res.data else None
    except Exception as exc:
        logger.error("Failed to create meeting in Supabase: %s", exc)
        return None


def db_get_meeting(meeting_id: str) -> dict[str, Any] | None:
    """Fetch a single meeting by UUID from Supabase."""
    client = get_supabase_client()
    if not client:
        return None

    try:
        res = client.table("meetings").select("*").eq("id", meeting_id).execute()
        return res.data[0] if res.data else None
    except Exception as exc:
        logger.error("Failed to fetch meeting %s from Supabase: %s", meeting_id, exc)
        return None


def db_update_meeting_status(
    meeting_id: str,
    status: str,
    error_message: str | None = None,
    started_at: str | None = None,
    ended_at: str | None = None,
) -> bool:
    """Update meeting status and timestamps in Supabase."""
    client = get_supabase_client()
    if not client:
        return False

    update_payload: dict[str, Any] = {"status": status}
    if error_message is not None:
        update_payload["error_message"] = error_message
    if started_at:
        update_payload["started_at"] = started_at
    if ended_at:
        update_payload["ended_at"] = ended_at

    try:
        client.table("meetings").update(update_payload).eq("id", meeting_id).execute()
        return True
    except Exception as exc:
        logger.error(
            "Failed to update meeting %s status to %s: %s", meeting_id, status, exc
        )
        return False


def db_list_meetings(
    limit: int = 50, status: str | None = None
) -> list[dict[str, Any]]:
    """List meetings ordered by scheduled_start desc."""
    client = get_supabase_client()
    if not client:
        return []

    try:
        query = (
            client.table("meetings")
            .select("*")
            .order("scheduled_start", desc=True)
            .limit(limit)
        )
        if status:
            query = query.eq("status", status)
        res = query.execute()
        return res.data or []
    except Exception as exc:
        logger.error("Failed to list meetings from Supabase: %s", exc)
        return []


def db_save_transcript(
    meeting_id: str,
    transcript_json: dict[str, Any],
    language: str = "en",
    confidence: float | None = None,
) -> bool:
    """Insert transcript record into Supabase."""
    client = get_supabase_client()
    if not client:
        return False

    payload = {
        "meeting_id": meeting_id,
        "language": language,
        "confidence": confidence,
        "transcript_json": transcript_json,
    }
    try:
        client.table("transcripts").delete().eq("meeting_id", meeting_id).execute()
        client.table("transcripts").insert(payload).execute()
        return True
    except Exception as exc:
        logger.error("Failed to save transcript for %s: %s", meeting_id, exc)
        return False


def db_save_speaker_turns(
    meeting_id: str,
    speaker_turns: list[dict[str, Any]],
) -> bool:
    """Insert speaker turns into Supabase."""
    client = get_supabase_client()
    if not client:
        return False

    rows = [
        {
            "meeting_id": meeting_id,
            "speaker": str(t.get("speaker", "UNKNOWN")),
            "start_time": float(t.get("start") or t.get("start_time") or 0.0),
            "end_time": float(t.get("end") or t.get("end_time") or 0.0),
            "text": str(t.get("text", "")).strip(),
        }
        for t in speaker_turns
    ]
    if not rows:
        return True

    try:
        client.table("speaker_turns").delete().eq("meeting_id", meeting_id).execute()
        client.table("speaker_turns").insert(rows).execute()
        return True
    except Exception as exc:
        logger.error("Failed to save speaker turns for %s: %s", meeting_id, exc)
        return False


def db_save_mom(
    meeting_id: str,
    mom_data: dict[str, Any],
    mom_markdown: str,
) -> bool:
    """Insert or update MOM record in Supabase."""
    client = get_supabase_client()
    if not client:
        return False

    payload = {
        "meeting_id": meeting_id,
        "summary": mom_data.get("summary", ""),
        "decisions": mom_data.get("decisions", []),
        "action_items": mom_data.get("action_items", []),
        "open_questions": mom_data.get("open_questions", []),
        "mom_markdown": mom_markdown,
    }
    try:
        client.table("mom").delete().eq("meeting_id", meeting_id).execute()
        client.table("mom").insert(payload).execute()
        return True
    except Exception as exc:
        logger.error("Failed to save MOM for %s: %s", meeting_id, exc)
        return False


def db_record_system_event(
    level: str,
    event_type: str,
    message: str,
    meeting_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> bool:
    """Log an audit or diagnostic event to system_events."""
    client = get_supabase_client()
    if not client:
        return False

    payload = {
        "level": level,
        "event_type": event_type,
        "message": message,
        "meeting_id": meeting_id,
        "metadata": metadata or {},
    }
    try:
        client.table("system_events").insert(payload).execute()
        return True
    except Exception as exc:
        logger.error("Failed to log system event: %s", exc)
        return False


def db_create_job(
    meeting_id: str,
    job_type: str = "full_recording_pipeline",
) -> dict[str, Any] | None:
    """Create a new job record in Supabase."""
    client = get_supabase_client()
    if not client:
        return None

    payload = {
        "meeting_id": meeting_id,
        "job_type": job_type,
        "status": "pending",
        "attempts": 0,
        "started_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        res = client.table("jobs").insert(payload).execute()
        return res.data[0] if res.data else None
    except Exception as exc:
        logger.error("Failed to create job in Supabase: %s", exc)
        return None


def db_update_job(
    job_id: str,
    status: str,
    error: str | None = None,
    completed_at: str | None = None,
    attempts: int | None = None,
) -> bool:
    """Update job status and completion in Supabase."""
    client = get_supabase_client()
    if not client:
        return False

    valid_job_statuses = {"pending", "running", "completed", "failed", "cancelled"}
    mapped_status = status if status in valid_job_statuses else "running"
    payload: dict[str, Any] = {"status": mapped_status}
    if error is not None:
        payload["error"] = error
    if completed_at is not None:
        payload["completed_at"] = completed_at
    if attempts is not None:
        payload["attempts"] = attempts

    try:
        client.table("jobs").update(payload).eq("id", job_id).execute()
        return True
    except Exception as exc:
        logger.error("Failed to update job %s: %s", job_id, exc)
        return False


def db_get_upcoming_meetings(lookahead_minutes: int = 5) -> list[dict[str, Any]]:
    """Fetch meetings scheduled within lookahead_minutes or already overdue."""
    client = get_supabase_client()
    if not client:
        return []

    from datetime import timedelta

    now = datetime.now(timezone.utc)
    threshold = (now + timedelta(minutes=lookahead_minutes)).isoformat()

    try:
        res = (
            client.table("meetings")
            .select("*")
            .in_("status", ["scheduled", "queued"])
            .lte("scheduled_start", threshold)
            .order("scheduled_start")
            .execute()
        )
        return res.data or []
    except Exception as exc:
        logger.error("Failed to query upcoming meetings: %s", exc)
        return []


def db_claim_meeting(meeting_id: str, target_status: str = "joining") -> bool:
    """Atomically claim a scheduled or queued meeting to prevent duplicate runs."""
    client = get_supabase_client()
    if not client:
        return False

    try:
        # Atomic condition: status in ('scheduled', 'queued')
        res = (
            client.table("meetings")
            .update(
                {
                    "status": target_status,
                    "started_at": datetime.now(timezone.utc).isoformat(),
                }
            )
            .eq("id", meeting_id)
            .in_("status", ["scheduled", "queued"])
            .execute()
        )
        return bool(res.data and len(res.data) > 0)
    except Exception as exc:
        logger.error("Failed to claim meeting %s: %s", meeting_id, exc)
        return False


def db_upload_recording_audio(meeting_id: str, audio_path: Path) -> str | None:
    """Upload recorded audio file to Supabase Storage bucket 'recordings' and save recording_url."""
    client = get_supabase_client()
    if not client or not audio_path.exists():
        return None

    try:
        storage_path = f"{meeting_id}/audio.wav"
        with open(audio_path, "rb") as f:
            client.storage.from_("recordings").upload(
                path=storage_path,
                file=f,
                file_options={"content-type": "audio/wav", "upsert": "true"},
            )
        supabase_url = os.getenv("SUPABASE_URL", "").rstrip("/")
        public_url = (
            f"{supabase_url}/storage/v1/object/public/recordings/{storage_path}"
        )
        client.table("meetings").update({"recording_url": public_url}).eq(
            "id", meeting_id
        ).execute()
        logger.info("Uploaded recording audio to Supabase Storage: %s", public_url)
        return public_url
    except Exception as exc:
        logger.warning("Failed to upload recording audio to Supabase Storage: %s", exc)
        return None


def db_delete_recording_audio(meeting_id: str) -> bool:
    """Delete recorded audio from Supabase Storage bucket 'recordings' and unset recording_url."""
    client = get_supabase_client()
    if not client:
        return False

    try:
        storage_path = f"{meeting_id}/audio.wav"
        client.storage.from_("recordings").remove([storage_path])
        client.table("meetings").update({"recording_url": None}).eq(
            "id", meeting_id
        ).execute()
        logger.info(
            "Deleted recording audio from Supabase Storage for meeting: %s", meeting_id
        )
        return True
    except Exception as exc:
        logger.warning(
            "Failed to delete recording audio from Supabase Storage for %s: %s",
            meeting_id,
            exc,
        )
        return False


def db_delete_meeting(meeting_id: str) -> bool:
    """Completely purge a meeting and all its associated data and audio."""
    client = get_supabase_client()
    if not client:
        return False

    try:
        # 1. Delete storage audio
        db_delete_recording_audio(meeting_id)

        # 2. Delete database relations
        client.table("speaker_turns").delete().eq("meeting_id", meeting_id).execute()
        client.table("mom").delete().eq("meeting_id", meeting_id).execute()
        client.table("transcripts").delete().eq("meeting_id", meeting_id).execute()
        client.table("jobs").delete().eq("meeting_id", meeting_id).execute()
        client.table("system_events").delete().eq("meeting_id", meeting_id).execute()
        client.table("meetings").delete().eq("id", meeting_id).execute()

        logger.info(
            "Successfully purged meeting %s and all associated records.", meeting_id
        )
        return True
    except Exception as exc:
        logger.error("Failed to delete meeting %s: %s", meeting_id, exc)
        return False
