"""Job state management and transition enforcement.

This module is the single authority for reading, writing, and validating
job state files under `data/jobs/{meeting_id}.json`. No other module may
mutate a job's status without going through this helper.
"""

from datetime import datetime, timezone
from enum import StrEnum
import json
import logging
from pathlib import Path
from typing import Any
from pydantic import BaseModel, ConfigDict, Field, ValidationError

logger = logging.getLogger(__name__)

# Default base directory for job state files
DEFAULT_JOBS_DIR = Path("data/jobs")


class JobStatus(StrEnum):
    """Allowed job states in the pipeline."""

    PENDING = "pending"
    RECORDING = "recording"
    RECORDED = "recorded"
    TRANSCRIBED = "transcribed"
    DIARIZED = "diarized"
    MERGED = "merged"
    MOM_READY = "mom_ready"
    DELIVERED = "delivered"
    FAILED = "failed"


# Valid linear forward transitions: current_status -> set of allowed next statuses
VALID_TRANSITIONS: dict[JobStatus, set[JobStatus]] = {
    JobStatus.PENDING: {JobStatus.RECORDING, JobStatus.FAILED},
    JobStatus.RECORDING: {JobStatus.RECORDED, JobStatus.FAILED},
    JobStatus.RECORDED: {JobStatus.TRANSCRIBED, JobStatus.FAILED},
    JobStatus.TRANSCRIBED: {JobStatus.DIARIZED, JobStatus.FAILED},
    JobStatus.DIARIZED: {JobStatus.MERGED, JobStatus.FAILED},
    JobStatus.MERGED: {JobStatus.MOM_READY, JobStatus.FAILED},
    JobStatus.MOM_READY: {JobStatus.DELIVERED, JobStatus.FAILED},
    JobStatus.DELIVERED: set(),  # terminal state
    JobStatus.FAILED: set(),  # terminal state
}

# Order of states in the pipeline for stage comparison
STAGE_ORDER: list[JobStatus] = [
    JobStatus.PENDING,
    JobStatus.RECORDING,
    JobStatus.RECORDED,
    JobStatus.TRANSCRIBED,
    JobStatus.DIARIZED,
    JobStatus.MERGED,
    JobStatus.MOM_READY,
    JobStatus.DELIVERED,
]


class Job(BaseModel):
    """Schema for data/jobs/{meeting_id}.json adhering strictly to SCHEMA.md."""

    model_config = ConfigDict(extra="forbid")

    meeting_id: str
    meet_link: str
    calendar_event_id: str | None = None
    title: str
    scheduled_start: str
    status: JobStatus
    created_at: str
    updated_at: str
    error: str | None = None
    retry_count: int = Field(default=0, ge=0)


class JobStateError(Exception):
    """Base exception for job state operations."""


class JobNotFoundError(JobStateError, FileNotFoundError):
    """Raised when a job file does not exist on disk."""


class InvalidTransitionError(JobStateError, ValueError):
    """Raised when a status transition violates the state machine order."""


class JobValidationError(JobStateError, ValueError):
    """Raised when job JSON does not adhere to the required schema."""


def _get_job_file_path(meeting_id: str, jobs_dir: Path | None = None) -> Path:
    """Return the filesystem path for a meeting's job JSON file.

    Args:
        meeting_id: Unique identifier for the meeting.
        jobs_dir: Optional override directory for jobs (defaults to data/jobs).

    Returns:
        Path object pointing to the job file.
    """
    directory = jobs_dir if jobs_dir is not None else DEFAULT_JOBS_DIR
    return directory / f"{meeting_id}.json"


def _now_iso() -> str:
    """Return current UTC time formatted as an ISO 8601 string with timezone."""
    return datetime.now(timezone.utc).isoformat()


