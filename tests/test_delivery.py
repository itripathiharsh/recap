"""Unit tests for src/delivery.py."""

import json
from pathlib import Path
import pytest
from src.delivery import DeliveryError, deliver, render_markdown
from src.job_state import JobStatus, create_job, get_job, update_job_status


@pytest.fixture
def fixtures_dir() -> Path:
    return Path("tests/fixtures")


@pytest.fixture
def temp_workspace(tmp_path: Path) -> tuple[Path, Path]:
    jobs_dir = tmp_path / "data" / "jobs"
    recordings_dir = tmp_path / "data" / "recordings"
    jobs_dir.mkdir(parents=True, exist_ok=True)
    recordings_dir.mkdir(parents=True, exist_ok=True)
    return jobs_dir, recordings_dir


def test_render_markdown() -> None:
    """Verify render_markdown creates properly formatted markdown with tables and lists."""
    mom_data = {
        "meeting_id": "test-meet-123",
        "summary": "Team reviewed Q3 progress and aligned on deliverables.",
        "decisions": ["Deploy on Monday", "Hold off on refactor"],
        "action_items": [
            {"task": "Prepare release notes", "owner": "Alice", "due": "Friday"},
            {"task": "Run load tests", "owner": "unassigned", "due": "not specified"},
        ],
        "open_questions": ["Will staging environment be available?"],
    }

    md = render_markdown(mom_data, title="Sprint Review", date="2026-09-21")

    assert "# Minutes of Meeting: Sprint Review" in md
    assert "**Date:** 2026-09-21" in md
    assert "`test-meet-123`" in md
    assert "## Summary\nTeam reviewed Q3 progress" in md
    assert "- Deploy on Monday" in md
    assert "- Hold off on refactor" in md
    assert "| Prepare release notes | Alice | Friday |" in md
    assert "| Run load tests | unassigned | not specified |" in md
    assert "- Will staging environment be available?" in md


def test_deliver_local_file_fallback_on_email_failure(
    fixtures_dir: Path,
    temp_workspace: tuple[Path, Path],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Verify that when email fails, mom.md is written and job status becomes delivered with fallback error note."""
    jobs_dir, recordings_dir = temp_workspace
    meeting_id = "test-delivery-fallback"

    monkeypatch.setenv("OWNER_EMAIL", "owner@example.com")

    # Set up job in mom_ready state
    create_job(
        meeting_id=meeting_id,
        meet_link="https://meet.google.com/abc-defg-hij",
        title="Delivery Fallback Test",
        scheduled_start="2026-09-21T10:00:00+05:30",
        jobs_dir=jobs_dir,
    )
    update_job_status(meeting_id, JobStatus.MOM_READY.value, force=True, jobs_dir=jobs_dir)

    meeting_rec_dir = recordings_dir / meeting_id
    meeting_rec_dir.mkdir(parents=True, exist_ok=True)
    expected_mom = fixtures_dir / "mom.sample.expected.json"
    (meeting_rec_dir / "mom.json").write_text(expected_mom.read_text(encoding="utf-8"), encoding="utf-8")

    def mock_failing_sender(subject: str, body: str, recipient: str, creds: Path) -> None:
        raise ConnectionError("Failed to connect to Gmail API server")

    result = deliver(
        meeting_id=meeting_id,
        recordings_dir=recordings_dir,
        jobs_dir=jobs_dir,
        send_fn=mock_failing_sender,
    )

    assert result["meeting_id"] == meeting_id
    assert result["delivered_via"] == "local_file_fallback"
    assert "email failed, file saved locally" in result["email_status"]

    # Verify mom.md exists on disk and is non-empty
    mom_md_path = meeting_rec_dir / "mom.md"
    assert mom_md_path.is_file()
    assert len(mom_md_path.read_text(encoding="utf-8")) > 50

    # Verify job status is 'delivered' (NOT 'failed' per API_SPECS.md §1)
    job = get_job(meeting_id, jobs_dir=jobs_dir)
    assert job["status"] == JobStatus.DELIVERED.value
    assert "email failed, file saved locally" in job["error"]


def test_deliver_successful_mocked_email(
    fixtures_dir: Path,
    temp_workspace: tuple[Path, Path],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Verify that when email succeeds, job status becomes delivered with no error."""
    jobs_dir, recordings_dir = temp_workspace
    meeting_id = "test-delivery-success"

    monkeypatch.setenv("OWNER_EMAIL", "owner@example.com")

    create_job(
        meeting_id=meeting_id,
        meet_link="https://meet.google.com/abc-defg-hij",
        title="Delivery Success Test",
        scheduled_start="2026-09-21T10:00:00+05:30",
        jobs_dir=jobs_dir,
    )
    update_job_status(meeting_id, JobStatus.MOM_READY.value, force=True, jobs_dir=jobs_dir)

    meeting_rec_dir = recordings_dir / meeting_id
    meeting_rec_dir.mkdir(parents=True, exist_ok=True)
    expected_mom = fixtures_dir / "mom.sample.expected.json"
    (meeting_rec_dir / "mom.json").write_text(expected_mom.read_text(encoding="utf-8"), encoding="utf-8")

    sent_calls = []

    def mock_successful_sender(subject: str, body: str, recipient: str, creds: Path) -> None:
        sent_calls.append({"subject": subject, "body": body, "recipient": recipient})

    result = deliver(
        meeting_id=meeting_id,
        recordings_dir=recordings_dir,
        jobs_dir=jobs_dir,
        send_fn=mock_successful_sender,
    )

    assert result["delivered_via"] == "email"
    assert result["email_status"] == "sent"
    assert len(sent_calls) == 1
    assert "MOM: Delivery Success Test" in sent_calls[0]["subject"]
    assert sent_calls[0]["recipient"] == "owner@example.com"

    job = get_job(meeting_id, jobs_dir=jobs_dir)
    assert job["status"] == JobStatus.DELIVERED.value
    assert job["error"] is None


def test_deliver_missing_mom_json_raises(temp_workspace: tuple[Path, Path]) -> None:
    """Verify deliver raises DeliveryError if mom.json is missing."""
    jobs_dir, recordings_dir = temp_workspace
    meeting_id = "test-delivery-missing"

    create_job(
        meeting_id=meeting_id,
        meet_link="https://meet.google.com/abc-defg-hij",
        title="Missing MOM Test",
        scheduled_start="2026-09-21T10:00:00+05:30",
        jobs_dir=jobs_dir,
    )
    update_job_status(meeting_id, JobStatus.MOM_READY.value, force=True, jobs_dir=jobs_dir)

    with pytest.raises(DeliveryError):
        deliver(meeting_id=meeting_id, recordings_dir=recordings_dir, jobs_dir=jobs_dir)
