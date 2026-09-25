"""Google Meet Join Worker using Playwright.

Orchestrates the browser session to join a Google Meet call with a visible bot name,
handles pre-join permissions/mutes, waits for admission, and triggers audio recording.
"""

import argparse
import logging
import os
from pathlib import Path
import subprocess
import sys
import time
from typing import Any

# Ensure repository root is in sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import src.config  # Loads .env and enforces cache directories
from playwright.sync_api import Page, sync_playwright

from src.job_state import (
    JobStatus,
    get_job,
    update_job_status,
)
from src.recorder import start_recording

logger = logging.getLogger(__name__)

DEFAULT_JOBS_DIR = Path("data/jobs")
DEFAULT_RECORDINGS_DIR = Path("data/recordings")
DEFAULT_BOT_NAME = os.getenv("BOT_DISPLAY_NAME", "Notetaker Bot (Recording)")
DEFAULT_ADMISSION_TIMEOUT = 300.0  # 5 minutes per API_SPECS.md
DEFAULT_PULSE_SOURCE = "VirtualSink.monitor"


class JoinFailedError(Exception):
    """Raised when joining a Google Meet fails or is rejected."""


def _ensure_display_and_audio(visible: bool = False) -> None:
    """Ensure Xvfb or WSLg display and PulseAudio environment are configured."""
    is_visible = visible or os.getenv("SHOW_BROWSER", "0").lower() in ("1", "true", "yes")

    if sys.platform == "win32":
        # Native Windows - no Xvfb or Linux PulseAudio needed
        return

    os.environ["PLAYWRIGHT_BROWSERS_PATH"] = "/mnt/d/meet recorder/.temp/ms-playwright"

    # Ensure PULSE_SERVER points to valid socket if WSLg
    if Path("/mnt/wslg/PulseServer").exists():
        os.environ["PULSE_SERVER"] = "unix:/mnt/wslg/PulseServer"

    if is_visible:
        # Check if WSLg GUI display :0 is available
        wslg_socket = Path("/mnt/wslg/.X11-unix/X0")
        if wslg_socket.exists() or os.getenv("DISPLAY") == ":0":
            os.environ["DISPLAY"] = ":0"
            logger.info("Visible mode enabled: Using WSLg DISPLAY :0 to render browser directly on Windows desktop.")
            return

    display = os.getenv("DISPLAY", ":99")
    os.environ["DISPLAY"] = display

    # Ensure Xvfb is running
    res = subprocess.run(["pgrep", "-f", f"Xvfb {display}"], capture_output=True)
    if res.returncode != 0:
        subprocess.run(["sudo", "mount", "-o", "remount,rw", "/tmp/.X11-unix"], capture_output=True)
        try:
            lock_file = Path(f"/tmp/.X{display.replace(':', '')}-lock")
            socket_file = Path(f"/tmp/.X11-unix/X{display.replace(':', '')}")
            lock_file.unlink(missing_ok=True)
            socket_file.unlink(missing_ok=True)
        except Exception:
            pass
        logger.info("Starting Xvfb on %s...", display)
        subprocess.Popen(["Xvfb", display, "-screen", "0", "1920x1080x24", "-ac"])
        time.sleep(1)

    # Ensure VirtualSink is loaded for audio capture
    res = subprocess.run(["pactl", "list", "short", "sinks"], capture_output=True, text=True)
    if "VirtualSink" not in res.stdout:
        subprocess.run([
            "pactl", "load-module", "module-null-sink",
            "sink_name=VirtualSink",
            "sink_properties=device.description=VirtualSink",
        ], capture_output=True)
        subprocess.run(["pactl", "set-default-sink", "VirtualSink"], capture_output=True)


