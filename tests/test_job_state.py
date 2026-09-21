"""Unit tests for src/job_state.py."""

from pathlib import Path
import pytest
from src.job_state import (
    JobStatus,
    InvalidTransitionError,
    JobNotFoundError,
    JobValidationError,
    create_job,
    get_job,
    job_exists,
    list_jobs,
    list_non_terminal_jobs,
    update_job_status,
    validate_transition,
)


@pytest.fixture
def temp_jobs_dir(tmp_path: Path) -> Path:
    """Fixture providing an isolated temporary jobs directory."""
    jobs_dir = tmp_path / "data" / "jobs"
    jobs_dir.mkdir(parents=True, exist_ok=True)
    return jobs_dir


def test_create_job_success(temp_jobs_dir: Path) -> None:
    """Verify job creation produces valid schema matching SCHEMA.md."""
    job = create_job(
        meeting_id="meeting_123",
        meet_link="https://meet.google.com/abc-defg-hij",
        title="Weekly Sync",
        scheduled_start="2026-09-20T10:00:00+05:30",
        calendar_event_id="cal_event_123",
        jobs_dir=temp_jobs_dir,
    )

    assert job["meeting_id"] == "meeting_123"
    assert job["meet_link"] == "https://meet.google.com/abc-defg-hij"
    assert job["calendar_event_id"] == "cal_event_123"
    assert job["title"] == "Weekly Sync"
    assert job["scheduled_start"] == "2026-09-20T10:00:00+05:30"
    assert job["status"] == JobStatus.PENDING.value
    assert job["error"] is None
    assert job["retry_count"] == 0
    assert "created_at" in job
    assert "updated_at" in job
    assert job_exists("meeting_123", jobs_dir=temp_jobs_dir)


def test_create_duplicate_job_raises(temp_jobs_dir: Path) -> None:
    """Verify creating a job with an existing meeting_id raises FileExistsError."""
    create_job(
        meeting_id="meeting_dup",
        meet_link="https://meet.google.com/abc-defg-hij",
        title="Sync",
        scheduled_start="2026-09-20T10:00:00+05:30",
        jobs_dir=temp_jobs_dir,
    )
    with pytest.raises(FileExistsError):
        create_job(
            meeting_id="meeting_dup",
            meet_link="https://meet.google.com/abc-defg-hij",
            title="Sync",
            scheduled_start="2026-09-20T10:00:00+05:30",
            jobs_dir=temp_jobs_dir,
        )


def test_linear_state_transitions(temp_jobs_dir: Path) -> None:
    """Verify full forward state progression from pending to delivered."""
    meeting_id = "meeting_flow"
    create_job(
        meeting_id=meeting_id,
        meet_link="https://meet.google.com/abc-defg-hij",
        title="Full Flow",
        scheduled_start="2026-09-20T10:00:00+05:30",
        jobs_dir=temp_jobs_dir,
    )

    steps = [
        JobStatus.RECORDING.value,
        JobStatus.RECORDED.value,
        JobStatus.TRANSCRIBED.value,
        JobStatus.DIARIZED.value,
        JobStatus.MERGED.value,
        JobStatus.MOM_READY.value,
        JobStatus.DELIVERED.value,
    ]

    for next_status in steps:
        update_job_status(meeting_id, next_status, jobs_dir=temp_jobs_dir)
        current_job = get_job(meeting_id, jobs_dir=temp_jobs_dir)
        assert current_job["status"] == next_status
        assert current_job["error"] is None


def test_invalid_transitions(temp_jobs_dir: Path) -> None:
    """Verify that jumping over states or going backwards raises InvalidTransitionError."""
    meeting_id = "meeting_invalid"
    create_job(
        meeting_id=meeting_id,
        meet_link="https://meet.google.com/abc-defg-hij",
        title="Invalid Test",
        scheduled_start="2026-09-20T10:00:00+05:30",
        jobs_dir=temp_jobs_dir,
    )

    # Cannot skip from pending to recorded
    with pytest.raises(InvalidTransitionError):
        update_job_status(meeting_id, JobStatus.RECORDED.value, jobs_dir=temp_jobs_dir)

    # Advance to recording
    update_job_status(meeting_id, JobStatus.RECORDING.value, jobs_dir=temp_jobs_dir)

    # Cannot transition backward from recording to pending
    with pytest.raises(InvalidTransitionError):
        update_job_status(meeting_id, JobStatus.PENDING.value, jobs_dir=temp_jobs_dir)


def test_transition_to_failed_from_any_state(temp_jobs_dir: Path) -> None:
    """Verify that any non-terminal state can transition to failed."""
    statuses_to_test = [
        JobStatus.PENDING,
        JobStatus.RECORDING,
        JobStatus.RECORDED,
        JobStatus.TRANSCRIBED,
        JobStatus.DIARIZED,
        JobStatus.MERGED,
        JobStatus.MOM_READY,
    ]

    for idx, status in enumerate(statuses_to_test):
        mid = f"fail_test_{idx}"
        create_job(
            meeting_id=mid,
            meet_link="https://meet.google.com/abc-defg-hij",
            title=f"Fail {status}",
            scheduled_start="2026-09-20T10:00:00+05:30",
            jobs_dir=temp_jobs_dir,
        )
        if status != JobStatus.PENDING:
            # Force advance to the target test state
            update_job_status(mid, status.value, force=True, jobs_dir=temp_jobs_dir)

        # Transition to failed with error message
        error_msg = f"Failed at {status}"
        update_job_status(mid, JobStatus.FAILED.value, error=error_msg, jobs_dir=temp_jobs_dir)
        job = get_job(mid, jobs_dir=temp_jobs_dir)
        assert job["status"] == JobStatus.FAILED.value
        assert job["error"] == error_msg


