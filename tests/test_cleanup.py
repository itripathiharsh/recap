"""Unit tests for src/cleanup.py."""

import os
from pathlib import Path
import time
import pytest
from src.cleanup import clean_audio_recordings


@pytest.fixture
def temp_recordings_dir(tmp_path: Path) -> Path:
    rec_dir = tmp_path / "data" / "recordings"
    rec_dir.mkdir(parents=True, exist_ok=True)
    return rec_dir


def test_cleanup_deletes_expired_audio_preserves_metadata(temp_recordings_dir: Path) -> None:
    """Verify audio older than 7 days is deleted while all metadata is preserved."""
    meeting_dir = temp_recordings_dir / "test-meeting-old"
    meeting_dir.mkdir(parents=True, exist_ok=True)

    audio_file = meeting_dir / "audio.wav"
    audio_file.write_bytes(b"RIFF" + b"\x00" * 1000)

    transcript_file = meeting_dir / "transcript.json"
    transcript_file.write_text('{"segments": []}', encoding="utf-8")

    mom_file = meeting_dir / "mom.md"
    mom_file.write_text("# Meeting MOM", encoding="utf-8")

    # Artificially set mtime to 8 days ago
    eight_days_ago = time.time() - (8 * 86400)
    os.utime(audio_file, (eight_days_ago, eight_days_ago))
    os.utime(transcript_file, (eight_days_ago, eight_days_ago))
    os.utime(mom_file, (eight_days_ago, eight_days_ago))

    report = clean_audio_recordings(
        recordings_dir=temp_recordings_dir,
        retention_days=7,
        dry_run=False,
    )

    assert len(report["files_deleted"]) == 1
    assert str(audio_file) in report["files_deleted"]
    assert report["bytes_freed"] == 1004

    # Audio must be deleted
    assert not audio_file.exists()

    # Metadata must remain intact
    assert transcript_file.exists()
    assert mom_file.exists()


def test_cleanup_preserves_recent_audio(temp_recordings_dir: Path) -> None:
    """Verify audio younger than retention threshold is preserved."""
    meeting_dir = temp_recordings_dir / "test-meeting-recent"
    meeting_dir.mkdir(parents=True, exist_ok=True)

    audio_file = meeting_dir / "audio.wav"
    audio_file.write_bytes(b"RIFF" + b"\x00" * 500)

    # mtime is current time (< 7 days)
    report = clean_audio_recordings(
        recordings_dir=temp_recordings_dir,
        retention_days=7,
        dry_run=False,
    )

    assert len(report["files_deleted"]) == 0
    assert audio_file.exists()


def test_cleanup_dry_run_does_not_delete(temp_recordings_dir: Path) -> None:
    """Verify dry_run identifies files to delete without modifying disk."""
    meeting_dir = temp_recordings_dir / "test-meeting-dry-run"
    meeting_dir.mkdir(parents=True, exist_ok=True)

    audio_file = meeting_dir / "audio.wav"
    audio_file.write_bytes(b"RIFF" + b"\x00" * 200)

    ten_days_ago = time.time() - (10 * 86400)
    os.utime(audio_file, (ten_days_ago, ten_days_ago))

    report = clean_audio_recordings(
        recordings_dir=temp_recordings_dir,
        retention_days=7,
        dry_run=True,
    )

    assert len(report["files_deleted"]) == 1
    assert str(audio_file) in report["files_deleted"]

    # File still exists because of dry_run=True
    assert audio_file.exists()
