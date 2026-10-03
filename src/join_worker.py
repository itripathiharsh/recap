"""Google Meet Join Worker using Playwright.

Orchestrates the browser session to join a Google Meet call with a visible bot name,
handles pre-join permissions/mutes, waits for admission, and triggers audio recording.
"""

import argparse
import json
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


class HostNotPresentError(Exception):
    """Raised when meeting is waiting for host to arrive or start."""
    pass


def _ensure_display_and_audio(visible: bool = False) -> None:
    """Ensure Xvfb or WSLg display and PulseAudio environment are configured."""
    is_visible = visible or os.getenv("SHOW_BROWSER", "0").lower() in ("1", "true", "yes")

    if sys.platform == "win32":
        # Native Windows - no Xvfb or Linux PulseAudio needed
        return

    from src.config import DEV_TEMP
    if "PLAYWRIGHT_BROWSERS_PATH" not in os.environ:
        if (Path.home() / ".cache" / "ms-playwright").exists():
            os.environ["PLAYWRIGHT_BROWSERS_PATH"] = str(Path.home() / ".cache" / "ms-playwright")
        else:
            os.environ["PLAYWRIGHT_BROWSERS_PATH"] = str(DEV_TEMP / "ms-playwright")

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
    if res.returncode != 0:
        # Broken pulse socket or daemon stopped, clean and restart
        try:
            pulse_user_dir = Path(f"/run/user/{os.getuid()}/pulse")
            if pulse_user_dir.exists():
                import shutil
                shutil.rmtree(pulse_user_dir, ignore_errors=True)
        except Exception:
            pass
        subprocess.run(["pulseaudio", "--start", "--exit-idle-time=-1"], capture_output=True)
        time.sleep(0.5)
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

    # Dismiss "Got it" sign-in tooltip if present
    try:
        got_it = page.locator("button:has-text('Got it'), button[aria-label*='Got it' i]")
        if got_it.count() > 0 and got_it.first.is_visible():
            got_it.first.click()
            time.sleep(0.3)
            logger.info("Dismissed Google sign-in tooltip.")
    except Exception:
        pass

    # Dismiss any microphone / camera permission modals ("Continue without microphone and camera") via JS and locator
    try:
        page.evaluate('''() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const av = btns.find(b => b.innerText.toLowerCase().includes('continue without') || b.getAttribute('jsname') === 'IbE0S');
            if (av) av.click();
        }''')
        time.sleep(0.5)
    except Exception:
        pass

    for av_sel in [
        "button:has-text('Continue without microphone and camera')",
        "button:has-text('Continue without microphone')",
        "button:has-text('Allow microphone and camera')",
        "button[jsname='IbE0S']",
        "button[jsname='aO7olb']",
    ]:
        try:
            av_btn = page.locator(av_sel)
            if av_btn.count() > 0 and av_btn.first.is_visible():
                av_btn.first.click(force=True)
                time.sleep(0.5)
                logger.info("Dismissed AV permission prompt via %s.", av_sel)
                break
        except Exception:
            pass

    # Fill display name if name input is present
    name_selectors = [
        "input[placeholder*='name' i]",
        "input[aria-label*='name' i]",
        "input[aria-label='Your name']",
        "input[type='text']",
    ]
    name_filled = False
    for sel in name_selectors:
        try:
            loc = page.locator(sel)
            if loc.count() > 0 and loc.first.is_visible():
                loc.first.click()
                time.sleep(0.2)
                loc.first.fill("")
                time.sleep(0.1)
                page.keyboard.type(bot_name, delay=30)
                time.sleep(0.4)
                page.keyboard.press("Tab")
                time.sleep(0.5)
                name_filled = True
                logger.info("Filled bot display name via keyboard typing: '%s'", bot_name)
                break
        except Exception as n_err:
            logger.warning("Could not fill display name via %s: %s", sel, n_err)

    if not name_filled:
        logger.info("No name input required (may be logged in or already set).")

    # Dismiss AV modal again via JS in case it re-appeared
    try:
        page.evaluate('''() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const av = btns.find(b => b.innerText.toLowerCase().includes('continue without') || b.getAttribute('jsname') === 'IbE0S');
            if (av) av.click();
        }''')
        time.sleep(0.4)
    except Exception:
        pass

    # Click "Ask to join" or "Join now" — First attempt via DOM JS to bypass pointer interception
    clicked = False
    try:
        clicked_text = page.evaluate('''() => {
            const btns = Array.from(document.querySelectorAll('button, div[role="button"]'));
            const join = btns.find(b => {
                const t = b.innerText ? b.innerText.toLowerCase() : '';
                return t.includes('join now') || t.includes('ask to join');
            });
            if (join) {
                join.click();
                return join.innerText.trim();
            }
            return null;
        }''')
        if clicked_text:
            clicked = True
            logger.info("Clicked join button via DOM JS: '%s'", clicked_text)
    except Exception as js_err:
        logger.warning("DOM JS click attempt: %s", js_err)

    if not clicked:
        join_selectors = [
            "button:has-text('Join now')",
            "button:has-text('Ask to join')",
            "button:has-text('Join')",
            "button[aria-label*='Join now' i]",
            "button[aria-label*='Ask to join' i]",
            "button[aria-label*='Join meeting' i]",
            "span:has-text('Join now')",
            "span:has-text('Ask to join')",
            "button[jsname='Qx7uuf']",
            "div[role='button']:has-text('Join now')",
            "div[role='button']:has-text('Ask to join')",
        ]
        for sel in join_selectors:
            try:
                loc = page.locator(sel)
                if loc.count() > 0 and loc.first.is_visible():
                    loc.first.click(force=True)
                    clicked = True
                    logger.info("Clicked join button via selector: %s", sel)
                    break
            except Exception:
                pass

    if not clicked:
        try:
            for name in ["Join now", "Ask to join", "Join"]:
                btn = page.get_by_role("button", name=name)
                if btn.count() > 0 and btn.first.is_visible():
                    btn.first.click(force=True)
                    clicked = True
                    logger.info("Clicked join button via get_by_role('%s')", name)
                    break
        except Exception:
            pass

    if not clicked:
        logger.warning("Could not locate primary join button with standard selectors; attempting Enter key.")
        page.keyboard.press("Enter")

    time.sleep(1.0)
    # If still on 'Ready to join?' screen after click, press Enter to submit
    try:
        ready_hdr = page.locator("text='Ready to join?'")
        if ready_hdr.count() > 0 and ready_hdr.first.is_visible():
            logger.info("'Ready to join?' still visible after click attempt. Pressing Enter to submit join form...")
            page.keyboard.press("Enter")
            time.sleep(1.0)
    except Exception:
        pass


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

    # Rejection indicators (explicit rejections by human or policy)
    explicit_rejection_selectors = [
        'text="Someone in the call denied your request"',
        'text="You\'ve been removed from the meeting"',
        'text="Someone removed you from the meeting"',
        'text="You can\'t join this meeting"',
    ]

    # Waiting-room indicators — if ANY of these are visible, we are waiting for the host to admit us!
    waiting_selectors = [
        'text="Asking to join"',
        'text="Someone should let you in shortly"',
        'text="You\'ll join the call when someone lets you in"',
        'text="Waiting for the host"',
        'text="Waiting for host"',
        'text="Asking to be let in"',
    ]

    # In-call indicator selectors — ONLY visible when actually inside an active call
    in_call_selectors = [
        "button[aria-label*='Show everyone' i]",
        "button[aria-label*='People' i]",
        "button[aria-label*='Chat with everyone' i]",
        "button[aria-label*='Raise hand' i]",
        "button[aria-label*='Leave call' i]",
        "button[aria-label*='Leave meeting' i]",
        "div[data-allocation-index]",
        "div[data-participant-id]",
        "div[data-meeting-title]",
        "button[data-is-muted]",
    ]

    last_log_time = 0.0

    while time.time() - start_time < timeout_seconds:
        # Check if AV permission dialog appeared in-call or during connection
        for av_sel in [
            "button:has-text('Continue without microphone and camera')",
            "button:has-text('Continue without microphone')",
            "button[jsname='IbE0S']",
        ]:
            try:
                btn = page.locator(av_sel)
                if btn.count() > 0 and btn.first.is_visible():
                    btn.first.click(force=True)
                    logger.info("Dismissed in-call AV prompt via %s.", av_sel)
            except Exception:
                pass

        # Check genuine in-call status via DOM JS (leave call button)
        try:
            in_call_js = page.evaluate('''() => {
                const leave = document.querySelector("button[aria-label*='Leave call' i], button[aria-label*='Leave meeting' i], button[jsname='CQy0Sc']");
                return leave !== null;
            }''')
            if in_call_js:
                logger.info("Successfully admitted to meeting call (matched in-call leave button via JS).")
                return True
        except Exception:
            pass

        # 1. Check genuine in-call status FIRST
        for sel in in_call_selectors:
            try:
                loc = page.locator(sel)
                if loc.count() > 0 and loc.first.is_visible():
                    logger.info("Successfully admitted to meeting call (matched in-call element: %s).", sel)
                    return True
            except Exception:
                pass

        # 2. Check explicit rejection indicators
        for sel in explicit_rejection_selectors:
            try:
                if page.locator(sel).count() > 0 and page.locator(sel).first.is_visible():
                    raise JoinFailedError(f"Admission denied or rejected: {sel}")
            except JoinFailedError:
                raise
            except Exception:
                pass

        # 3. Check if waiting in lobby / waiting room
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

        time.sleep(1.5)

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

    from src.config import DEV_TEMP
    profile_dir = DEV_TEMP / "chrome_profile"
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

        # Load authenticated Google session if available
        auth_file = Path("data/google_auth.json")
        auth_env = os.getenv("GOOGLE_SESSION_STATE")
        if auth_env and not auth_file.exists():
            try:
                import base64
                auth_file.parent.mkdir(parents=True, exist_ok=True)
                auth_file.write_bytes(base64.b64decode(auth_env))
            except Exception as b64_err:
                logger.warning("Could not decode GOOGLE_SESSION_STATE: %s", b64_err)

        if auth_file.exists():
            try:
                with open(auth_file, "r", encoding="utf-8") as f:
                    state_data = json.load(f)
                cookies = state_data.get("cookies", [])
                if cookies:
                    context.add_cookies(cookies)
                    logger.info("Loaded %d authenticated Google session cookies into browser context.", len(cookies))
            except Exception as auth_err:
                logger.warning("Could not load Google session cookies: %s", auth_err)

        # Stealth: Remove navigator.webdriver and add Chrome runtime/languages/plugins
        try:
            context.add_init_script("""
                Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
                window.navigator.chrome = { runtime: {} };
                Object.defineProperty(navigator, 'languages', {get: () => ['en-US', 'en']});
                Object.defineProperty(navigator, 'plugins', {get: () => [1, 2, 3, 4, 5]});
            """)
        except Exception as st_err:
            logger.warning("Could not add webdriver stealth script: %s", st_err)

        start_wait = time.time()
        admitted = False

        try:
            while time.time() - start_wait < admission_timeout:
                try:
                    logger.info("Navigating to %s (waiting for host, elapsed: %.0fs/%.0fs)...", meet_link, time.time() - start_wait, admission_timeout)
                    page.goto(meet_link, wait_until="domcontentloaded", timeout=45000)
                    page.wait_for_timeout(3000)

                    _handle_prejoin_page(page, display_name)

                    remaining = max(30.0, admission_timeout - (time.time() - start_wait))
                    _wait_for_admission(page, timeout_seconds=remaining)
                    admitted = True
                    break
                except HostNotPresentError as h_err:
                    logger.info("%s. Waiting 12s for host to arrive before retrying...", h_err)
                    time.sleep(12)
                    continue

            if not admitted:
                raise JoinFailedError(f"Host did not start or admit the bot into meeting within {int(admission_timeout)}s.")

            # Admitted! Update job status to recording
            logger.info("Admitted to call. Transitioning job %s to 'recording'.", meeting_id)
            update_job_status(meeting_id, JobStatus.RECORDING.value, jobs_dir=j_dir, force=True)
            from src.supabase_client import db_update_meeting_status
            db_update_meeting_status(meeting_id=meeting_id, status="recording")

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