def validate_transition(current_status: str, new_status: str) -> bool:
    """Enforce the state machine order defined in ARCHITECTURE.md §4.

    Args:
        current_status: The current status of the job.
        new_status: The desired next status.

    Returns:
        True if the transition is allowed.

    Raises:
        InvalidTransitionError: If new_status does not follow current_status.
    """
    try:
        curr = JobStatus(current_status)
    except ValueError as exc:
        raise InvalidTransitionError(f"Unknown current status: {current_status}") from exc

    try:
        nxt = JobStatus(new_status)
    except ValueError as exc:
        raise InvalidTransitionError(f"Unknown target status: {new_status}") from exc

    allowed_targets = VALID_TRANSITIONS.get(curr, set())
    if nxt not in allowed_targets:
        raise InvalidTransitionError(
            f"Invalid state transition from '{curr}' to '{nxt}'. Allowed transitions: {sorted([s.value for s in allowed_targets])}"
        )
    return True


def create_job(
    meeting_id: str,
    meet_link: str,
    title: str,
    scheduled_start: str,
    calendar_event_id: str | None = None,
    jobs_dir: Path | None = None,
) -> dict[str, Any]:
    """Create a new job JSON file in data/jobs/ with status 'pending'.

    Args:
        meeting_id: Unique filesystem-safe meeting ID.
        meet_link: Full Google Meet URL.
        title: Meeting title for MOM and notification headers.
        scheduled_start: Scheduled start time (ISO 8601 string with timezone).
        calendar_event_id: Google Calendar event ID, or None if explicit link.
        jobs_dir: Optional override for the jobs storage directory.

    Returns:
        Dictionary representation of the created job.

    Raises:
        FileExistsError: If a job with meeting_id already exists.
        JobValidationError: If initial job data fails schema validation.
    """
    path = _get_job_file_path(meeting_id, jobs_dir=jobs_dir)
    if path.exists():
        raise FileExistsError(f"Job already exists at {path}")

    now = _now_iso()
    raw_job = {
        "meeting_id": meeting_id,
        "meet_link": meet_link,
        "calendar_event_id": calendar_event_id,
        "title": title,
        "scheduled_start": scheduled_start,
        "status": JobStatus.PENDING.value,
        "created_at": now,
        "updated_at": now,
        "error": None,
        "retry_count": 0,
    }

    try:
        validated_job = Job(**raw_job)
    except ValidationError as exc:
        raise JobValidationError(f"Failed to create valid job schema: {exc}") from exc

    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_suffix(".json.tmp")
    with open(temp_path, "w", encoding="utf-8") as f:
        json.dump(validated_job.model_dump(), f, indent=2)
    temp_path.replace(path)

    logger.info("Created job %s at %s with status %s", meeting_id, path, JobStatus.PENDING)
    return validated_job.model_dump()


def get_job(meeting_id: str, jobs_dir: Path | None = None) -> dict[str, Any]:
    """Read and validate a job JSON file from disk.

    Args:
        meeting_id: Unique identifier for the meeting.
        jobs_dir: Optional override for the jobs directory.

    Returns:
        Dictionary representing the validated job.

    Raises:
        JobNotFoundError: If the job file does not exist.
        JobValidationError: If the file contents violate SCHEMA.md.
    """
    path = _get_job_file_path(meeting_id, jobs_dir=jobs_dir)
    if not path.exists():
        raise JobNotFoundError(f"Job file not found at {path}")

    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except json.JSONDecodeError as exc:
        raise JobValidationError(f"Job file at {path} contains invalid JSON: {exc}") from exc

    try:
        validated = Job(**data)
    except ValidationError as exc:
        raise JobValidationError(f"Job file at {path} does not match SCHEMA.md: {exc}") from exc

    return validated.model_dump()


