"""Merge transcript segments and speaker diarization into a unified final transcript.

This module reads `transcript.json` (from faster-whisper) and `speakers.json`
(from pyannote) and produces `final.json` with timestamp-aligned,
speaker-tagged turns.
"""

from datetime import datetime
import json
import logging
from pathlib import Path
from typing import Any
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from src.job_state import (
    JobStatus,
    get_job,
    update_job_status,
)

logger = logging.getLogger(__name__)

DEFAULT_RECORDINGS_DIR = Path("data/recordings")
DEFAULT_JOBS_DIR = Path("data/jobs")


class Turn(BaseModel):
    """A single speaker's turn with text and timestamps."""

    model_config = ConfigDict(extra="forbid")

    speaker: str
    start: float = Field(..., ge=0.0)
    end: float = Field(..., ge=0.0)
    text: str


class FinalTranscript(BaseModel):
    """Schema for final.json matching SCHEMA.md §5."""

    model_config = ConfigDict(extra="forbid")

    meeting_id: str
    title: str
    date: str  # YYYY-MM-DD
    turns: list[Turn]


class MergeError(Exception):
    """Base exception for transcript and speaker merge errors."""


def _calculate_overlap(seg_start: float, seg_end: float, turn_start: float, turn_end: float) -> float:
    """Calculate temporal overlap duration between two intervals.

    Args:
        seg_start: Start timestamp of segment in seconds.
        seg_end: End timestamp of segment in seconds.
        turn_start: Start timestamp of speaker turn in seconds.
        turn_end: End timestamp of speaker turn in seconds.

    Returns:
        Overlap in seconds (0.0 if no overlap).
    """
    return max(0.0, min(seg_end, turn_end) - max(seg_start, turn_start))


def _find_closest_turn_index(seg_start: float, seg_end: float, speaker_turns: list[dict[str, Any]]) -> int:
    """Find the index of the speaker turn closest in time to a segment.

    Used as fallback when a segment falls in a gap between speaker turns.

    Args:
        seg_start: Start timestamp of segment.
        seg_end: End timestamp of segment.
        speaker_turns: List of speaker turn dicts with start and end keys.

    Returns:
        Index of the closest speaker turn in speaker_turns.
    """
    min_dist = float("inf")
    best_idx = 0
    seg_mid = (seg_start + seg_end) / 2.0

    for idx, turn in enumerate(speaker_turns):
        turn_start = turn["start"]
        turn_end = turn["end"]
        if seg_mid < turn_start:
            dist = turn_start - seg_mid
        elif seg_mid > turn_end:
            dist = seg_mid - turn_end
        else:
            dist = 0.0

        if dist < min_dist:
            min_dist = dist
            best_idx = idx

    return best_idx


