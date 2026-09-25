"""One-time interactive Google login helper for Meeting Recorder.

Runs under Xvfb and provides an interactive web-based view via noVNC (http://localhost:6080/vnc.html)
allowing the user to log into their dedicated bot Google account securely.
The authenticated session is persisted to D:\\meet recorder\\.temp\\chrome_profile.
No passwords or credentials are stored in code or .env.
"""

import logging
import os
from pathlib import Path
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("auth_login")

PROFILE_DIR = Path("/mnt/d/meet recorder/.temp/chrome_profile")
DISPLAY = ":99"
NOVNC_PORT = 6080
VNC_PORT = 5900


def _start_xvfb_and_vnc() -> list[subprocess.Popen]:
    """Start Xvfb, x11vnc, and websockify/noVNC."""
    procs = []

    # Ensure /tmp/.X11-unix is read-write (WSLg mounts it ro by default)
    subprocess.run(["sudo", "mount", "-o", "remount,rw", "/tmp/.X11-unix"], capture_output=True)

    # 1. Start Xvfb if not on :99
    res = subprocess.run(["pgrep", "-f", f"Xvfb {DISPLAY}"], capture_output=True)
    if res.returncode != 0:
        # Clean stale locks if any
        try:
            lock_file = Path(f"/tmp/.X{DISPLAY.replace(':', '')}-lock")
            socket_file = Path(f"/tmp/.X11-unix/X{DISPLAY.replace(':', '')}")
            lock_file.unlink(missing_ok=True)
            socket_file.unlink(missing_ok=True)
        except Exception:
            pass

        logger.info("Starting Xvfb on %s...", DISPLAY)
        xvfb = subprocess.Popen(["Xvfb", DISPLAY, "-screen", "0", "1920x1080x24", "-ac"])
        procs.append(xvfb)
        time.sleep(1)

    # 2. Ensure previous x11vnc and websockify are terminated to avoid stale port binds
    subprocess.run(["pkill", "-f", f"x11vnc.*{DISPLAY}"], capture_output=True)
    subprocess.run(["pkill", "-f", f"websockify.*{NOVNC_PORT}"], capture_output=True)
    time.sleep(0.5)

    # 3. Start x11vnc (unset WAYLAND_DISPLAY so x11vnc attaches cleanly to Xvfb :99)
    logger.info("Starting x11vnc on port %d...", VNC_PORT)
    vnc_env = os.environ.copy()
    vnc_env.pop("WAYLAND_DISPLAY", None)
    vnc = subprocess.Popen([
        "x11vnc",
        "-display", DISPLAY,
        "-rfbport", str(VNC_PORT),
        "-nopw",
        "-forever",
        "-shared",
        "-quiet",
    ], env=vnc_env)
    procs.append(vnc)
    time.sleep(1)

    # 4. Start websockify / noVNC
    logger.info("Starting noVNC websockify on port %d...", NOVNC_PORT)
    novnc = subprocess.Popen([
        "websockify",
        "--web", "/usr/share/novnc/",
        str(NOVNC_PORT),
        f"127.0.0.1:{VNC_PORT}",
    ])
    procs.append(novnc)
    time.sleep(1)

    return procs


def run_interactive_login(timeout_seconds: int = 600) -> bool:
    """Launch persistent Chromium context and wait for Google login completion."""
    PROFILE_DIR.mkdir(parents=True, exist_ok=True)
    procs = _start_xvfb_and_vnc()
    os.environ["DISPLAY"] = DISPLAY
    os.environ["PLAYWRIGHT_BROWSERS_PATH"] = "/mnt/d/meet recorder/.temp/ms-playwright"

    print("\n" + "=" * 65)
    print("GOOGLE BOT ONE-TIME INTERACTIVE LOGIN")
    print("=" * 65)
    print(f"\n1. Open this URL in your Windows browser:\n")
    print(f"   --> http://localhost:{NOVNC_PORT}/vnc.html?autoconnect=true <---")
    print(f"   (Alternative: http://172.30.186.66:{NOVNC_PORT}/vnc.html?autoconnect=true)")
    print("\n2. You will see the Chromium browser showing Google Sign-In.")
    print("3. Enter your dedicated bot Google account email & password.")
    print("4. Complete 2FA/verification if prompted.")
    print("5. Once signed in, this script will automatically detect the active")
    print("   session, save the persistent profile, and exit cleanly.")
    print("=" * 65 + "\n")
    sys.stdout.flush()

    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            user_data_dir=str(PROFILE_DIR),
            headless=False,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
                "--disable-infobars",
                "--window-size=1280,720",
                "--window-position=50,50",
            ],
            viewport={"width": 1280, "height": 720},
            user_agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        )
        page = context.pages[0] if len(context.pages) > 0 else context.new_page()
        page.goto("https://accounts.google.com/", wait_until="networkidle")

        start_time = time.time()
        logged_in = False

        while time.time() - start_time < timeout_seconds:
            current_url = page.url
            # Check if user reached Google Account home or services
            if any(domain in current_url for domain in ["myaccount.google.com", "google.com/search", "meet.google.com"]):
                logger.info("Detected authenticated Google URL: %s", current_url)
                logged_in = True
                break

            # Also check if page content shows signed in indicators
            try:
                if page.locator("a[href*='SignOutOptions']").count() > 0 or page.locator("a[aria-label*='Google Account:']").count() > 0:
                    logger.info("Detected Google Account avatar/sign-out indicator.")
                    logged_in = True
                    break
            except Exception:
                pass

            time.sleep(2)

        if logged_in:
            print("\n" + "=" * 65)
            print("LOGIN SUCCESSFUL!")
            print(f"Persistent session saved to: {PROFILE_DIR}")
            print("=" * 65 + "\n")
            # Navigate to meet.google.com to verify cookies apply
            try:
                page.goto("https://meet.google.com/", wait_until="networkidle")
                time.sleep(3)
            except Exception:
                pass
        else:
            print(f"\nLogin timed out after {timeout_seconds} seconds.", file=sys.stderr)

        context.close()

    # Clean up background helper processes
    for p in procs:
        try:
            p.terminate()
        except Exception:
            pass

    return logged_in


if __name__ == "__main__":
    success = run_interactive_login()
    sys.exit(0 if success else 1)
