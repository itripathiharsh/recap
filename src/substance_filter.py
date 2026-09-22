"""Meeting substance evaluator and waste data gatekeeper.

Validates whether a recorded call contains genuine, substantive discussion
before invoking expensive downstream AI stages (pyannote diarization, LLM MOM).
Discards empty calls, accidental joins, mic clicks, and Whisper hallucinations on silence.
"""

import logging
from pathlib import Path
from typing import Any
import wave

logger = logging.getLogger(__name__)

# Common Whisper hallucinations on silence or short clicks
PHANTOM_PATTERNS = {
    "में",
    "you",
    "thank you.",
    "thank you",
    "thanks for watching",
    "thanks for watching.",
    "subtitles by",
    "amara.org",
    "bye",
    "[music]",
    "[applause]",
    "yeah",
    "ok",
}

# Minimum thresholds for a valid meeting
MIN_AUDIO_DURATION_SECONDS = 45.0
MIN_WORD_COUNT_SHORT_CALL = 20
MIN_WORD_COUNT_ABSOLUTE = 12
MIN_SPEECH_DURATION_SECONDS = 4.0


def get_audio_duration_seconds(audio_path: Path) -> float:
    """Extract audio duration in seconds from WAV header."""
    try:
        with wave.open(str(audio_path), "rb") as wf:
            frames = wf.getnframes()
            rate = wf.getframerate()
            return frames / float(rate) if rate > 0 else 0.0
    except Exception as exc:
        logger.debug("Failed to read WAV duration for %s: %s", audio_path, exc)
        return 0.0


def evaluate_meeting_substance(
    audio_path: Path | None,
    stt_result: dict[str, Any],
) -> tuple[bool, str]:
    """Evaluate whether meeting has sufficient genuine conversation.

    Args:
        audio_path: Path to the audio file on disk (if available).
        stt_result: Transcription dictionary containing segments and text.

    Returns:
        tuple of (is_substantive: bool, reason: str).
    """
    segments = stt_result.get("segments", [])

    # Extract all text tokens
    full_text_list: list[str] = []
    total_speech_duration = 0.0

    for seg in segments:
        text = str(seg.get("text", "")).strip()
        if text:
            full_text_list.append(text)
        start = float(seg.get("start", 0.0))
        end = float(seg.get("end", 0.0))
        if end > start:
            total_speech_duration += (end - start)

    full_text = " ".join(full_text_list).strip()
    words = [w for w in full_text.split() if w]
    total_words = len(words)

    # Audio duration from file
    audio_duration = get_audio_duration_seconds(audio_path) if audio_path and audio_path.exists() else 0.0
    if audio_duration == 0.0 and segments:
        audio_duration = max(float(seg.get("end", 0.0)) for seg in segments)

    clean_text_lower = full_text.lower().strip()

    # Rule 1: Whisper phantom hallucination detection on single short sound
    if total_words <= 3:
        if clean_text_lower in PHANTOM_PATTERNS or len(clean_text_lower) <= 5:
            return (
                False,
                f"Phantom noise / mic blip detected ('{full_text}', {total_words} word(s)). Not a genuine meeting.",
            )

    # Rule 2: Absolute minimum word count
    if total_words < MIN_WORD_COUNT_ABSOLUTE:
        return (
            False,
            f"Insufficient spoken dialogue ({total_words} words detected, minimum {MIN_WORD_COUNT_ABSOLUTE} required).",
        )

    # Rule 3: Short call requires higher density of conversation
    if audio_duration > 0 and audio_duration < MIN_AUDIO_DURATION_SECONDS:
        if total_words < MIN_WORD_COUNT_SHORT_CALL:
            return (
                False,
                f"Call duration was only {audio_duration:.1f}s with {total_words} words. Below minimum substantive threshold.",
            )

    # Rule 4: Total speech duration threshold
    if total_speech_duration < MIN_SPEECH_DURATION_SECONDS and total_words < 25:
        return (
            False,
            f"Total active speech was only {total_speech_duration:.1f}s. Below minimum conversation threshold.",
        )

    return True, f"Meeting is substantive ({total_words} words, {total_speech_duration:.1f}s speech)."
