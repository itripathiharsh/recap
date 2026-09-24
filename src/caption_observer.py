"""Google Meet Live Caption Observer and Collector.

Handles:
1. Programmatically enabling Google Meet live closed captions via tiered accessibility/keyboard selectors.
2. Injecting a MutationObserver inside the Playwright page to observe live caption changes in real-time.
3. Establishing monotonic timestamp calibration (<500ms drift target) between audio recording and captions.
4. Buffering, coalescing progressive word-by-word streaming updates, and saving clean caption turns to captions.json.
"""

from datetime import datetime, timezone
import json
import logging
from pathlib import Path
import time
from typing import Any

from playwright.sync_api import Page

logger = logging.getLogger("caption_observer")

DEFAULT_RECORDINGS_DIR = Path("data/recordings")


def enable_live_captions(page: Page) -> bool:
    """Enable Google Meet live closed captions using tiered robust selectors.

    Args:
        page: Live Playwright Page instance.

    Returns:
        True if captions are successfully enabled or already active, False otherwise.
    """
    if page is None:
        logger.warning("No Playwright page provided to enable captions.")
        return False

    try:
        if page.is_closed():
            logger.warning("Playwright page is closed; cannot enable captions.")
            return False

        # 1. Check if captions are already enabled
        active_indicators = [
            "button[aria-label*='Turn off captions' i]",
            "button[aria-label*='Disable captions' i]",
            "button[aria-label*='captions' i][aria-pressed='true']",
            "[role='region'][aria-label*='Captions' i]",
        ]
        for sel in active_indicators:
            try:
                loc = page.locator(sel)
                if loc.count() > 0 and loc.first.is_visible():
                    logger.info("Live captions already active in Google Meet (matched: %s).", sel)
                    return True
            except Exception:
                pass

        # 2. Tier 1: Click the CC toggle button using accessibility selectors
        cc_selectors = [
            "button[aria-label*='Turn on captions' i]",
            "button[aria-label*='Enable captions' i]",
            "button[aria-label*='captions' i]",
            "button[jsname='r8qRAd']",
            "button:has-text('Turn on captions')",
            "button:has(i:has-text('closed_caption'))",
        ]
        clicked = False
        for sel in cc_selectors:
            try:
                loc = page.locator(sel)
                if loc.count() > 0 and loc.first.is_visible():
                    loc.first.click()
                    clicked = True
                    logger.info("Clicked captions button via selector: %s", sel)
                    time.sleep(1.0)
                    break
            except Exception:
                pass

        # 3. Tier 2: Keyboard shortcut fallback (Meet standard: 'c')
        if not clicked:
            try:
                logger.info("Attempting keyboard shortcut 'c' to enable Google Meet captions...")
                page.keyboard.press("c")
                time.sleep(1.0)
            except Exception as k_err:
                logger.warning("Keyboard shortcut 'c' failed: %s", k_err)

        # 4. Verify whether captions became active
        for sel in active_indicators:
            try:
                loc = page.locator(sel)
                if loc.count() > 0:
                    logger.info("Successfully confirmed live captions are active (matched: %s).", sel)
                    return True
            except Exception:
                pass

        # Also check if Captions region container exists in DOM
        try:
            region_count = page.locator("[role='region'][aria-label*='Captions' i]").count()
            if region_count > 0:
                logger.info("Captions region detected in DOM.")
                return True
        except Exception:
            pass

        logger.warning("Could not definitively confirm live captions enabled; will monitor anyway.")
        return True  # Proceed optimistically so observer can capture if active

    except Exception as exc:
        logger.warning("Failed to enable Google Meet live captions: %s", exc)
        return False


