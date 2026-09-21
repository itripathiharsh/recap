"""Audio retention and cleanup worker.

Per PHASE 3:
- Audio recordings (audio.wav and temp files) on the worker are retained for 7 days maximum.
- After 7 days, audio is deleted automatically to preserve local disk space.
- Never deletes structured metadata, transcripts, speaker turns, final transcripts, or MOMs.
- Supports configurable retention days, dry-run mode, and detailed logging.
"""

import argparse
from datetime import datetime, timezone
import logging
import os
from pathlib import Path
import time
from typing import Any

logger = logging.getLogger("cleanup")

DEFAULT_RECORDINGS_DIR = Path("data/recordings")
DEFAULT_RETENTION_DAYS = int(os.getenv("RETENTION_DAYS", "7"))

# File extensions / names targeted for cleanup
AUDIO_TARGET_NAMES = {"audio.wav", "audio.pcm", "test_pulse.wav", "test_capture.wav"}
AUDIO_TARGET_EXTS = {".tmp", ".part"}

# Files that must NEVER be deleted
PROTECTED_NAMES = {
    "transcript.json",
    "speakers.json",
    "final.json",
    "mom.json",
    "mom.md",
}


def clean_audio_recordings(
    recordings_dir: Path | None = None,
    retention_days: int | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Scan recordings directory and delete audio files older than retention threshold.

    Args:
        recordings_dir: Path to data/recordings directory.
        retention_days: Max age in days before audio is eligible for deletion.
        dry_run: If True, simulate deletions without modifying disk.

    Returns:
        Dictionary report of scanned, deleted, preserved files and bytes freed.
    """
    rec_dir = recordings_dir if recordings_dir is not None else DEFAULT_RECORDINGS_DIR
    days = retention_days if retention_days is not None else DEFAULT_RETENTION_DAYS
    cutoff_seconds = days * 86400.0
    now = time.time()

    report: dict[str, Any] = {
        "retention_days": days,
        "dry_run": dry_run,
        "scanned_meetings": 0,
        "files_deleted": [],
        "bytes_freed": 0,
        "errors": [],
    }

    if not rec_dir.exists():
        logger.info("Recordings directory does not exist: %s", rec_dir)
        return report

    for meeting_path in rec_dir.iterdir():
        if not meeting_path.is_dir():
            continue

        report["scanned_meetings"] += 1

        for file_path in meeting_path.iterdir():
            if not file_path.is_file():
                continue

            filename = file_path.name

            # Strictly protect structured data
            if filename in PROTECTED_NAMES or filename.endswith(".json") or filename.endswith(".md"):
                continue

            # Check if this file is an audio or temporary file
            is_target = filename in AUDIO_TARGET_NAMES or file_path.suffix in AUDIO_TARGET_EXTS or filename.startswith("test_")
            if not is_target:
                continue

            try:
                stat = file_path.stat()
                age_seconds = now - stat.st_mtime

                if age_seconds >= cutoff_seconds:
                    file_size = stat.st_size
                    if dry_run:
                        logger.info("[DRY-RUN] Would delete: %s (%.2f MB, age: %.1f days)", file_path, file_size / (1024 * 1024), age_seconds / 86400)
                    else:
                        file_path.unlink()
                        logger.info("Deleted expired audio: %s (%.2f MB, age: %.1f days)", file_path, file_size / (1024 * 1024), age_seconds / 86400)

                    report["files_deleted"].append(str(file_path))
                    report["bytes_freed"] += file_size
            except Exception as exc:
                err_msg = f"Error processing {file_path}: {exc}"
                logger.error(err_msg)
                report["errors"].append(err_msg)

    logger.info(
        "Cleanup completed (%s): %d files, %.2f MB freed across %d meetings",
        "dry-run" if dry_run else "executed",
        len(report["files_deleted"]),
        report["bytes_freed"] / (1024 * 1024),
        report["scanned_meetings"],
    )

    return report


def main() -> None:
    """CLI entrypoint for src/cleanup.py."""
    parser = argparse.ArgumentParser(description="Clean up expired meeting audio recordings")
    parser.add_argument("--retention-days", type=int, default=None, help=f"Retention threshold in days (default: {DEFAULT_RETENTION_DAYS})")
    parser.add_argument("--dry-run", action="store_true", help="Simulate deletion without removing files")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")

    report = clean_audio_recordings(
        retention_days=args.retention_days,
        dry_run=args.dry_run,
    )
    print(f"Cleanup report: {report}")


if __name__ == "__main__":
    main()
