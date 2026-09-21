"""Speech-to-text (STT) worker supporting Gemini 2.5 Flash, Groq Whisper, and faster-whisper.

Transcribes audio captured in data/recordings/{meeting_id}/audio.wav
and writes structured data/recordings/{meeting_id}/transcript.json.
Updates job status to 'transcribed'.

Supports multi-key failover for Gemini and Groq, with offline faster-whisper fallback.
"""

import json
import logging
import os
from pathlib import Path
import subprocess
import tempfile
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
DEFAULT_MODEL_SIZE = os.getenv("WHISPER_MODEL_SIZE", "small")


class Segment(BaseModel):
    """Schema for individual segment in transcript.json."""

    model_config = ConfigDict(extra="forbid")

    start: float = Field(..., ge=0.0)
    end: float = Field(..., ge=0.0)
    text: str


class Transcript(BaseModel):
    """Schema for transcript.json matching SCHEMA.md §3."""

    model_config = ConfigDict(extra="forbid")

    meeting_id: str
    model: str
    language: str
    segments: list[Segment]


class TranscriptionFailedError(Exception):
    """Raised when all transcription providers fail to transcribe audio."""


def _get_whisper_model(model_size: str) -> Any:
    """Lazily load faster-whisper model on CPU with int8 quantization."""
    try:
        from faster_whisper import WhisperModel
        return WhisperModel(model_size, device="cpu", compute_type="int8")
    except ImportError as exc:
        raise TranscriptionFailedError(
            "faster-whisper is not installed. Install dependencies per requirements.txt."
        ) from exc
    except Exception as exc:
        raise TranscriptionFailedError(f"Failed to load faster-whisper model '{model_size}': {exc}") from exc


def _transcribe_with_gemini(audio_path: Path, keys: list[str]) -> tuple[list[dict[str, Any]], str, str]:
    """Transcribe audio using Gemini 2.5 Flash native audio with multi-key failover."""
    try:
        import google.generativeai as genai
    except ImportError as exc:
        raise RuntimeError("google-generativeai is not installed") from exc

    prompt = """Transcribe this audio verbatim. The speakers are speaking Hinglish (mixed Hindi and English).
Keep the exact spoken words in Roman script (Hinglish/English as spoken). Do not translate into pure English or Devanagari script.
Return a valid JSON object with the following schema:
{
  "language": "hi",
  "segments": [
    {
      "start": 0.0,
      "end": 3.5,
      "text": "spoken text in this segment"
    }
  ]
}
Ensure timestamps accurately match the audio.
"""

    last_exc: Exception | None = None
    for idx, key in enumerate(keys):
        if not key:
            continue
        try:
            logger.info("Attempting Gemini STT with key index %d", idx)
            genai.configure(api_key=key)
            uploaded_file = genai.upload_file(str(audio_path))
            try:
                model = genai.GenerativeModel("gemini-2.5-flash")
                resp = model.generate_content(
                    [uploaded_file, prompt],
                    generation_config=genai.GenerationConfig(response_mime_type="application/json")
                )
                data = json.loads(resp.text)
                detected_lang = data.get("language", "hi")
                raw_segments = data.get("segments", [])
                segments_list = []
                for seg in raw_segments:
                    text = str(seg.get("text", "")).strip()
                    if text:
                        start_time = max(0.0, round(float(seg.get("start", 0.0)), 2))
                        end_time = max(start_time, round(float(seg.get("end", start_time)), 2))
                        segments_list.append({
                            "start": start_time,
                            "end": end_time,
                            "text": text,
                        })
                logger.info("Gemini STT succeeded with key index %d (%d segments)", idx, len(segments_list))
                return segments_list, detected_lang, "gemini-2.5-flash"
            finally:
                try:
                    uploaded_file.delete()
                except Exception:
                    pass
        except Exception as exc:
            logger.warning("Gemini key index %d failed: %s", idx, exc)
            last_exc = exc

    raise RuntimeError(f"All Gemini API keys failed: {last_exc}")


def _compress_audio_if_needed(audio_path: Path, max_bytes: int = 24 * 1024 * 1024) -> tuple[Path, bool]:
    """Compress audio to 64k mono MP3 if it exceeds max_bytes."""
    if audio_path.stat().st_size <= max_bytes and audio_path.suffix.lower() in [".mp3", ".m4a"]:
        return audio_path, False

    # If WAV or large file, compress to MP3
    temp_mp3 = Path(tempfile.gettempdir()) / f"groq_{audio_path.stem}.mp3"
    logger.info("Compressing %s to %s for Groq (<25MB limit)", audio_path, temp_mp3)
    cmd = [
        "ffmpeg", "-y", "-nostdin",
        "-i", str(audio_path),
        "-ac", "1",
        "-b:a", "64k",
        str(temp_mp3)
    ]
    res = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if res.returncode == 0 and temp_mp3.exists():
        return temp_mp3, True
    return audio_path, False


