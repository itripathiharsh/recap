"""Unit and integration tests for src/diarize_worker.py."""

import json
import os
from pathlib import Path
import pytest
from src.diarize_worker import diarize
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


def test_diarize_schema_and_job_state_mocked(temp_workspace: tuple[Path, Path]) -> None:
    """Verify diarize writes schema matching SCHEMA.md §4 and updates job state to diarized."""
    jobs_dir, recordings_dir = temp_workspace
    meeting_id = "test-diarize-mock"

    create_job(
        meeting_id=meeting_id,
        meet_link="https://meet.google.com/abc-defg-hij",
        title="Diarize Mock Sync",
        scheduled_start="2026-09-20T10:00:00+05:30",
        jobs_dir=jobs_dir,
    )
    update_job_status(meeting_id, JobStatus.TRANSCRIBED.value, force=True, jobs_dir=jobs_dir)

    meeting_rec_dir = recordings_dir / meeting_id
    meeting_rec_dir.mkdir(parents=True, exist_ok=True)
    (meeting_rec_dir / "audio.wav").write_bytes(b"RIFF" + b"\x00" * 100)

    def mock_diarize_fn(audio_path: Path) -> list[dict]:
        return [
            {"start": 0.0, "end": 5.1, "speaker": "SPEAKER_00"},
            {"start": 5.1, "end": 12.4, "speaker": "SPEAKER_01"},
        ]

    result = diarize(
        meeting_id=meeting_id,
        recordings_dir=recordings_dir,
        jobs_dir=jobs_dir,
        diarize_fn=mock_diarize_fn,
    )

    assert result["meeting_id"] == meeting_id
    assert result["model"] == "pyannote/speaker-diarization-3.1"
    assert len(result["speaker_turns"]) == 2
    assert result["speaker_turns"][0]["speaker"] == "SPEAKER_00"
    assert result["speaker_turns"][0]["start"] == 0.0
    assert result["speaker_turns"][0]["end"] == 5.1

    # Check job state
    job = get_job(meeting_id, jobs_dir=jobs_dir)
    assert job["status"] == JobStatus.DIARIZED.value

    # Check speakers.json on disk
    speakers_file = meeting_rec_dir / "speakers.json"
    assert speakers_file.is_file()
    saved = json.loads(speakers_file.read_text(encoding="utf-8"))
    assert saved == result


def test_diarize_failure_fallback_writes_empty_turns(temp_workspace: tuple[Path, Path]) -> None:
    """Verify that on pyannote failure, diarize does not fail the job, but writes empty turns."""
    jobs_dir, recordings_dir = temp_workspace
    meeting_id = "test-diarize-fail-fallback"

    create_job(
        meeting_id=meeting_id,
        meet_link="https://meet.google.com/abc-defg-hij",
        title="Diarize Fallback Sync",
        scheduled_start="2026-09-20T10:00:00+05:30",
        jobs_dir=jobs_dir,
    )
    update_job_status(meeting_id, JobStatus.TRANSCRIBED.value, force=True, jobs_dir=jobs_dir)

    meeting_rec_dir = recordings_dir / meeting_id
    meeting_rec_dir.mkdir(parents=True, exist_ok=True)
    (meeting_rec_dir / "audio.wav").write_bytes(b"RIFF" + b"\x00" * 100)

    def mock_failing_diarize_fn(audio_path: Path) -> list[dict]:
        raise RuntimeError("Pyannote CUDA out of memory / pipeline error")

    result = diarize(
        meeting_id=meeting_id,
        recordings_dir=recordings_dir,
        jobs_dir=jobs_dir,
        diarize_fn=mock_failing_diarize_fn,
    )

    # Must produce empty turns
    assert result["speaker_turns"] == []

    # Job status must be diarized (not failed)
    job = get_job(meeting_id, jobs_dir=jobs_dir)
    assert job["status"] == JobStatus.DIARIZED.value


def test_real_pyannote_inference_against_sample_audio(
    fixtures_dir: Path,
    temp_workspace: tuple[Path, Path],
) -> None:
    """Integration test running real pyannote model against sample_audio.wav if token & package exist."""
    hf_token = os.getenv("HUGGINGFACE_TOKEN")
    if not hf_token:
        pytest.skip("HUGGINGFACE_TOKEN is not set; skipping real pyannote model test")

    try:
        import pyannote.audio
    except ImportError:
        pytest.skip("pyannote.audio is not installed; skipping real pyannote model test")

    jobs_dir, recordings_dir = temp_workspace
    meeting_id = "real-pyannote-test"

    create_job(
        meeting_id=meeting_id,
        meet_link="https://meet.google.com/abc-defg-hij",
        title="Real Diarize Audio Test",
        scheduled_start="2026-09-20T10:00:00+05:30",
        jobs_dir=jobs_dir,
    )
    update_job_status(meeting_id, JobStatus.TRANSCRIBED.value, force=True, jobs_dir=jobs_dir)

    meeting_rec_dir = recordings_dir / meeting_id
    meeting_rec_dir.mkdir(parents=True, exist_ok=True)
    sample_audio_src = fixtures_dir / "sample_audio.wav"
    (meeting_rec_dir / "audio.wav").write_bytes(sample_audio_src.read_bytes())

    result = diarize(
        meeting_id=meeting_id,
        recordings_dir=recordings_dir,
        jobs_dir=jobs_dir,
        hf_token=hf_token,
    )

    assert result["meeting_id"] == meeting_id
    assert "speaker_turns" in result
    job = get_job(meeting_id, jobs_dir=jobs_dir)
    assert job["status"] == JobStatus.DIARIZED.value
