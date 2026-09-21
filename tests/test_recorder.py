"""Unit tests for src/recorder.py."""

import os
from pathlib import Path
import sys
import time
import pytest
from src.job_state import JobStatus, create_job, get_job, update_job_status
from src.recorder import (
    RecordingFailedError,
    _check_bot_removed,
    start_recording,
)


@pytest.fixture
def temp_workspace(tmp_path: Path) -> tuple[Path, Path]:
    jobs_dir = tmp_path / "data" / "jobs"
    recordings_dir = tmp_path / "data" / "recordings"
    jobs_dir.mkdir(parents=True, exist_ok=True)
    recordings_dir.mkdir(parents=True, exist_ok=True)
    return jobs_dir, recordings_dir


class MockLocator:
    def __init__(self, count_val: int) -> None:
        self.count_val = count_val

    def count(self) -> int:
        return self.count_val


class MockPage:
    def __init__(self, closed: bool = False, url: str = "https://meet.google.com/abc-defg-hij", removed: bool = False) -> None:
        self._closed = closed
        self.url = url
        self._removed = removed

    def is_closed(self) -> bool:
        return self._closed

    def locator(self, selector: str) -> MockLocator:
        if self._removed:
            return MockLocator(1)
        return MockLocator(0)


def test_check_bot_removed() -> None:
    """Verify bot removal detection logic across page states."""
    # None page
    assert not _check_bot_removed(None)

    # Active page in call
    normal_page = MockPage()
    assert not _check_bot_removed(normal_page)

    # Closed page
    closed_page = MockPage(closed=True)
    assert _check_bot_removed(closed_page)

    # Navigated away URL
    navigated_page = MockPage(url="https://myaccount.google.com")
    assert _check_bot_removed(navigated_page)

    # Removal notification dialog
    removed_page = MockPage(removed=True)
    assert _check_bot_removed(removed_page)


def test_recorder_max_duration_cap(temp_workspace: tuple[Path, Path]) -> None:
    """Verify recording stops cleanly when max_minutes duration cap is reached."""
    jobs_dir, recordings_dir = temp_workspace
    meeting_id = "test-duration-cap"

    create_job(
        meeting_id=meeting_id,
        meet_link="https://meet.google.com/abc-defg-hij",
        title="Duration Cap Test",
        scheduled_start="2026-09-20T10:00:00+05:30",
        jobs_dir=jobs_dir,
    )
    update_job_status(meeting_id, JobStatus.RECORDING.value, force=True, jobs_dir=jobs_dir)

    target_audio = recordings_dir / meeting_id / "audio.wav"

    # Simulated ffmpeg command using Python: writes valid audio header and sleeps
    simulated_cmd = [
        sys.executable,
        "-c",
        f"import time, pathlib; p = pathlib.Path(r'{target_audio}'); p.parent.mkdir(parents=True, exist_ok=True); p.write_bytes(b'RIFF' + b'\\x00'*500); time.sleep(10)",
    ]

    start_t = time.time()
    # Set cap to 0.05 minutes (~3 seconds)
    audio_path = start_recording(
        meeting_id=meeting_id,
        max_minutes=0.05,  # 3 seconds
        recordings_dir=recordings_dir,
        jobs_dir=jobs_dir,
        ffmpeg_cmd_override=simulated_cmd,
    )
    elapsed = time.time() - start_t

    assert elapsed >= 2.5
    assert elapsed < 7.0
    assert audio_path.exists()
    assert audio_path.stat().st_size > 0

    job = get_job(meeting_id, jobs_dir=jobs_dir)
    assert job["status"] == JobStatus.RECORDED.value


def test_recorder_removed_from_call_stops_recording(temp_workspace: tuple[Path, Path]) -> None:
    """Verify recording stops promptly when page indicates bot was removed."""
    jobs_dir, recordings_dir = temp_workspace
    meeting_id = "test-removal-stop"

    create_job(
        meeting_id=meeting_id,
        meet_link="https://meet.google.com/abc-defg-hij",
        title="Removal Stop Test",
        scheduled_start="2026-09-20T10:00:00+05:30",
        jobs_dir=jobs_dir,
    )
    update_job_status(meeting_id, JobStatus.RECORDING.value, force=True, jobs_dir=jobs_dir)

    target_audio = recordings_dir / meeting_id / "audio.wav"

    # Simulated ffmpeg process that writes audio immediately then stays open
    simulated_cmd = [
        sys.executable,
        "-u",
        "-c",
        f"import pathlib, time; p = pathlib.Path(r'{target_audio}'); p.parent.mkdir(parents=True, exist_ok=True); p.write_bytes(b'RIFF' + b'\\x00'*500); time.sleep(20)",
    ]

    # Page that triggers removal after 1 second
    class MockDelayedRemovalPage:
        def __init__(self, delay: float = 1.0) -> None:
            self.start_t = time.time()
            self.delay = delay
            self.url = "https://meet.google.com/abc-defg-hij"

        def is_closed(self) -> bool:
            return time.time() - self.start_t >= self.delay

        def locator(self, selector: str) -> MockLocator:
            if time.time() - self.start_t >= self.delay:
                return MockLocator(1)
            return MockLocator(0)

    mock_removed_page = MockDelayedRemovalPage(delay=1.0)

    start_t = time.time()
    audio_path = start_recording(
        meeting_id=meeting_id,
        max_minutes=90,
        page=mock_removed_page,
        recordings_dir=recordings_dir,
        jobs_dir=jobs_dir,
        ffmpeg_cmd_override=simulated_cmd,
    )
    elapsed = time.time() - start_t

    # Should stop in ~1-4 seconds due to removal detection
    assert elapsed >= 1.0
    assert elapsed < 6.0
    assert audio_path.exists()

    job = get_job(meeting_id, jobs_dir=jobs_dir)
    assert job["status"] == JobStatus.RECORDED.value


def test_recorder_missing_audio_file_raises(temp_workspace: tuple[Path, Path]) -> None:
    """Verify RecordingFailedError is raised if no audio file is produced."""
    jobs_dir, recordings_dir = temp_workspace
    meeting_id = "test-fail-missing"

    create_job(
        meeting_id=meeting_id,
        meet_link="https://meet.google.com/abc-defg-hij",
        title="Fail Missing Test",
        scheduled_start="2026-09-20T10:00:00+05:30",
        jobs_dir=jobs_dir,
    )
    update_job_status(meeting_id, JobStatus.RECORDING.value, force=True, jobs_dir=jobs_dir)

    # Simulated ffmpeg process that exits immediately without writing audio
    simulated_cmd = [
        sys.executable,
        "-c",
        "import time; time.sleep(0.5)",
    ]

    with pytest.raises(RecordingFailedError):
        start_recording(
            meeting_id=meeting_id,
            max_minutes=0.01,
            recordings_dir=recordings_dir,
            jobs_dir=jobs_dir,
            ffmpeg_cmd_override=simulated_cmd,
        )

    job = get_job(meeting_id, jobs_dir=jobs_dir)
    assert job["status"] == JobStatus.FAILED.value
