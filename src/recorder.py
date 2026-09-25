"""Audio recorder using Xvfb, PulseAudio, and FFmpeg with real-time silence detection.

Captures audio from the PulseAudio virtual sink and writes to
data/recordings/{meeting_id}/audio.wav. Monitors meeting duration, silence
intervals, and bot removal status in real-time.
"""

from datetime import datetime, timezone
import json
import logging
import os
from pathlib import Path
import re
import signal
import subprocess
import threading
import time
from typing import Any

from src.job_state import (
    JobStatus,
    get_job,
    update_job_status,
)

logger = logging.getLogger(__name__)

DEFAULT_RECORDINGS_DIR = Path("data/recordings")
DEFAULT_JOBS_DIR = Path("data/jobs")
DEFAULT_MAX_MINUTES = int(os.getenv("MAX_RECORDING_MINUTES", "90"))
MIN_SPEECH_DURATION_SECONDS = 10.0
SILENCE_TIMEOUT_SECONDS = 120.0  # 2 continuous minutes


class RecordingFailedError(Exception):
    """Raised when audio recording fails or produces an empty file."""


def _check_bot_removed(page: Any) -> bool:
    """Check whether the bot has been removed from the Meet call.

    Args:
        page: Playwright Page object or None.

    Returns:
        True if removed or page closed, False otherwise.
    """
    if page is None:
        return False

    try:
        if hasattr(page, "is_closed") and page.is_closed():
            logger.warning("Playwright page is closed; treating as removed from call.")
            return True

        if hasattr(page, "url"):
            current_url = str(page.url)
            # If redirected away from meet.google.com, call ended or bot was removed
            if "meet.google.com" not in current_url:
                logger.warning("Navigated away from Google Meet (%s); treating as call ended.", current_url)
                return True

        # Check for Google Meet removal dialog / call ended text
        if hasattr(page, "locator"):
            removal_locators = [
                page.locator("text='You\\'ve been removed from the meeting'"),
                page.locator("text='You left the meeting'"),
                page.locator("text='Someone removed you from the meeting'"),
                page.locator("text='The meeting ended'"),
                page.locator("text='The call ended'"),
                page.locator("text='Return to home screen'"),
            ]
            for loc in removal_locators:
                try:
                    if loc.count() > 0:
                        if hasattr(loc, "first") and hasattr(loc.first, "is_visible"):
                            if not loc.first.is_visible():
                                continue
                        logger.warning("Detected Meet removal/end banner (%s).", loc)
                        return True
                except Exception:
                    pass
    except Exception as exc:
        logger.warning("Error inspecting page state: %s", exc)

    return False


def _extract_meet_participants(page: Any) -> list[str]:
    """Extract participant names from Google Meet DOM in real-time."""
    if page is None:
        return []

    try:
        if hasattr(page, "evaluate"):
            names = page.evaluate("""() => {
                const participants = new Set();
                
                // 1. Data attributes on video tiles or participants list
                document.querySelectorAll('[data-self-name]').forEach(el => {
                    const name = el.getAttribute('data-self-name')?.trim();
                    if (name) participants.add(name);
                });
                
                // 2. Participant name labels in video grid
                document.querySelectorAll('div[data-participant-id], div[data-allocation-index]').forEach(el => {
                    const textEl = el.querySelector('span, div');
                    if (textEl && textEl.textContent) {
                        const name = textEl.textContent.trim();
                        if (name && name.length > 1 && !name.includes(':') && !['You', 'Turn on', 'Turn off', 'People', 'Chat'].includes(name)) {
                            participants.add(name);
                        }
                    }
                });

                // 3. People tab list items if opened/rendered
                document.querySelectorAll('[role="listitem"] [data-hovercard-id], [role="listitem"] span').forEach(el => {
                    const name = el.textContent?.trim();
                    if (name && name.length > 1 && !name.includes(':')) {
                        participants.add(name);
                    }
                });

                return Array.from(participants);
            }""")
            ignored = {
                "You", "Meeting details", "Chat with everyone", "People", "Activities", "Host controls",
                "Turn on microphone", "Turn off microphone", "Turn on camera", "Turn off camera",
                "Backgrounds and effects", "Recap Recorder",
            }
            cleaned = []
            for n in names:
                if not n or len(n) > 40 or "\n" in n:
                    continue
                if any(kw.lower() in n.lower() for kw in ["background", "visual_effects", "can't show", "tile in this"]):
                    continue
                if n not in ignored and n not in cleaned:
                    cleaned.append(n)
            return cleaned
    except Exception as exc:
        logger.debug("Participant extraction error: %s", exc)

    return []


