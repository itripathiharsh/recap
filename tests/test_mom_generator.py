"""Unit tests for src/mom_generator.py."""

import json
from pathlib import Path
import pytest
from src.job_state import JobStatus, create_job, get_job, update_job_status
from src.mom_generator import (
    MomGenerationFailedError,
    clean_and_parse_json,
    format_user_message,
    generate_mom,
    load_system_prompt,
)


@pytest.fixture
def fixtures_dir() -> Path:
    return Path("tests/fixtures")


@pytest.fixture
def prompt_path() -> Path:
    return Path("prompts/mom_prompt.md")


@pytest.fixture
def temp_workspace(tmp_path: Path) -> tuple[Path, Path]:
    jobs_dir = tmp_path / "data" / "jobs"
    recordings_dir = tmp_path / "data" / "recordings"
    jobs_dir.mkdir(parents=True, exist_ok=True)
    recordings_dir.mkdir(parents=True, exist_ok=True)
    return jobs_dir, recordings_dir


class MockProviderSuccess:
    """Mock LLM provider that returns a valid JSON response matching mom.sample.expected.json."""

    def __init__(self, response_text: str) -> None:
        self.response_text = response_text
        self.call_count = 0

    def complete(self, system_prompt: str, user_prompt: str, follow_up: str | None = None) -> str:
        self.call_count += 1
        return self.response_text


class MockProviderWithRetry:
    """Mock LLM provider that fails on first attempt and succeeds on retry."""

    def __init__(self, valid_response_text: str) -> None:
        self.valid_response_text = valid_response_text
        self.call_count = 0

    def complete(self, system_prompt: str, user_prompt: str, follow_up: str | None = None) -> str:
        self.call_count += 1
        if follow_up is None:
            # First attempt returns malformed/unparseable JSON
            return "Here is your MOM:\n```json\n{invalid_json: true\n```"
        # Follow-up retry returns valid JSON
        return self.valid_response_text


class MockProviderAlwaysFails:
    """Mock LLM provider that always fails."""

    def complete(self, system_prompt: str, user_prompt: str, follow_up: str | None = None) -> str:
        raise RuntimeError("API rate limit exceeded / 429 Too Many Requests")


def test_load_system_prompt_verbatim(prompt_path: Path) -> None:
    """Verify system prompt is loaded verbatim from prompts/mom_prompt.md."""
    prompt = load_system_prompt(prompt_path)
    assert "You are generating Minutes of Meeting (MOM) from a speaker-tagged meeting" in prompt
    assert "Return exactly this JSON shape:" in prompt
    assert '"summary": "2-4 sentence high-level summary' in prompt


def test_format_user_message() -> None:
    """Verify format_user_message serializes final.json turns correctly."""
    final_data = {
        "title": "Sprint Planning",
        "date": "2026-09-20",
        "turns": [
            {"speaker": "SPEAKER_00", "text": "Hello team."},
            {"speaker": "SPEAKER_01", "text": "Hi everyone."},
        ],
    }
    msg = format_user_message(final_data)
    assert msg.startswith("Meeting: Sprint Planning\nDate: 2026-09-20\n\nTranscript:")
    assert "[SPEAKER_00] Hello team." in msg
    assert "[SPEAKER_01] Hi everyone." in msg


def test_clean_and_parse_json_markdown_fences() -> None:
    """Verify code fences are stripped from LLM JSON responses."""
    raw = "```json\n{\"summary\": \"Test summary\", \"decisions\": []}\n```"
    data = clean_and_parse_json(raw)
    assert data["summary"] == "Test summary"
    assert data["decisions"] == []


