"""Unit tests for src/merge.py."""

import json
from pathlib import Path
import pytest
from src.job_state import JobStatus, create_job, get_job
from src.merge import merge_transcript_and_speakers, MergeError


@pytest.fixture
def fixtures_dir() -> Path:
    """Path to test fixtures."""
    return Path("tests/fixtures")


@pytest.fixture
def temp_workspace(tmp_path: Path) -> tuple[Path, Path]:
    """Isolated jobs and recordings directories."""
    jobs_dir = tmp_path / "data" / "jobs"
    recordings_dir = tmp_path / "data" / "recordings"
    jobs_dir.mkdir(parents=True, exist_ok=True)
    recordings_dir.mkdir(parents=True, exist_ok=True)
    return jobs_dir, recordings_dir


def test_merge_sample_matches_final_fixture(fixtures_dir: Path, temp_workspace: tuple[Path, Path]) -> None:
    """Verify merging transcript.sample.json and speakers.sample.json produces final.sample.json."""
    jobs_dir, recordings_dir = temp_workspace
    meeting_id = "sample-meeting-001"

    # Create job state with title and date matching final.sample.json
    create_job(
        meeting_id=meeting_id,
        meet_link="https://meet.google.com/abc-defg-hij",
        title="Weekly sync",
        scheduled_start="2026-09-20T10:00:00+05:30",
        jobs_dir=jobs_dir,
    )
    # Advance job state to diarized so transition to merged is valid
    from src.job_state import update_job_status
    update_job_status(meeting_id, JobStatus.RECORDING.value, jobs_dir=jobs_dir)
    update_job_status(meeting_id, JobStatus.RECORDED.value, jobs_dir=jobs_dir)
    update_job_status(meeting_id, JobStatus.TRANSCRIBED.value, jobs_dir=jobs_dir)
    update_job_status(meeting_id, JobStatus.DIARIZED.value, jobs_dir=jobs_dir)

    # Set up recordings folder for meeting
    meeting_rec_dir = recordings_dir / meeting_id
    meeting_rec_dir.mkdir(parents=True, exist_ok=True)

    # Copy input fixtures into place
    transcript_src = fixtures_dir / "transcript.sample.json"
    speakers_src = fixtures_dir / "speakers.sample.json"
    expected_final_src = fixtures_dir / "final.sample.json"

    (meeting_rec_dir / "transcript.json").write_text(transcript_src.read_text(encoding="utf-8"), encoding="utf-8")
    (meeting_rec_dir / "speakers.json").write_text(speakers_src.read_text(encoding="utf-8"), encoding="utf-8")

    # Run merge
    result = merge_transcript_and_speakers(
        meeting_id=meeting_id,
        recordings_dir=recordings_dir,
        jobs_dir=jobs_dir,
    )

    # Compare against final.sample.json
    expected_final = json.loads(expected_final_src.read_text(encoding="utf-8"))
    assert result == expected_final

    # Verify job status was updated to merged
    updated_job = get_job(meeting_id, jobs_dir=jobs_dir)
    assert updated_job["status"] == JobStatus.MERGED.value


def test_merge_empty_speakers_fallback_to_unknown(fixtures_dir: Path, temp_workspace: tuple[Path, Path]) -> None:
    """Verify empty speaker_turns produces a single UNKNOWN speaker turn covering the transcript."""
    jobs_dir, recordings_dir = temp_workspace
    meeting_id = "sample-meeting-002-silent-diarization"

    create_job(
        meeting_id=meeting_id,
        meet_link="https://meet.google.com/abc-defg-hij",
        title="Silent Diarization Sync",
        scheduled_start="2026-09-20T11:00:00+05:30",
        jobs_dir=jobs_dir,
    )
    from src.job_state import update_job_status
    update_job_status(meeting_id, JobStatus.RECORDING.value, jobs_dir=jobs_dir)
    update_job_status(meeting_id, JobStatus.RECORDED.value, jobs_dir=jobs_dir)
    update_job_status(meeting_id, JobStatus.TRANSCRIBED.value, jobs_dir=jobs_dir)
    update_job_status(meeting_id, JobStatus.DIARIZED.value, jobs_dir=jobs_dir)

    meeting_rec_dir = recordings_dir / meeting_id
    meeting_rec_dir.mkdir(parents=True, exist_ok=True)

    # Use transcript.sample.json with speakers.sample.empty.json
    transcript_src = fixtures_dir / "transcript.sample.json"
    speakers_empty_src = fixtures_dir / "speakers.sample.empty.json"

    (meeting_rec_dir / "transcript.json").write_text(transcript_src.read_text(encoding="utf-8"), encoding="utf-8")
    (meeting_rec_dir / "speakers.json").write_text(speakers_empty_src.read_text(encoding="utf-8"), encoding="utf-8")

    result = merge_transcript_and_speakers(
        meeting_id=meeting_id,
        recordings_dir=recordings_dir,
        jobs_dir=jobs_dir,
    )

    # Verify UNKNOWN speaker turn
    turns = result["turns"]
    assert len(turns) == 1
    assert turns[0]["speaker"] == "UNKNOWN"
    assert turns[0]["start"] == 0.0
    assert turns[0]["end"] == 44.0
    assert "Okay let's get started with the weekly sync." in turns[0]["text"]
    assert "that's all for today." in turns[0]["text"]

    # Verify job status
    updated_job = get_job(meeting_id, jobs_dir=jobs_dir)
    assert updated_job["status"] == JobStatus.MERGED.value


def test_merge_missing_input_raises(temp_workspace: tuple[Path, Path]) -> None:
    """Verify missing input files raise MergeError."""
    jobs_dir, recordings_dir = temp_workspace
    with pytest.raises(MergeError):
        merge_transcript_and_speakers("missing_job", recordings_dir=recordings_dir, jobs_dir=jobs_dir)