def update_job_status(
    meeting_id: str,
    new_status: str,
    error: str | None = None,
    force: bool = False,
    jobs_dir: Path | None = None,
) -> None:
    """Update job status with strict transition validation and atomic write.

    Args:
        meeting_id: Unique identifier for the meeting.
        new_status: Desired new status string.
        error: Optional specific error message if transitioning to 'failed' or delivery fallback.
        force: If True, bypass normal linear sequence and increment retry_count.
        jobs_dir: Optional override for jobs directory.

    Raises:
        JobNotFoundError: If the job file does not exist.
        InvalidTransitionError: If the transition is illegal and force is False.
        JobValidationError: If the resulting job state violates schema.
    """
    job_data = get_job(meeting_id, jobs_dir=jobs_dir)
    current_status = job_data["status"]

    if not force:
        validate_transition(current_status, new_status)
    else:
        # Validate that the requested status is a recognized JobStatus enum
        try:
            JobStatus(new_status)
        except ValueError as exc:
            raise InvalidTransitionError(f"Unknown status: {new_status}") from exc
        job_data["retry_count"] += 1
        logger.warning(
            "Forced status transition for job %s from %s to %s (retry_count=%d)",
            meeting_id,
            current_status,
            new_status,
            job_data["retry_count"],
        )

    job_data["status"] = new_status
    job_data["updated_at"] = _now_iso()
    if error is not None:
        job_data["error"] = error
    elif new_status != JobStatus.FAILED.value and not (
        new_status == JobStatus.DELIVERED.value and job_data.get("error")
    ):
        # Clear error if transitioning cleanly to non-failed state (unless existing delivery warning)
        job_data["error"] = None

    try:
        validated = Job(**job_data)
    except ValidationError as exc:
        raise JobValidationError(f"Updated job data violates schema: {exc}") from exc

    path = _get_job_file_path(meeting_id, jobs_dir=jobs_dir)
    temp_path = path.with_suffix(".json.tmp")
    with open(temp_path, "w", encoding="utf-8") as f:
        json.dump(validated.model_dump(), f, indent=2)
    temp_path.replace(path)

    logger.info(
        "Job %s transitioned from %s to %s (error=%s)",
        meeting_id,
        current_status,
        new_status,
        job_data.get("error"),
    )


def job_exists(meeting_id: str, jobs_dir: Path | None = None) -> bool:
    """Check whether a job JSON file exists on disk.

    Args:
        meeting_id: Unique identifier for the meeting.
        jobs_dir: Optional override for jobs directory.

    Returns:
        True if the job file exists, False otherwise.
    """
    path = _get_job_file_path(meeting_id, jobs_dir=jobs_dir)
    return path.is_file()


def list_jobs(jobs_dir: Path | None = None) -> list[dict[str, Any]]:
    """List all jobs currently stored in the jobs directory.

    Args:
        jobs_dir: Optional override for jobs directory.

    Returns:
        List of validated job dictionaries.
    """
    directory = jobs_dir if jobs_dir is not None else DEFAULT_JOBS_DIR
    if not directory.exists():
        return []

    jobs: list[dict[str, Any]] = []
    for file_path in sorted(directory.glob("*.json")):
        if file_path.name.endswith(".tmp"):
            continue
        try:
            meeting_id = file_path.stem
            jobs.append(get_job(meeting_id, jobs_dir=directory))
        except (JobValidationError, JobNotFoundError) as exc:
            logger.error("Skipping corrupted or unreadable job file %s: %exc", file_path, exc)
    return jobs


def list_non_terminal_jobs(jobs_dir: Path | None = None) -> list[dict[str, Any]]:
    """List all jobs that are not in a terminal state ('delivered' or 'failed').

    Used by the scheduler on boot/restart to discover jobs that need to be resumed.

    Args:
        jobs_dir: Optional override for jobs directory.

    Returns:
        List of jobs in pending, recording, recorded, transcribed, diarized, merged, or mom_ready status.
    """
    terminal_statuses = {JobStatus.DELIVERED.value, JobStatus.FAILED.value}
    all_jobs = list_jobs(jobs_dir=jobs_dir)
    return [j for j in all_jobs if j["status"] not in terminal_statuses]
