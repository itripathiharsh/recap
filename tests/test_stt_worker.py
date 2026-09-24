"""Unit and integration tests for src/stt_worker.py."""

import json
from pathlib import Path
import pytest
from src.job_state import JobStatus, create_job, get_job, update_job_status
from src.stt_worker import TranscriptionFailedError, transcribe


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


def test_transcribe_schema_and_job_state_mocked(temp_workspace: tuple[Path, Path]) -> None:
    """Verify transcribe writes schema matching SCHEMA.md §3 and updates job state to transcribed."""
    jobs_dir, recordings_dir = temp_workspace
    meeting_id = "test-stt-mock"

    create_job(
        meeting_id=meeting_id,
        meet_link="https://meet.google.com/abc-defg-hij",
        title="STT Mock Sync",
        scheduled_start="2026-09-20T10:00:00+05:30",
        jobs_dir=jobs_dir,
    )
    update_job_status(meeting_id, JobStatus.RECORDED.value, force=True, jobs_dir=jobs_dir)

    meeting_rec_dir = recordings_dir / meeting_id
    meeting_rec_dir.mkdir(parents=True, exist_ok=True)
    # Create non-empty dummy audio file
    (meeting_rec_dir / "audio.wav").write_bytes(b"RIFF" + b"\x00" * 100)

    def mock_transcribe_fn(audio_path: Path) -> tuple[list[dict], str]:
        return [
            {"start": 0.0, "end": 2.5, "text": "Hello world."},
            {"start": 2.6, "end": 5.0, "text": "This is a mock transcript."},
        ], "en"

    result = transcribe(
        meeting_id=meeting_id,
        recordings_dir=recordings_dir,
        jobs_dir=jobs_dir,
        transcribe_fn=mock_transcribe_fn,
    )

    assert result["meeting_id"] == meeting_id
    assert result["model"] in ("faster-whisper-small-int8", "injected_mock")
    assert result["language"] == "en"
    assert len(result["segments"]) == 2
    assert result["segments"][0]["text"] == "Hello world."
    assert result["segments"][0]["start"] == 0.0
    assert result["segments"][0]["end"] == 2.5

    # Check job state
    job = get_job(meeting_id, jobs_dir=jobs_dir)
    assert job["status"] == JobStatus.TRANSCRIBED.value

    # Check transcript.json on disk
    transcript_file = meeting_rec_dir / "transcript.json"
    assert transcript_file.is_file()
    saved = json.loads(transcript_file.read_text(encoding="utf-8"))
    assert saved == result


def test_transcribe_missing_audio_raises(temp_workspace: tuple[Path, Path]) -> None:
    """Verify missing audio file raises TranscriptionFailedError."""
    jobs_dir, recordings_dir = temp_workspace
    meeting_id = "missing-audio"
    create_job(
        meeting_id=meeting_id,
        meet_link="https://meet.google.com/abc-defg-hij",
        title="Missing Audio",
        scheduled_start="2026-09-20T10:00:00+05:30",
        jobs_dir=jobs_dir,
    )
    with pytest.raises(TranscriptionFailedError):
        transcribe(meeting_id, recordings_dir=recordings_dir, jobs_dir=jobs_dir)


def test_transcribe_empty_audio_raises(temp_workspace: tuple[Path, Path]) -> None:
    """Verify 0-byte audio file raises TranscriptionFailedError."""
    jobs_dir, recordings_dir = temp_workspace
    meeting_id = "empty-audio"
    create_job(
        meeting_id=meeting_id,
        meet_link="https://meet.google.com/abc-defg-hij",
        title="Empty Audio",
        scheduled_start="2026-09-20T10:00:00+05:30",
        jobs_dir=jobs_dir,
    )
    meeting_rec_dir = recordings_dir / meeting_id
    meeting_rec_dir.mkdir(parents=True, exist_ok=True)
    (meeting_rec_dir / "audio.wav").write_bytes(b"")

    with pytest.raises(TranscriptionFailedError):
        transcribe(meeting_id, recordings_dir=recordings_dir, jobs_dir=jobs_dir)


def test_real_faster_whisper_inference_against_sample_audio(
    fixtures_dir: Path,
    temp_workspace: tuple[Path, Path],
) -> None:
    """Integration test running real faster-whisper model against sample_audio.wav."""
    try:
        import faster_whisper
    except ImportError:
        pytest.skip("faster-whisper is not installed in the local environment")

    jobs_dir, recordings_dir = temp_workspace
    meeting_id = "real-whisper-test"

    create_job(
        meeting_id=meeting_id,
        meet_link="https://meet.google.com/abc-defg-hij",
        title="Real Audio Test",
        scheduled_start="2026-09-20T10:00:00+05:30",
        jobs_dir=jobs_dir,
    )
    update_job_status(meeting_id, JobStatus.RECORDED.value, force=True, jobs_dir=jobs_dir)

    meeting_rec_dir = recordings_dir / meeting_id
    meeting_rec_dir.mkdir(parents=True, exist_ok=True)
    sample_audio_src = fixtures_dir / "sample_audio.wav"
    assert sample_audio_src.exists(), "sample_audio.wav must exist in tests/fixtures"

    (meeting_rec_dir / "audio.wav").write_bytes(sample_audio_src.read_bytes())

    # Use 'tiny' model size for fast local testing
    result = transcribe(
        meeting_id=meeting_id,
        recordings_dir=recordings_dir,
        jobs_dir=jobs_dir,
        model_size="tiny",
    )

    assert result["meeting_id"] == meeting_id
    assert len(result["segments"]) > 0
    full_text = " ".join(s["text"] for s in result["segments"]).lower()
    # Confirm key words from our synthesized speech are present
    assert any(word in full_text for word in ["weekly", "sync", "reviewing", "login", "redesign", "deployment", "weekend"])

    job = get_job(meeting_id, jobs_dir=jobs_dir)
    assert job["status"] == JobStatus.TRANSCRIBED.value