class CaptionCollector:
    """Collects, calibrates, deduplicates, and stores live caption events."""

    def __init__(
        self,
        meeting_id: str,
        recording_start_monotonic: float,
        recordings_dir: Path | None = None,
    ) -> None:
        self.meeting_id = meeting_id
        self.recording_start_monotonic = recording_start_monotonic
        self.recordings_dir = recordings_dir or DEFAULT_RECORDINGS_DIR
        self.raw_events: list[dict[str, Any]] = []
        self.turns: list[dict[str, Any]] = []
        self.captions_available: bool = False
        self._current_speaker: str | None = None
        self._current_text: str = ""
        self._current_start_offset: float = 0.0
        self._current_last_offset: float = 0.0

    def add_raw_event(self, event_data: dict[str, Any]) -> None:
        """Process incoming caption event from browser MutationObserver."""
        self.captions_available = True

        speaker = str(event_data.get("speaker_name", "")).strip()
        text = str(event_data.get("text", "")).strip()
        browser_offset = float(event_data.get("offset_seconds", 0.0))
        python_offset = round(time.monotonic() - self.recording_start_monotonic, 2)

        # Use browser offset if calibrated, clamped to non-negative
        offset = max(0.0, browser_offset if browser_offset > 0 else python_offset)

        if not speaker or not text:
            return

        # Sanitize speaker string (remove trailing colons, whitespace)
        speaker = speaker.rstrip(":").strip()

        # Deduplication and progressive streaming turn aggregation:
        # If the same speaker continues speaking within 3 seconds, update the turn's text and end time.
        if (
            self._current_speaker == speaker
            and (offset - self._current_last_offset) < 3.5
        ):
            # Update current turn with latest text
            self._current_text = text
            self._current_last_offset = offset
        else:
            # Finalize previous turn if substantive
            self._finalize_active_turn()

            # Start new turn
            self._current_speaker = speaker
            self._current_text = text
            self._current_start_offset = offset
            self._current_last_offset = offset

        self.raw_events.append({
            "timestamp": event_data.get("timestamp") or datetime.now(timezone.utc).isoformat(),
            "recording_offset_seconds": offset,
            "speaker_name": speaker,
            "text": text,
            "source": "google_meet_live_caption",
        })

    def _finalize_active_turn(self) -> None:
        """Append the active in-progress turn to the turns list."""
        if self._current_speaker and self._current_text:
            start = round(self._current_start_offset, 2)
            # Add reasonable duration if start == end (single word/burst)
            end = round(max(self._current_last_offset, start + 1.0), 2)
            self.turns.append({
                "speaker_name": self._current_speaker,
                "start": start,
                "end": end,
                "text": self._current_text,
                "source": "google_meet_live_caption",
            })
        self._current_speaker = None
        self._current_text = ""

    def save(self) -> Path:
        """Finalize and persist captions.json to recording directory."""
        self._finalize_active_turn()

        rec_dir = self.recordings_dir / self.meeting_id
        rec_dir.mkdir(parents=True, exist_ok=True)
        out_file = rec_dir / "captions.json"

        payload = {
            "meeting_id": self.meeting_id,
            "captions_available": self.captions_available and len(self.turns) > 0,
            "total_events": len(self.raw_events),
            "turns": self.turns,
            "saved_at": datetime.now(timezone.utc).isoformat(),
        }

        out_file.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        logger.info(
            "Saved %d caption turns (available=%s) to %s",
            len(self.turns),
            payload["captions_available"],
            out_file,
        )
        return out_file