def start_recording(
    meeting_id: str,
    max_minutes: int | None = None,
    page: Any = None,
    pulse_source: str = "default",
    recordings_dir: Path | None = None,
    jobs_dir: Path | None = None,
    force: bool = False,
    ffmpeg_cmd_override: list[str] | None = None,
) -> Path:
    """Capture meeting audio until silence, bot removal, or max duration cap.

    Writes data/recordings/{meeting_id}/audio.wav.
    Updates job status to 'recorded' on success.

    Args:
        meeting_id: Unique identifier for the meeting.
        max_minutes: Maximum duration before hard stop (defaults to 90 min).
        page: Live Playwright Page object for removal monitoring.
        pulse_source: PulseAudio virtual sink monitor name.
        recordings_dir: Directory for recording storage.
        jobs_dir: Directory for job state JSON files.
        force: If True, bypass initial status checks.
        ffmpeg_cmd_override: Optional custom command for testing/simulation.

    Returns:
        Path to the recorded audio.wav file.

    Raises:
        RecordingFailedError: If audio file is not produced or is 0 bytes.
    """
    rec_dir = (recordings_dir if recordings_dir is not None else DEFAULT_RECORDINGS_DIR) / meeting_id
    audio_path = rec_dir / "audio.wav"
    rec_dir.mkdir(parents=True, exist_ok=True)

    participants_file = rec_dir / "participants.json"
    discovered_participants: set[str] = set()
    last_participant_scan = 0.0

    limit_minutes = max_minutes if max_minutes is not None else DEFAULT_MAX_MINUTES
    max_duration_seconds = limit_minutes * 60.0

    # Verify job state
    try:
        job = get_job(meeting_id, jobs_dir=jobs_dir)
        current_status = job.get("status")
        if not force and current_status != JobStatus.RECORDING.value:
            logger.warning(
                "Job %s is in status '%s', expected '%s'",
                meeting_id,
                current_status,
                JobStatus.RECORDING.value,
            )
    except Exception as exc:
        logger.warning("Could not read job state for %s: %s", meeting_id, exc)

    # Build FFmpeg command
    if ffmpeg_cmd_override is not None:
        cmd = ffmpeg_cmd_override
    else:
        cmd = [
            "ffmpeg",
            "-nostdin",
            "-f", "pulse",
            "-i", pulse_source,
            "-af", f"silencedetect=noise=-50dB:d={int(SILENCE_TIMEOUT_SECONDS)}",
            "-ac", "1",
            "-ar", "16000",
            "-y",
            str(audio_path),
        ]

    # Explicitly ensure D: temp is inherited by ffmpeg (platform-aware)
    env = os.environ.copy()
    if os.name == "nt":
        temp_dir = Path("D:/meet recorder/.temp")
    else:
        temp_dir = Path("/mnt/d/meet recorder/.temp")
    temp_dir.mkdir(parents=True, exist_ok=True)
    env["TEMP"] = str(temp_dir)
    env["TMP"] = str(temp_dir)

    # Ensure PULSE_SERVER points to valid socket in WSLg
    if Path("/mnt/wslg/PulseServer").exists():
        env["PULSE_SERVER"] = "unix:/mnt/wslg/PulseServer"

    # Ensure PulseAudio source exists if using VirtualSink
    if "VirtualSink" in pulse_source:
        try:
            res = subprocess.run(["pactl", "list", "short", "sources"], capture_output=True, text=True)
            if "VirtualSink" not in res.stdout:
                subprocess.run([
                    "pactl", "load-module", "module-null-sink",
                    "sink_name=VirtualSink",
                    "sink_properties=device.description=VirtualSink"
                ], capture_output=True)
                subprocess.run(["pactl", "set-default-sink", "VirtualSink"], capture_output=True)
        except Exception as p_err:
            logger.warning("Could not verify/load VirtualSink module: %s", p_err)

    start_time = time.time()
    recording_start_monotonic = time.monotonic()
    speech_detected = False
    stop_reason: str | None = None
    silence_start_time: float | None = None
    last_silence_end: float = 0.0
    stderr_lines: list[str] = []

    process = subprocess.Popen(
        cmd,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
        env=env,
    )

    # Initialize live closed captions observer if Playwright page is present
    caption_collector = None
    if page is not None:
        try:
            from src.caption_observer import enable_live_captions, start_caption_observer
            enable_live_captions(page)
            caption_collector = start_caption_observer(
                page=page,
                meeting_id=meeting_id,
                recording_start_monotonic=recording_start_monotonic,
                recordings_dir=recordings_dir or DEFAULT_RECORDINGS_DIR,
            )
        except Exception as cap_err:
            logger.warning("Could not initialize live captions for %s: %s", meeting_id, cap_err)

    def monitor_stderr() -> None:
        nonlocal speech_detected, stop_reason, silence_start_time, last_silence_end, stderr_lines
        silence_start_pattern = re.compile(r"silence_start:\s*([\d\.]+)")
        silence_end_pattern = re.compile(r"silence_end:\s*([\d\.]+)\s*\|\s*silence_duration:\s*([\d\.]+)")

        for line in process.stderr:  # type: ignore[union-attr]
            line_str = line.strip()
            if len(stderr_lines) < 100:
                stderr_lines.append(line_str)
            else:
                stderr_lines.pop(0)
                stderr_lines.append(line_str)

            # Parse silence_start
            m_start = silence_start_pattern.search(line_str)
            if m_start:
                s_start = float(m_start.group(1))
                silence_start_time = s_start

                # Check if speech occurred before this silence
                speech_duration = s_start - last_silence_end
                if speech_duration >= MIN_SPEECH_DURATION_SECONDS:
                    speech_detected = True
                    logger.info("Speech detected: %.2fs of continuous sound.", speech_duration)

            # Parse silence_end
            m_end = silence_end_pattern.search(line_str)
            if m_end:
                s_end = float(m_end.group(1))
                s_dur = float(m_end.group(2))
                last_silence_end = s_end
                silence_start_time = None

                # If silence duration >= 120s and speech was already detected, terminate
                if speech_detected and s_dur >= SILENCE_TIMEOUT_SECONDS:
                    stop_reason = f"silence_timeout ({s_dur:.1f}s)"
                    logger.info("Silence timeout triggered after %.2fs of silence.", s_dur)
                    break

    stderr_thread = threading.Thread(target=monitor_stderr, daemon=True)
    stderr_thread.start()

    # Main control loop: check page removal, duration cap, and silence timeout
    try:
        while process.poll() is None:
            elapsed = time.time() - start_time

            # 1. Hard duration cap check
            if elapsed >= max_duration_seconds:
                stop_reason = f"max_duration_cap ({limit_minutes} min)"
                logger.warning("Hit max recording duration cap (%.1f min) for %s.", limit_minutes, meeting_id)
                break

            # 2. Bot removal check
            if _check_bot_removed(page):
                stop_reason = "removed_from_call"
                logger.warning("Bot removed from call for %s.", meeting_id)
                break

            # 3. Stop reason detected in stderr thread
            if stop_reason is not None:
                break

            # 4. Check if currently in silence that has exceeded 120s since first speech
            if speech_detected and silence_start_time is not None:
                current_silence_dur = (time.time() - start_time) - silence_start_time
                if current_silence_dur >= SILENCE_TIMEOUT_SECONDS:
                    stop_reason = f"silence_timeout ({current_silence_dur:.1f}s)"
                    logger.info("Active silence exceeded %.1fs threshold.", SILENCE_TIMEOUT_SECONDS)
            # 5. Periodically scan for participant names from the Meet DOM (every 10s) as fallback
            if page and (time.time() - last_participant_scan > 10.0):
                last_participant_scan = time.time()
                try:
                    new_names = _extract_meet_participants(page)
                    if new_names:
                        prev_count = len(discovered_participants)
                        discovered_participants.update(new_names)
                        if len(discovered_participants) > prev_count:
                            # Do not overwrite if richer google_meet_api participants were already saved
                            should_write = True
                            if participants_file.exists():
                                try:
                                    existing = json.loads(participants_file.read_text(encoding="utf-8"))
                                    if isinstance(existing, dict) and existing.get("source") == "google_meet_api":
                                        should_write = False
                                except Exception:
                                    pass

                            if should_write:
                                logger.info("Discovered meeting participants (DOM fallback): %s", sorted(list(discovered_participants)))
                                fallback_payload = {
                                    "meeting_id": meeting_id,
                                    "source": "dom_fallback",
                                    "conference_record": None,
                                    "retrieved_at": datetime.now(timezone.utc).isoformat() if "timezone" in globals() else datetime.utcnow().isoformat(),
                                    "participants": [
                                        {"displayName": name, "user_type": "unknown", "source": "dom_fallback"}
                                        for name in sorted(list(discovered_participants))
                                    ],
                                }
                                participants_file.write_text(
                                    json.dumps(fallback_payload, indent=2),
                                    encoding="utf-8"
                                )
                except Exception as exc:
                    logger.debug("Error during participant scan: %s", exc)

            time.sleep(1.0)
    finally:
        # Gracefully stop FFmpeg so it writes the WAV header properly
        if process.poll() is None:
            try:
                logger.info("Sending termination signal to FFmpeg for %s (reason: %s)...", meeting_id, stop_reason)
                if os.name == "nt":
                    process.terminate()
                else:
                    process.send_signal(signal.SIGINT)
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
            except Exception as exc:
                logger.warning("Error stopping FFmpeg process: %s", exc)
        else:
            if stop_reason is None:
                stop_reason = f"ffmpeg_process_exited (code={process.returncode})"
                logger.error("FFmpeg exited early with code %s. Last stderr:\n%s", process.returncode, "\n".join(stderr_lines[-20:]))

        # Stop and finalize live caption collector
        if caption_collector is not None:
            try:
                caption_collector.save()
            except Exception as cap_save_err:
                logger.warning("Error finalizing captions for %s: %s", meeting_id, cap_save_err)

    logger.info("Recording finished for %s. Reason: %s", meeting_id, stop_reason)

    # Validate output audio file
    if not audio_path.exists():
        error_msg = f"Recording failed: output audio file does not exist at {audio_path}"
        try:
            update_job_status(meeting_id, JobStatus.FAILED.value, error=error_msg, jobs_dir=jobs_dir)
        except Exception:
            pass
        raise RecordingFailedError(error_msg)

    if audio_path.stat().st_size == 0:
        error_msg = f"Recording failed: output audio file is 0 bytes at {audio_path}"
        try:
            update_job_status(meeting_id, JobStatus.FAILED.value, error=error_msg, jobs_dir=jobs_dir)
        except Exception:
            pass
        raise RecordingFailedError(error_msg)

    # Update job state to 'recorded'
    try:
        update_job_status(meeting_id, JobStatus.RECORDED.value, force=force, jobs_dir=jobs_dir)
    except Exception as exc:
        logger.warning("Could not update job status for %s to 'recorded': %s", meeting_id, exc)

    return audio_path