def test_terminal_states_cannot_transition(temp_jobs_dir: Path) -> None:
    """Verify that terminal states (delivered, failed) cannot transition further."""
    mid_delivered = "terminal_delivered"
    create_job(
        meeting_id=mid_delivered,
        meet_link="https://meet.google.com/abc-defg-hij",
        title="Delivered",
        scheduled_start="2026-09-20T10:00:00+05:30",
        jobs_dir=temp_jobs_dir,
    )
    update_job_status(mid_delivered, JobStatus.DELIVERED.value, force=True, jobs_dir=temp_jobs_dir)

    with pytest.raises(InvalidTransitionError):
        update_job_status(mid_delivered, JobStatus.PENDING.value, jobs_dir=temp_jobs_dir)

    with pytest.raises(InvalidTransitionError):
        update_job_status(mid_delivered, JobStatus.FAILED.value, jobs_dir=temp_jobs_dir)


def test_forced_transition_increments_retry_count(temp_jobs_dir: Path) -> None:
    """Verify that force=True bypasses normal rules and increments retry_count."""
    meeting_id = "meeting_force"
    create_job(
        meeting_id=meeting_id,
        meet_link="https://meet.google.com/abc-defg-hij",
        title="Force Test",
        scheduled_start="2026-09-20T10:00:00+05:30",
        jobs_dir=temp_jobs_dir,
    )

    update_job_status(meeting_id, JobStatus.TRANSCRIBED.value, force=True, jobs_dir=temp_jobs_dir)
    job = get_job(meeting_id, jobs_dir=temp_jobs_dir)
    assert job["status"] == JobStatus.TRANSCRIBED.value
    assert job["retry_count"] == 1

    # Force again
    update_job_status(meeting_id, JobStatus.RECORDED.value, force=True, jobs_dir=temp_jobs_dir)
    job = get_job(meeting_id, jobs_dir=temp_jobs_dir)
    assert job["status"] == JobStatus.RECORDED.value
    assert job["retry_count"] == 2


def test_get_nonexistent_job_raises(temp_jobs_dir: Path) -> None:
    """Verify get_job raises JobNotFoundError for non-existent IDs."""
    with pytest.raises(JobNotFoundError):
        get_job("non_existent_id", jobs_dir=temp_jobs_dir)


def test_corrupted_job_file_raises_validation_error(temp_jobs_dir: Path) -> None:
    """Verify invalid JSON or invalid schema raises JobValidationError."""
    corrupted_file = temp_jobs_dir / "corrupted.json"
    corrupted_file.write_text("{invalid json", encoding="utf-8")

    with pytest.raises(JobValidationError):
        get_job("corrupted", jobs_dir=temp_jobs_dir)

    invalid_schema_file = temp_jobs_dir / "invalid_schema.json"
    invalid_schema_file.write_text('{"meeting_id": "inv", "status": "unknown"}', encoding="utf-8")

    with pytest.raises(JobValidationError):
        get_job("invalid_schema", jobs_dir=temp_jobs_dir)


def test_list_jobs_and_non_terminal(temp_jobs_dir: Path) -> None:
    """Verify list_jobs and list_non_terminal_jobs correctly identify active jobs."""
    # Create 3 jobs: one pending, one recorded, one delivered, one failed
    create_job("j_pending", "https://meet.google.com/a", "P", "2026-09-20T10:00:00Z", jobs_dir=temp_jobs_dir)
    create_job("j_recorded", "https://meet.google.com/b", "R", "2026-09-20T10:00:00Z", jobs_dir=temp_jobs_dir)
    update_job_status("j_recorded", JobStatus.RECORDING.value, jobs_dir=temp_jobs_dir)
    update_job_status("j_recorded", JobStatus.RECORDED.value, jobs_dir=temp_jobs_dir)

    create_job("j_delivered", "https://meet.google.com/c", "D", "2026-09-20T10:00:00Z", jobs_dir=temp_jobs_dir)
    update_job_status("j_delivered", JobStatus.DELIVERED.value, force=True, jobs_dir=temp_jobs_dir)

    create_job("j_failed", "https://meet.google.com/d", "F", "2026-09-20T10:00:00Z", jobs_dir=temp_jobs_dir)
    update_job_status("j_failed", JobStatus.FAILED.value, error="Test error", jobs_dir=temp_jobs_dir)

    all_jobs = list_jobs(jobs_dir=temp_jobs_dir)
    assert len(all_jobs) == 4

    active_jobs = list_non_terminal_jobs(jobs_dir=temp_jobs_dir)
    active_ids = {j["meeting_id"] for j in active_jobs}
    assert active_ids == {"j_pending", "j_recorded"}