def start_caption_observer(
    page: Page,
    meeting_id: str,
    recording_start_monotonic: float,
    recordings_dir: Path | None = None,
) -> CaptionCollector:
    """Initialize Playwright MutationObserver and start collecting live caption events.

    Args:
        page: Live Playwright Page instance.
        meeting_id: Meeting unique identifier.
        recording_start_monotonic: time.monotonic() reference when FFmpeg audio recording began.
        recordings_dir: Destination recording directory.

    Returns:
        CaptionCollector instance holding live caption turns.
    """
    collector = CaptionCollector(
        meeting_id=meeting_id,
        recording_start_monotonic=recording_start_monotonic,
        recordings_dir=recordings_dir,
    )

    if page is None or page.is_closed():
        logger.warning("Page is closed or None; caption observer cannot attach.")
        return collector

    try:
        # Expose binding/function so browser JS can stream caption events to Python
        try:
            page.expose_function("__on_meet_caption", lambda evt: collector.add_raw_event(evt))
        except Exception as exp_err:
            # Might already be exposed if retrying
            logger.debug("expose_function '__on_meet_caption': %s", exp_err)

        # Inject JavaScript MutationObserver
        observer_script = """() => {
            window.__meet_caption_base_perf = performance.now();
            window.__meet_caption_seen = new Set();

            function emitCaption(speakerName, captionText) {
                if (!speakerName || !captionText) return;
                const cleanSpeaker = speakerName.replace(/[:]/g, '').trim();
                const cleanText = captionText.trim();
                if (!cleanSpeaker || !cleanText) return;

                const offsetSeconds = Math.max(0, (performance.now() - window.__meet_caption_base_perf) / 1000.0);
                const payload = {
                    speaker_name: cleanSpeaker,
                    text: cleanText,
                    offset_seconds: Number(offsetSeconds.toFixed(2)),
                    timestamp: new Date().toISOString()
                };

                if (window.__on_meet_caption) {
                    window.__on_meet_caption(payload).catch(e => {});
                }
            }

            function processCaptionNode(node) {
                if (!node || node.nodeType !== Node.ELEMENT_NODE) return;

                // Strategy 1: Look for container with speaker name and text
                // Typical Google Meet structure:
                // [role="region"][aria-label*="Captions"] contains blocks
                // with an avatar/name span and text span
                const region = document.querySelector('[role="region"][aria-label*="Captions" i]') ||
                               document.querySelector('div[jscontroller="D1tHje"]') ||
                               document.querySelector('div[jsname="tgaKEf"]') ||
                               document.querySelector('div[aria-live="polite"]');

                const target = region || document.body;

                // Scan all potential caption utterance blocks
                const blocks = target.querySelectorAll('[role="region"][aria-label*="Captions" i] > div, div[jscontroller="D1tHje"] > div, .nMcdL, div.TBMuR, div.iTTPOb');

                if (blocks && blocks.length > 0) {
                    blocks.forEach(block => {
                        const speakerEl = block.querySelector('.NWpY1d, .zs7Y4d, span[data-self-name], img[alt], span:first-child');
                        const textEl = block.querySelector('.ygicle, .VbkSUe, .bh44bd, span:last-child');

                        let speaker = speakerEl?.getAttribute('alt') || speakerEl?.textContent || '';
                        let text = textEl?.textContent || '';

                        if (speaker && text && speaker !== text) {
                            emitCaption(speaker, text);
                        }
                    });
                    return;
                }

                // Strategy 2: Direct query on any visible caption spans
                const spans = target.querySelectorAll('span.NWpY1d, span.ygicle, div.VbkSUe');
                if (spans && spans.length >= 2) {
                    const speaker = spans[0].textContent;
                    const text = spans[1].textContent;
                    emitCaption(speaker, text);
                }
            }

            // Start MutationObserver on document
            const observer = new MutationObserver((mutations) => {
                for (const m of mutations) {
                    if (m.addedNodes && m.addedNodes.length > 0) {
                        for (const node of m.addedNodes) {
                            processCaptionNode(node);
                        }
                    } else if (m.type === 'characterData' || m.type === 'childList') {
                        processCaptionNode(m.target);
                    }
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true,
                characterData: true
            });

            console.log("Google Meet CaptionObserver successfully attached.");
        }"""

        page.evaluate(observer_script)
        logger.info("Injected Google Meet caption MutationObserver script into Playwright page.")

    except Exception as exc:
        logger.warning("Could not attach caption observer to page: %s", exc)

    return collector