def _handle_prejoin_page(page: Page, bot_name: str) -> None:
    """Dismiss popups, mute mic/cam, fill name, and click join.

    Args:
        page: Playwright Page instance.
        bot_name: Visible display name for the bot.
    """
    logger.info("Handling Google Meet pre-join page...")
    time.sleep(3)

    # Check for invalid meeting code / home screen
    if page.locator("text='Return to home screen'").count() > 0 or "Invalid meeting code" in page.content():
        raise JoinFailedError("Invalid or expired Google Meet link.")

    # Dismiss any initial prompt dialogs ("Got it", "Dismiss", "Close")
    dismiss_selectors = [
        "button:has-text('Got it')",
        "button:has-text('Dismiss')",
        "button:has-text('Close')",
    ]
    for sel in dismiss_selectors:
        try:
            loc = page.locator(sel)
            if loc.count() > 0 and loc.first.is_visible():
                loc.first.click()
                time.sleep(0.5)
        except Exception:
            pass

    # Mute Microphone and Camera using standard Meet shortcuts (Control+d, Control+e)
    try:
        page.keyboard.press("Control+d")
        time.sleep(0.5)
        page.keyboard.press("Control+e")
        time.sleep(0.5)
        logger.info("Toggled microphone and camera off via keyboard shortcuts.")
    except Exception as exc:
        logger.warning("Could not send mute shortcuts: %s", exc)

    # Fill display name if name input is present
    name_selectors = [
        "input[aria-label='Your name']",
        "input[placeholder*='name' i]",
        "input[type='text']",
    ]
    name_filled = False
    for sel in name_selectors:
        try:
            loc = page.locator(sel)
            if loc.count() > 0 and loc.first.is_visible():
                loc.first.fill(bot_name)
                name_filled = True
                logger.info("Filled bot display name: '%s'", bot_name)
                time.sleep(0.5)
                break
        except Exception:
            pass

    if not name_filled:
        logger.info("No name input required (may be logged in or already set).")

    # Click "Ask to join" or "Join now"
    join_selectors = [
        "button:has-text('Ask to join')",
        "button:has-text('Join now')",
        "button:has-text('Join')",
        "button[jsname='Qx7uuf']",
        "div[role='button']:has-text('Ask to join')",
        "div[role='button']:has-text('Join now')",
    ]
    clicked = False
    for sel in join_selectors:
        try:
            loc = page.locator(sel)
            if loc.count() > 0 and loc.first.is_visible():
                loc.first.click()
                clicked = True
                logger.info("Clicked join button via selector: %s", sel)
                break
        except Exception:
            pass

    if not clicked:
        try:
            for name in ["Join now", "Ask to join", "Join"]:
                btn = page.get_by_role("button", name=name)
                if btn.is_visible():
                    btn.click()
                    clicked = True
                    logger.info("Clicked join button via get_by_role('%s')", name)
                    break
        except Exception:
            pass

    if not clicked:
        logger.warning("Could not locate primary join button with standard selectors; attempting Enter key.")
        page.keyboard.press("Enter")


def _wait_for_admission(page: Page, timeout_seconds: float = DEFAULT_ADMISSION_TIMEOUT) -> bool:
    """Wait for the host to admit the bot into the Google Meet call.

    Args:
        page: Playwright Page instance.
        timeout_seconds: Maximum time to wait in seconds (default: 300s).

    Returns:
        True if admitted.

    Raises:
        JoinFailedError: If denied, removed, or timed out.
    """
    logger.info("Waiting for admission into call (timeout: %.0fs)...", timeout_seconds)
    start_time = time.time()

    # Rejection indicators
    rejection_selectors = [
        'text="You can\'t join this video call"',
        'text="Someone in the call denied your request"',
        'text="You\'ve been removed from the meeting"',
        'text="Someone removed you from the meeting"',
    ]

    # Waiting-room indicators — if ANY of these are visible, we are still waiting to be admitted
    waiting_selectors = [
        'text="Asking to join"',
        'text="Someone should let you in shortly"',
        'text="You\'ll join the call when someone lets you in"',
        'text="Waiting for the host"',
        'text="Waiting for host"',
        'text="Ready to join?"',
    ]

    # In-call indicator selectors — ONLY visible when actually inside an active call
    in_call_selectors = [
        "button[aria-label*='Show everyone' i]",
        "button[aria-label*='People' i]",
        "button[aria-label*='Chat with everyone' i]",
        "button[aria-label*='Raise hand' i]",
        "div[data-allocation-index]",
        "div[data-participant-id]",
    ]

    last_log_time = 0.0

    while time.time() - start_time < timeout_seconds:
        # 1. Check rejection indicators
        for sel in rejection_selectors:
            try:
                if page.locator(sel).count() > 0 and page.locator(sel).first.is_visible():
                    raise JoinFailedError(f"Admission denied or rejected: {sel}")
            except JoinFailedError:
                raise
            except Exception:
                pass

        # 2. Check if still in waiting room
        is_still_waiting = False
        for sel in waiting_selectors:
            try:
                loc = page.locator(sel)
                if loc.count() > 0 and loc.first.is_visible():
                    is_still_waiting = True
                    break
            except Exception:
                pass

        if is_still_waiting:
            now = time.time()
            if now - last_log_time > 15.0:
                logger.info("Still waiting for host to admit bot into meeting (%.0fs elapsed)...", now - start_time)
                last_log_time = now
            time.sleep(2)
            continue

        # 3. Check genuine in-call status (only valid when NOT in waiting room)
        for sel in in_call_selectors:
            try:
                loc = page.locator(sel)
                if loc.count() > 0 and loc.first.is_visible():
                    logger.info("Successfully admitted to meeting call (matched in-call element: %s).", sel)
                    return True
            except Exception:
                pass

        time.sleep(2)

    raise JoinFailedError(f"Timed out waiting for admission into meeting (>{int(timeout_seconds/60)} min).")