def merge_transcript_and_speakers(
    meeting_id: str,
    recordings_dir: Path | None = None,
    jobs_dir: Path | None = None,
    force: bool = False,
) -> dict[str, Any]:
    """Combine transcript.json and speakers.json into final.json.

    Reads data/recordings/{meeting_id}/transcript.json and
    data/recordings/{meeting_id}/speakers.json. Updates job status to 'merged'.

    Handles edge cases:
      - Empty speaker_turns in speakers.json: produces a single 'UNKNOWN' speaker turn
        covering the full transcript (SCHEMA.md §5).

    Args:
        meeting_id: Unique identifier for the meeting.
        recordings_dir: Optional directory containing recordings (defaults to data/recordings).
        jobs_dir: Optional directory containing jobs (defaults to data/jobs).
        force: If True, bypass status checks.

    Returns:
        Dictionary representation of the validated final.json.

    Raises:
        MergeError: If required input files are missing, unreadable, or invalid.
    """
    rec_dir = (recordings_dir if recordings_dir is not None else DEFAULT_RECORDINGS_DIR) / meeting_id
    transcript_path = rec_dir / "transcript.json"
    speakers_path = rec_dir / "speakers.json"
    final_path = rec_dir / "final.json"

    if not transcript_path.exists():
        raise MergeError(f"Transcript file not found: {transcript_path}")
    if not speakers_path.exists():
        raise MergeError(f"Speakers file not found: {speakers_path}")

    # Read and parse input files
    try:
        with open(transcript_path, "r", encoding="utf-8") as f:
            transcript_data = json.load(f)
    except json.JSONDecodeError as exc:
        raise MergeError(f"Invalid JSON in transcript file {transcript_path}: {exc}") from exc

    try:
        with open(speakers_path, "r", encoding="utf-8") as f:
            speakers_data = json.load(f)
    except json.JSONDecodeError as exc:
        raise MergeError(f"Invalid JSON in speakers file {speakers_path}: {exc}") from exc

    # Retrieve meeting title and date from job state if available
    title = "Meeting"
    date_str = datetime.now().strftime("%Y-%m-%d")
    try:
        job = get_job(meeting_id, jobs_dir=jobs_dir)
        current_status = job.get("status")
        if not force and current_status != JobStatus.DIARIZED.value:
            logger.warning(
                "Job %s is in status '%s', expected '%s'",
                meeting_id,
                current_status,
                JobStatus.DIARIZED.value,
            )
        if "title" in job and job["title"]:
            title = job["title"]
        if "scheduled_start" in job and job["scheduled_start"]:
            # Parse ISO date string (YYYY-MM-DD)
            date_str = job["scheduled_start"][:10]
    except Exception as exc:
        logger.warning("Could not load job info for %s: %s; using defaults", meeting_id, exc)

    segments = transcript_data.get("segments", [])
    speaker_turns = speakers_data.get("speaker_turns", [])

    turns: list[dict[str, Any]] = []

    # Edge Case: Zero speaker turns (pyannote failed or silent audio)
    if not speaker_turns:
        logger.warning("No speaker turns found for meeting %s. Using UNKNOWN-speaker fallback.", meeting_id)
        if segments:
            combined_text = " ".join(s.get("text", "").strip() for s in segments if s.get("text"))
            turns.append({
                "speaker": "UNKNOWN",
                "start": float(segments[0].get("start", 0.0)),
                "end": float(segments[-1].get("end", 0.0)),
                "text": combined_text,
            })
        else:
            # Completely empty transcript
            turns = []
    else:
        # Map each segment to the best speaker turn
        turn_segments: dict[int, list[dict[str, Any]]] = {i: [] for i in range(len(speaker_turns))}

        for seg in segments:
            seg_start = float(seg.get("start", 0.0))
            seg_end = float(seg.get("end", 0.0))

            best_turn_idx = -1
            max_overlap = 0.0

            for t_idx, turn in enumerate(speaker_turns):
                t_start = float(turn.get("start", 0.0))
                t_end = float(turn.get("end", 0.0))
                overlap = _calculate_overlap(seg_start, seg_end, t_start, t_end)
                if overlap > max_overlap:
                    max_overlap = overlap
                    best_turn_idx = t_idx

            if best_turn_idx == -1 or max_overlap == 0.0:
                # Segment didn't overlap directly with any turn; assign to closest turn
                best_turn_idx = _find_closest_turn_index(seg_start, seg_end, speaker_turns)

            turn_segments[best_turn_idx].append(seg)

        # Assemble merged turns in chronological order
        for t_idx, turn in enumerate(speaker_turns):
            assigned_segs = turn_segments[t_idx]
            if not assigned_segs:
                continue

            # Join segment text with single space
            turn_text = " ".join(s.get("text", "").strip() for s in assigned_segs if s.get("text"))
            if not turn_text:
                continue

            turns.append({
                "speaker": turn.get("speaker", "UNKNOWN"),
                "start": float(turn.get("start", 0.0)),
                "end": float(turn.get("end", 0.0)),
                "text": turn_text,
            })

    # Resolve generic speaker tags (SPEAKER_00, etc.) to real participant names
    try:
        from src.speaker_resolver import resolve_speaker_names
        turns, _ = resolve_speaker_names(turns, meeting_id=meeting_id)
    except Exception as exc:
        logger.warning("Speaker resolution skipped: %s", exc)

    final_payload = {
        "meeting_id": meeting_id,
        "title": title,
        "date": date_str,
        "turns": turns,
    }

    try:
        validated = FinalTranscript(**final_payload)
    except ValidationError as exc:
        raise MergeError(f"Merged output violates SCHEMA.md §5: {exc}") from exc

    # Write output file atomically
    rec_dir.mkdir(parents=True, exist_ok=True)
    temp_final = final_path.with_suffix(".json.tmp")
    with open(temp_final, "w", encoding="utf-8") as f:
        json.dump(validated.model_dump(), f, indent=2)
    temp_final.replace(final_path)

    logger.info("Successfully wrote final.json for meeting %s with %d turns", meeting_id, len(turns))

    # Update job state to 'merged'
    try:
        update_job_status(meeting_id, JobStatus.MERGED.value, force=force, jobs_dir=jobs_dir)
    except Exception as exc:
        logger.warning("Could not update job status for %s to 'merged': %s", meeting_id, exc)

    return validated.model_dump()
