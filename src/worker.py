"""Meeting Recorder Worker & Orchestrator.

Consumes meetings and executes the full validated pipeline:
join_worker -> recorder -> STT -> diarization -> merge -> MOM -> delivery -> Supabase sync.

Maintains local JSON job state as a safety mirror while publishing state and
artifacts to Supabase for the web dashboard.
"""

from datetime import datetime, timezone
import json
import logging
from pathlib import Path
import sys
import time
from typing import Any

from src.delivery import deliver
from src.diarize_worker import diarize
from src.job_state import (
    JobStatus,
    create_job,
    get_job,
    update_job_status,
)
from src.join_worker import join_and_record
from src.merge import merge_transcript_and_speakers
from src.mom_generator import generate_mom
from src.stt_worker import transcribe
from src.supabase_client import (
    db_claim_meeting,
    db_create_job,
    db_record_system_event,
    db_save_mom,
    db_save_speaker_turns,
    db_save_transcript,
    db_update_job,
    db_update_meeting_status,
)

logger = logging.getLogger("worker")

MAX_RETRIES = 2


def execute_meeting_pipeline(
    meeting: dict[str, Any],
    jobs_dir: Path = Path("data/jobs"),
    recordings_dir: Path = Path("data/recordings"),
    pulse_source: str = "VirtualSink.monitor",
) -> bool:
    """Execute the complete end-to-end meeting recording and processing pipeline.

    Args:
        meeting: Dictionary containing meeting data (id, meet_link, title, scheduled_start, etc.)
        jobs_dir: Directory for local job JSON files (safety mirror).
        recordings_dir: Base directory for audio and artifacts.
        pulse_source: PulseAudio monitor source name for recording.

    Returns:
        True if pipeline succeeded, False otherwise.
    """
    meeting_id = str(meeting["id"])
    meet_link = str(meeting["meet_link"])
    title = str(meeting.get("title", "Meeting"))
    scheduled_start = str(meeting.get("scheduled_start", datetime.now(timezone.utc).isoformat()))
    duration = int(meeting.get("expected_duration_minutes", 30))

    logger.info("Starting pipeline for meeting: %s (%s)", title, meeting_id)

    # 1. Initialize local safety job & Supabase job
    jobs_dir.mkdir(parents=True, exist_ok=True)
    try:
        create_job(
            meeting_id=meeting_id,
            meet_link=meet_link,
            title=title,
            scheduled_start=scheduled_start,
            jobs_dir=jobs_dir,
        )
    except Exception as exc:
        logger.debug("Local job file already exists or initialized: %s", exc)

    job_rec = db_create_job(meeting_id=meeting_id, job_type="full_recording_pipeline")
    job_id = job_rec["id"] if job_rec else None

    rec_dir = recordings_dir / meeting_id
    rec_dir.mkdir(parents=True, exist_ok=True)

    # 2. Stage 1: Join & Record
    db_update_meeting_status(
        meeting_id=meeting_id,
        status="recording",
        started_at=datetime.now(timezone.utc).isoformat(),
    )
    if job_id:
        db_update_job(job_id=job_id, status="recording")

    try:
        audio_path = join_and_record(
            meeting_id=meeting_id,
            jobs_dir=jobs_dir,
            recordings_dir=recordings_dir,
            max_minutes=duration,
            pulse_source=pulse_source,
        )
        logger.info("Audio recorded successfully at: %s", audio_path)
    except Exception as exc:
        err_msg = f"Join/Recording failed: {exc}"
        logger.error(err_msg, exc_info=True)
        db_update_meeting_status(meeting_id=meeting_id, status="failed", error_message=err_msg)
        if job_id:
            db_update_job(job_id=job_id, status="failed", error=err_msg)
        db_record_system_event("error", "recording_failed", err_msg, meeting_id=meeting_id)
        return False

    # 3. Stage 2: STT (faster-whisper)
    db_update_meeting_status(meeting_id=meeting_id, status="processing")
    if job_id:
        db_update_job(job_id=job_id, status="transcribing")

    try:
        stt_result = transcribe(
            meeting_id=meeting_id,
            recordings_dir=recordings_dir,
            jobs_dir=jobs_dir,
            model_size="small",
        )
        db_save_transcript(
            meeting_id=meeting_id,
            transcript_json=stt_result,
            language=stt_result.get("language", "en"),
        )
        logger.info("STT completed and saved to Supabase.")
    except Exception as exc:
        err_msg = f"Transcription failed: {exc}"
        logger.error(err_msg, exc_info=True)
        db_update_meeting_status(meeting_id=meeting_id, status="failed", error_message=err_msg)
        if job_id:
            db_update_job(job_id=job_id, status="failed", error=err_msg)
        db_record_system_event("error", "stt_failed", err_msg, meeting_id=meeting_id)
        return False

    # 4. Stage 3: Diarization (pyannote.audio)
    if job_id:
        db_update_job(job_id=job_id, status="diarizing")

    try:
        diarize_result = diarize(
            meeting_id=meeting_id,
            recordings_dir=recordings_dir,
            jobs_dir=jobs_dir,
        )
        db_save_speaker_turns(
            meeting_id=meeting_id,
            speaker_turns=diarize_result.get("speaker_turns", []),
        )
        logger.info("Diarization completed and saved to Supabase.")
    except Exception as exc:
        err_msg = f"Diarization failed: {exc}"
        logger.warning("%s. Continuing with fallback speaker.", err_msg)
        db_record_system_event("warning", "diarization_failed", err_msg, meeting_id=meeting_id)

    # 5. Stage 4: Merge Transcript + Speakers
    if job_id:
        db_update_job(job_id=job_id, status="merging")

    try:
        merge_result = merge_transcript_and_speakers(
            meeting_id=meeting_id,
            recordings_dir=recordings_dir,
            jobs_dir=jobs_dir,
        )
        logger.info("Transcript and speakers merged (%d turns).", len(merge_result.get("turns", [])))
        db_save_speaker_turns(
            meeting_id=meeting_id,
            speaker_turns=merge_result.get("turns", []),
        )
    except Exception as exc:
        err_msg = f"Merge failed: {exc}"
        logger.error(err_msg, exc_info=True)
        db_update_meeting_status(meeting_id=meeting_id, status="failed", error_message=err_msg)
        if job_id:
            db_update_job(job_id=job_id, status="failed", error=err_msg)
        db_record_system_event("error", "merge_failed", err_msg, meeting_id=meeting_id)
        return False

    # 6. Stage 5: MOM Generation
    if job_id:
        db_update_job(job_id=job_id, status="generating_mom")

    try:
        mom_result = generate_mom(
            meeting_id=meeting_id,
            recordings_dir=recordings_dir,
            jobs_dir=jobs_dir,
        )
        mom_file = rec_dir / "mom.md"
        mom_markdown = mom_file.read_text(encoding="utf-8") if mom_file.exists() else ""
        db_save_mom(
            meeting_id=meeting_id,
            mom_data=mom_result,
            mom_markdown=mom_markdown,
        )
        logger.info("MOM generated and saved to Supabase.")
    except Exception as exc:
        err_msg = f"MOM generation failed: {exc}"
        logger.error(err_msg, exc_info=True)
        db_update_meeting_status(meeting_id=meeting_id, status="failed", error_message=err_msg)
        if job_id:
            db_update_job(job_id=job_id, status="failed", error=err_msg)
        db_record_system_event("error", "mom_failed", err_msg, meeting_id=meeting_id)
        return False

    # 7. Stage 6: Delivery
    if job_id:
        db_update_job(job_id=job_id, status="delivering")

    try:
        deliver(
            meeting_id=meeting_id,
            recordings_dir=recordings_dir,
            jobs_dir=jobs_dir,
        )
    except Exception as exc:
        logger.warning("Delivery warning: %s", exc)

    # 8. Mark Completed
    ended_at = datetime.now(timezone.utc).isoformat()
    db_update_meeting_status(meeting_id=meeting_id, status="completed", ended_at=ended_at)
    if job_id:
        db_update_job(job_id=job_id, status="completed", completed_at=ended_at)

    db_record_system_event(
        level="info",
        event_type="meeting_completed",
        message=f"Meeting '{title}' completed successfully.",
        meeting_id=meeting_id,
    )
    logger.info("Pipeline completed successfully for meeting: %s", meeting_id)
    return True