def _transcribe_with_groq(audio_path: Path, keys: list[str]) -> tuple[list[dict[str, Any]], str, str]:
    """Transcribe audio using Groq Whisper Large v3 with multi-key failover."""
    try:
        from groq import Groq
        import httpx
    except ImportError as exc:
        raise RuntimeError("groq is not installed") from exc

    file_to_send, is_temp = _compress_audio_if_needed(audio_path)
    last_exc: Exception | None = None

    try:
        with open(file_to_send, "rb") as f:
            audio_bytes = f.read()

        for idx, key in enumerate(keys):
            if not key:
                continue
            try:
                logger.info("Attempting Groq STT with key index %d", idx)
                client = Groq(api_key=key, http_client=httpx.Client())
                transcription = client.audio.transcriptions.create(
                    file=(file_to_send.name, audio_bytes),
                    model="whisper-large-v3",
                    prompt="Ye ek Hinglish meeting hai jisme Hindi aur English mixed hai. Transcribe accurately in Hinglish.",
                    response_format="verbose_json",
                )
                detected_lang = getattr(transcription, "language", "hi")
                raw_segments = getattr(transcription, "segments", []) or []
                segments_list = []
                for seg in raw_segments:
                    start_val = seg.get("start") if isinstance(seg, dict) else getattr(seg, "start", 0.0)
                    end_val = seg.get("end") if isinstance(seg, dict) else getattr(seg, "end", 0.0)
                    text_val = seg.get("text") if isinstance(seg, dict) else getattr(seg, "text", "")
                    text = str(text_val).strip()
                    if text:
                        start_time = max(0.0, round(float(start_val), 2))
                        end_time = max(start_time, round(float(end_val), 2))
                        segments_list.append({
                            "start": start_time,
                            "end": end_time,
                            "text": text,
                        })
                logger.info("Groq STT succeeded with key index %d (%d segments)", idx, len(segments_list))
                return segments_list, detected_lang, "groq-whisper-large-v3"
            except Exception as exc:
                logger.warning("Groq key index %d failed: %s", idx, exc)
                last_exc = exc
    finally:
        if is_temp and file_to_send.exists():
            try:
                file_to_send.unlink()
            except Exception:
                pass

    raise RuntimeError(f"All Groq API keys failed: {last_exc}")


def _transcribe_with_whisper(audio_path: Path, model_size: str) -> tuple[list[dict[str, Any]], str, str]:
    """Transcribe audio locally using faster-whisper as offline safety fallback."""
    model = _get_whisper_model(model_size)
    segments_iter, info = model.transcribe(
        str(audio_path),
        beam_size=1,
        vad_filter=True,
        condition_on_previous_text=False,
    )
    detected_language = info.language or "en"
    segments_list = []
    for seg in segments_iter:
        if seg.text.strip():
            segments_list.append({
                "start": round(float(seg.start), 2),
                "end": round(float(seg.end), 2),
                "text": seg.text.strip(),
            })
    return segments_list, detected_language, f"faster-whisper-{model_size}-int8"


