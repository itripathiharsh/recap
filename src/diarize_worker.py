"""Speaker diarization worker using pyannote.audio.

Identifies speaker turns in data/recordings/{meeting_id}/audio.wav
and writes structured data/recordings/{meeting_id}/speakers.json.
Updates job status to 'diarized'.
"""

import json
import logging
import os
from pathlib import Path
from typing import Any, Callable
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from src.job_state import (
    JobStatus,
    get_job,
    update_job_status,
)

logger = logging.getLogger(__name__)

DEFAULT_RECORDINGS_DIR = Path("data/recordings")
DEFAULT_JOBS_DIR = Path("data/jobs")
DEFAULT_DIARIZATION_MODEL = "pyannote/speaker-diarization-3.1"


class SpeakerTurn(BaseModel):
    """Schema for individual speaker turn in speakers.json."""

    model_config = ConfigDict(extra="forbid")

    start: float = Field(..., ge=0.0)
    end: float = Field(..., ge=0.0)
    speaker: str


class Speakers(BaseModel):
    """Schema for speakers.json matching SCHEMA.md §4."""

    model_config = ConfigDict(extra="forbid")

    meeting_id: str
    model: str
    speaker_turns: list[SpeakerTurn]


class DiarizationError(Exception):
    """Base exception for diarization errors."""


def _get_pyannote_pipeline(model_name: str, hf_token: str | None = None) -> Any:
    """Load pyannote speaker-diarization pipeline using Hugging Face token.

    Args:
        model_name: Model identifier on Hugging Face hub.
        hf_token: Hugging Face read token (defaults to HUGGINGFACE_TOKEN env var).

    Returns:
        Loaded pyannote Pipeline instance.

    Raises:
        DiarizationError: If pyannote.audio is not installed or token is missing.
    """
    token = hf_token or os.getenv("HUGGINGFACE_TOKEN", "")
    if not token:
        raise DiarizationError("HUGGINGFACE_TOKEN is not set; pyannote model is gated.")

    try:
        from pyannote.audio import Pipeline
        return Pipeline.from_pretrained(model_name, use_auth_token=token)
    except ImportError as exc:
        raise DiarizationError(
            "pyannote.audio is not installed. Install dependencies per requirements.txt."
        ) from exc
    except Exception as exc:
        raise DiarizationError(f"Failed to load pyannote pipeline '{model_name}': {exc}") from exc


def diarize(
    meeting_id: str,
    recordings_dir: Path | None = None,
    jobs_dir: Path | None = None,
    model_name: str | None = None,
    hf_token: str | None = None,
    force: bool = False,
    diarize_fn: Callable[[Path], list[dict[str, Any]]] | None = None,
) -> dict[str, Any]:
    """Perform speaker diarization on meeting audio.

    Input: data/recordings/{meeting_id}/audio.wav (job must be status='transcribed')
    Output: data/recordings/{meeting_id}/speakers.json (schema: SCHEMA.md §4)
    Updates job status to 'diarized'.

    Per API_SPECS.md §1: On pyannote failure, does NOT fail the whole job.
    Instead writes an empty speaker_turns list and updates status to 'diarized'
    so merge.py's UNKNOWN-speaker fallback can handle it.

    Args:
        meeting_id: Unique identifier for the meeting.
        recordings_dir: Optional directory containing recordings.
        jobs_dir: Optional directory containing jobs.
        model_name: Optional model identifier (defaults to pyannote/speaker-diarization-3.1).
        hf_token: Optional Hugging Face token override.
        force: If True, bypass status checks.
        diarize_fn: Optional mock function for testing returning speaker turn dicts.

    Returns:
        Dictionary representation of validated speakers.json.
    """
    rec_dir = (recordings_dir if recordings_dir is not None else DEFAULT_RECORDINGS_DIR) / meeting_id
    audio_path = rec_dir / "audio.wav"
    speakers_path = rec_dir / "speakers.json"
    used_model = model_name or DEFAULT_DIARIZATION_MODEL

    # Verify job state
    try:
        job = get_job(meeting_id, jobs_dir=jobs_dir)
        current_status = job.get("status")
        if not force and current_status != JobStatus.TRANSCRIBED.value:
            logger.warning(
                "Job %s is in status '%s', expected '%s'",
                meeting_id,
                current_status,
                JobStatus.TRANSCRIBED.value,
            )
    except Exception as exc:
        logger.warning("Could not read job state for %s: %s", meeting_id, exc)

    speaker_turns: list[dict[str, Any]] = []

    if not audio_path.exists():
        logger.error("Audio file not found at %s. Writing empty speaker turns.", audio_path)
    else:
        try:
            if diarize_fn is not None:
                # Use injected diarization function (for unit tests)
                speaker_turns = diarize_fn(audio_path)
            else:
                pipeline = _get_pyannote_pipeline(used_model, hf_token=hf_token)
                diarization_result = pipeline(str(audio_path))
                for turn, _, speaker in diarization_result.itertracks(yield_label=True):
                    speaker_turns.append({
                        "start": round(float(turn.start), 2),
                        "end": round(float(turn.end), 2),
                        "speaker": str(speaker),
                    })
        except Exception as exc:
            # Fallback path per API_SPECS.md §1: log warning, write empty turns, do not fail job
            logger.warning(
                "Pyannote diarization failed for meeting %s: %s. Proceeding with empty speaker turns fallback.",
                meeting_id,
                exc,
            )
            speaker_turns = []

    speakers_payload = {
        "meeting_id": meeting_id,
        "model": used_model,
        "speaker_turns": speaker_turns,
    }

    try:
        validated = Speakers(**speakers_payload)
    except ValidationError as exc:
        logger.error("Speakers payload validation failed: %s", exc)
        validated = Speakers(meeting_id=meeting_id, model=used_model, speaker_turns=[])

    # Write output file atomically
    rec_dir.mkdir(parents=True, exist_ok=True)
    temp_speakers = speakers_path.with_suffix(".json.tmp")
    with open(temp_speakers, "w", encoding="utf-8") as f:
        json.dump(validated.model_dump(), f, indent=2)
    temp_speakers.replace(speakers_path)

    logger.info(
        "Successfully wrote speakers.json for %s with %d speaker turns",
        meeting_id,
        len(validated.speaker_turns),
    )

    # Update job status to 'diarized'
    try:
        update_job_status(meeting_id, JobStatus.DIARIZED.value, force=force, jobs_dir=jobs_dir)
    except Exception as exc:
        logger.warning("Could not update job status for %s to 'diarized': %s", meeting_id, exc)

    return validated.model_dump()