def join_and_record(
    meeting_id: str,
    jobs_dir: Path | None = None,
    recordings_dir: Path | None = None,
    max_minutes: int | None = None,
    pulse_source: str = DEFAULT_PULSE_SOURCE,
    bot_name: str | None = None,
    admission_timeout: float = DEFAULT_ADMISSION_TIMEOUT,
    force: bool = False,
    visible: bool = False,
) -> Path:
    """Join a Google Meet call and capture audio.

    Args:
        meeting_id: Unique meeting identifier matching data/jobs/{meeting_id}.json.
        jobs_dir: Directory containing job JSON files.
        recordings_dir: Directory to store recording audio.
        max_minutes: Optional hard cap on recording duration in minutes.
        pulse_source: PulseAudio virtual sink monitor name.
        bot_name: Visible name for the bot in the meeting.
        admission_timeout: Seconds to wait for admission.
        force: If True, allow running even if job is not in 'pending' status.
        visible: If True, show browser GUI on screen instead of headless Xvfb.

    Returns:
        Path to the recorded audio.wav file.

    Raises:
        JoinFailedError: If joining, admission, or recording fails.
    """
    _ensure_display_and_audio(visible=visible)
    j_dir = jobs_dir if jobs_dir is not None else DEFAULT_JOBS_DIR
    r_dir = recordings_dir if recordings_dir is not None else DEFAULT_RECORDINGS_DIR

    job = get_job(meeting_id, jobs_dir=j_dir)
    current_status = job.get("status")
    if not force and current_status != JobStatus.PENDING.value:
        raise JoinFailedError(
            f"Job {meeting_id} has status '{current_status}', expected '{JobStatus.PENDING.value}'"
        )

    meet_link = job.get("meet_link")
    if not meet_link:
        raise JoinFailedError(f"Job {meeting_id} does not contain 'meet_link'")

    display_name = bot_name or DEFAULT_BOT_NAME

    logger.info("Launching browser for meeting %s (target: %s, visible=%s)...", meeting_id, meet_link, visible)

    profile_dir = Path("D:/meet recorder/.temp/chrome_profile") if sys.platform == "win32" else Path("/mnt/d/meet recorder/.temp/chrome_profile")
    profile_dir.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            user_data_dir=str(profile_dir),
            headless=False,  # Runs inside Xvfb virtual framebuffer
            args=[
                "--use-fake-ui-for-media-stream",
                "--use-fake-device-for-media-stream",
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
                "--disable-infobars",
            ],
            permissions=["camera", "microphone"],
            viewport={"width": 1280, "height": 720},
            user_agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        )
        page = context.pages[0] if len(context.pages) > 0 else context.new_page()

        try:
            logger.info("Navigating to %s...", meet_link)
            page.goto(meet_link, wait_until="networkidle", timeout=45000)

            _handle_prejoin_page(page, display_name)
            _wait_for_admission(page, timeout_seconds=admission_timeout)

            # Admitted! Update job status to recording
            logger.info("Admitted to call. Transitioning job %s to 'recording'.", meeting_id)
            update_job_status(meeting_id, JobStatus.RECORDING.value, jobs_dir=j_dir, force=True)

            # Pass live Playwright page directly to recorder
            audio_path = start_recording(
                meeting_id=meeting_id,
                max_minutes=max_minutes,
                page=page,
                pulse_source=pulse_source,
                recordings_dir=r_dir,
                jobs_dir=j_dir,
                force=True,
            )
            logger.info("Recording completed successfully: %s", audio_path)
            return audio_path

        except Exception as exc:
            logger.error("Join/recording failed for meeting %s: %s", meeting_id, exc)
            try:
                update_job_status(meeting_id, JobStatus.FAILED.value, error=str(exc), jobs_dir=j_dir, force=True)
            except Exception as update_err:
                logger.warning("Could not update job status to failed: %s", update_err)
            raise
        finally:
            try:
                context.close()
            except Exception:
                pass


def main() -> None:
    """CLI entrypoint for join_worker.py."""
    parser = argparse.ArgumentParser(description="Google Meet Join Worker")
    parser.add_argument("--meeting-id", required=True, help="Unique meeting identifier")
    parser.add_argument("--max-minutes", type=int, default=None, help="Maximum recording duration cap in minutes")
    parser.add_argument("--bot-name", default=None, help="Visible bot display name")
    parser.add_argument("--force", action="store_true", help="Bypass pending status check")
    parser.add_argument("--visible", action="store_true", help="Show browser on screen instead of headless Xvfb")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")

    try:
        join_and_record(
            meeting_id=args.meeting_id,
            max_minutes=args.max_minutes,
            bot_name=args.bot_name,
            force=args.force,
            visible=args.visible,
        )
    except Exception as exc:
        logger.error("Join worker failed: %s", exc)
        sys.exit(1)


if __name__ == "__main__":
    main()