def transcribe(
    meeting_id: str,
    recordings_dir: Path | None = None,
    jobs_dir: Path | None = None,
    model_size: str | None = None,
    force: bool = False,
    transcribe_fn: Callable[[Path], tuple[list[dict[str, Any]], str]] | None = None,
) -> dict[str, Any]:
    """Transcribe meeting audio using multi-provider cascade.

    Cascade:
    1. Gemini 2.5 Flash (GEMINI_API_KEY -> GEMINI_API_KEY_2)
    2. Groq Whisper Large v3 (GROQ_API_KEY -> GROQ_API_KEY_2)
    3. Local faster-whisper (offline fallback)

    Input: data/recordings/{meeting_id}/audio.wav (job must be status='recorded')
    Output: data/recordings/{meeting_id}/transcript.json (schema: SCHEMA.md §3)
    Updates job status to 'transcribed'.
    """
    rec_dir = (recordings_dir if recordings_dir is not None else DEFAULT_RECORDINGS_DIR) / meeting_id
    audio_path = rec_dir / "audio.wav"
    transcript_path = rec_dir / "transcript.json"
    used_model_size = model_size or DEFAULT_MODEL_SIZE

    if not audio_path.exists():
        raise TranscriptionFailedError(f"Audio file not found at {audio_path}")

    # Check for empty audio file
    if audio_path.stat().st_size == 0:
        raise TranscriptionFailedError(f"Audio file is 0 bytes at {audio_path}")

    # Verify job state
    try:
        job = get_job(meeting_id, jobs_dir=jobs_dir)
        current_status = job.get("status")
        if not force and current_status != JobStatus.RECORDED.value:
            logger.warning(
                "Job %s is in status '%s', expected '%s'",
                meeting_id,
                current_status,
                JobStatus.RECORDED.value,
            )
    except Exception as exc:
        logger.warning("Could not read job state for %s: %s", meeting_id, exc)

    segments_list: list[dict[str, Any]] = []
    detected_language = "hi"
    model_name = "unknown"

    gemini_keys = [k for k in [os.getenv("GEMINI_API_KEY"), os.getenv("GEMINI_API_KEY_2")] if k]
    groq_keys = [k for k in [os.getenv("GROQ_API_KEY"), os.getenv("GROQ_API_KEY_2")] if k]
    preferred_provider = os.getenv("STT_PROVIDER", "gemini").lower()

    try:
        if transcribe_fn is not None:
            # Use injected transcription function (for unit tests)
            raw_segments, detected_language = transcribe_fn(audio_path)
            segments_list = raw_segments
            model_name = "injected_mock"
        else:
            success = False
            last_err: Exception | None = None

            # Determine provider order based on preference
            provider_order = ["gemini", "groq", "whisper"]
            if preferred_provider == "groq":
                provider_order = ["groq", "gemini", "whisper"]
            elif preferred_provider == "whisper":
                provider_order = ["whisper", "gemini", "groq"]

            for provider in provider_order:
                if provider == "gemini" and gemini_keys:
                    try:
                        logger.info("Transcribing %s with Gemini 2.5 Flash", audio_path)
                        segments_list, detected_language, model_name = _transcribe_with_gemini(audio_path, gemini_keys)
                        success = True
                        break
                    except Exception as exc:
                        logger.warning("Gemini transcription failed: %s. Trying next provider...", exc)
                        last_err = exc
                elif provider == "groq" and groq_keys:
                    try:
                        logger.info("Transcribing %s with Groq Whisper Large v3", audio_path)
                        segments_list, detected_language, model_name = _transcribe_with_groq(audio_path, groq_keys)
                        success = True
                        break
                    except Exception as exc:
                        logger.warning("Groq transcription failed: %s. Trying next provider...", exc)
                        last_err = exc
                elif provider == "whisper":
                    try:
                        logger.info("Transcribing %s with local faster-whisper (%s)", audio_path, used_model_size)
                        segments_list, detected_language, model_name = _transcribe_with_whisper(audio_path, used_model_size)
                        success = True
                        break
                    except Exception as exc:
                        logger.error("Local Whisper transcription failed: %s", exc)
                        last_err = exc

            if not success:
                raise TranscriptionFailedError(f"All STT providers failed. Last error: {last_err}")

    except TranscriptionFailedError:
        raise
    except Exception as exc:
        error_msg = f"Transcription failed: {exc}"
        try:
            update_job_status(meeting_id, JobStatus.FAILED.value, error=error_msg, jobs_dir=jobs_dir)
        except Exception:
            pass
        raise TranscriptionFailedError(error_msg) from exc

    transcript_payload = {
        "meeting_id": meeting_id,
        "model": model_name,
        "language": detected_language,
        "segments": segments_list,
    }

    try:
        validated = Transcript(**transcript_payload)
    except ValidationError as exc:
        raise TranscriptionFailedError(f"Transcript violates SCHEMA.md §3: {exc}") from exc

    # Write output file atomically
    rec_dir.mkdir(parents=True, exist_ok=True)
    temp_transcript = transcript_path.with_suffix(".json.tmp")
    with open(temp_transcript, "w", encoding="utf-8") as f:
        json.dump(validated.model_dump(), f, indent=2)
    temp_transcript.replace(transcript_path)

    logger.info(
        "Successfully wrote transcript.json for %s (%d segments, model=%s, language=%s)",
        meeting_id,
        len(segments_list),
        model_name,
        detected_language,
    )

    # Update job status to 'transcribed'
    try:
        update_job_status(meeting_id, JobStatus.TRANSCRIBED.value, force=force, jobs_dir=jobs_dir)
    except Exception as exc:
        logger.warning("Could not update job status for %s to 'transcribed': %s", meeting_id, exc)

    return validated.model_dump()