def test_mom_generation_schema_validation(
    fixtures_dir: Path,
    prompt_path: Path,
    temp_workspace: tuple[Path, Path],
) -> None:
    """Verify generate_mom validates schema matching SCHEMA.md §6."""
    jobs_dir, recordings_dir = temp_workspace
    meeting_id = "sample-meeting-001"

    # Set up job in merged status
    create_job(
        meeting_id=meeting_id,
        meet_link="https://meet.google.com/abc-defg-hij",
        title="Weekly sync",
        scheduled_start="2026-09-20T10:00:00+05:30",
        jobs_dir=jobs_dir,
    )
    for s in [
        JobStatus.RECORDING.value,
        JobStatus.RECORDED.value,
        JobStatus.TRANSCRIBED.value,
        JobStatus.DIARIZED.value,
        JobStatus.MERGED.value,
    ]:
        update_job_status(meeting_id, s, jobs_dir=jobs_dir)

    # Set up final.json
    meeting_rec_dir = recordings_dir / meeting_id
    meeting_rec_dir.mkdir(parents=True, exist_ok=True)
    final_src = fixtures_dir / "final.sample.json"
    (meeting_rec_dir / "final.json").write_text(final_src.read_text(encoding="utf-8"), encoding="utf-8")

    # Use expected fixture content as mock LLM response
    expected_src = fixtures_dir / "mom.sample.expected.json"
    mock_provider = MockProviderSuccess(expected_src.read_text(encoding="utf-8"))

    result = generate_mom(
        meeting_id=meeting_id,
        recordings_dir=recordings_dir,
        jobs_dir=jobs_dir,
        prompt_path=prompt_path,
        provider=mock_provider,
    )

    # Verify SCHEMA.md §6 constraints:
    assert result["meeting_id"] == meeting_id
    assert isinstance(result["summary"], str)
    assert len(result["summary"]) > 0
    assert isinstance(result["decisions"], list)
    assert isinstance(result["open_questions"], list)
    assert isinstance(result["action_items"], list)

    for item in result["action_items"]:
        assert "task" in item and isinstance(item["task"], str)
        assert "owner" in item and isinstance(item["owner"], str)
        assert item["owner"] is not None and len(item["owner"]) > 0
        assert "due" in item and isinstance(item["due"], str)
        assert item["due"] is not None and len(item["due"]) > 0

    # Verify job status updated to mom_ready
    job = get_job(meeting_id, jobs_dir=jobs_dir)
    assert job["status"] == JobStatus.MOM_READY.value

    # Verify mom.json file created on disk
    assert (meeting_rec_dir / "mom.json").is_file()


def test_mom_generation_retries_on_invalid_json(
    fixtures_dir: Path,
    prompt_path: Path,
    temp_workspace: tuple[Path, Path],
) -> None:
    """Verify generate_mom performs 1 retry when initial response is invalid JSON."""
    jobs_dir, recordings_dir = temp_workspace
    meeting_id = "sample-meeting-retry"

    create_job(
        meeting_id=meeting_id,
        meet_link="https://meet.google.com/abc-defg-hij",
        title="Retry Sync",
        scheduled_start="2026-09-20T10:00:00+05:30",
        jobs_dir=jobs_dir,
    )
    update_job_status(meeting_id, JobStatus.MERGED.value, force=True, jobs_dir=jobs_dir)

    meeting_rec_dir = recordings_dir / meeting_id
    meeting_rec_dir.mkdir(parents=True, exist_ok=True)
    final_src = fixtures_dir / "final.sample.json"
    (meeting_rec_dir / "final.json").write_text(final_src.read_text(encoding="utf-8"), encoding="utf-8")

    expected_src = fixtures_dir / "mom.sample.expected.json"
    mock_retry_provider = MockProviderWithRetry(expected_src.read_text(encoding="utf-8"))

    result = generate_mom(
        meeting_id=meeting_id,
        recordings_dir=recordings_dir,
        jobs_dir=jobs_dir,
        prompt_path=prompt_path,
        provider=mock_retry_provider,
    )

    assert mock_retry_provider.call_count == 2
    assert result["meeting_id"] == meeting_id
    job = get_job(meeting_id, jobs_dir=jobs_dir)
    assert job["status"] == JobStatus.MOM_READY.value


def test_mom_generation_fails_when_providers_fail(
    fixtures_dir: Path,
    prompt_path: Path,
    temp_workspace: tuple[Path, Path],
) -> None:
    """Verify generate_mom raises MomGenerationFailedError and marks job failed."""
    jobs_dir, recordings_dir = temp_workspace
    meeting_id = "sample-meeting-fail"

    create_job(
        meeting_id=meeting_id,
        meet_link="https://meet.google.com/abc-defg-hij",
        title="Failing Sync",
        scheduled_start="2026-09-20T10:00:00+05:30",
        jobs_dir=jobs_dir,
    )
    update_job_status(meeting_id, JobStatus.MERGED.value, force=True, jobs_dir=jobs_dir)

    meeting_rec_dir = recordings_dir / meeting_id
    meeting_rec_dir.mkdir(parents=True, exist_ok=True)
    final_src = fixtures_dir / "final.sample.json"
    (meeting_rec_dir / "final.json").write_text(final_src.read_text(encoding="utf-8"), encoding="utf-8")

    mock_fail_provider = MockProviderAlwaysFails()

    with pytest.raises(MomGenerationFailedError):
        generate_mom(
            meeting_id=meeting_id,
            recordings_dir=recordings_dir,
            jobs_dir=jobs_dir,
            prompt_path=prompt_path,
            provider=mock_fail_provider,
        )

    job = get_job(meeting_id, jobs_dir=jobs_dir)
    assert job["status"] == JobStatus.FAILED.value
    assert "All MOM generation providers failed" in job["error"]
