"""Scheduler and Background Worker Daemon.

Continuously polls Supabase for upcoming or queued meetings, claims them
atomically, executes the recording/ML pipeline, and sends periodic heartbeats.
"""

from datetime import datetime, timezone
import logging
import os
import signal
import sys
import time
from typing import Any

from src.heartbeat import send_heartbeat
from src.supabase_client import (
    db_claim_meeting,
    db_get_meeting,
    db_get_upcoming_meetings,
    db_record_system_event,
    db_update_meeting_status,
    get_supabase_client,
)
from src.worker import execute_meeting_pipeline

logger = logging.getLogger("scheduler")

POLL_INTERVAL_SECONDS = int(os.getenv("POLL_INTERVAL_SECONDS", "15"))
HEARTBEAT_INTERVAL_SECONDS = int(os.getenv("HEARTBEAT_INTERVAL_SECONDS", "30"))
LOOKAHEAD_MINUTES = int(os.getenv("LOOKAHEAD_MINUTES", "2"))


class SchedulerDaemon:
    """Daemon running the scheduler, heartbeat, and pipeline execution loop."""

    def __init__(self) -> None:
        self.running = False
        self.current_meeting_id: str | None = None
        self.current_state = "idle"
        self.last_heartbeat_time = 0.0

    def handle_signal(self, signum: int, frame: Any) -> None:
        """Handle graceful termination signals."""
        logger.info("Received termination signal (%s). Shutting down daemon...", signum)
        self.running = False
        send_heartbeat(status="offline", current_state="shutting_down")

    def recover_stale_jobs(self) -> None:
        """Recover or fail meetings that were left in intermediate states after a crash."""
        logger.info("Checking for stale/crashed meetings from previous worker runs...")
        client = get_supabase_client()
        if not client:
            return

        try:
            # Find any meetings in 'joining' or 'recording'
            res = client.table("meetings").select("*").in_("status", ["joining", "recording"]).execute()
            stale_meetings = res.data or []
            for m in stale_meetings:
                mid = m["id"]
                logger.warning("Found stale meeting %s in state '%s'. Marking failed for review.", mid, m["status"])
                db_update_meeting_status(
                    mid,
                    status="failed",
                    error_message="Worker restarted while meeting was active. Marked failed by recovery watchdog.",
                )
                db_record_system_event(
                    level="warning",
                    event_type="worker_recovery",
                    message="Stale meeting marked failed upon worker startup.",
                    meeting_id=mid,
                )
        except Exception as exc:
            logger.error("Error during stale job recovery: %s", exc)

    def check_and_execute_upcoming(self) -> None:
        """Query Supabase for upcoming or queued meetings and run if ready."""
        if self.current_meeting_id:
            # Already running a meeting; personal worker runs 1 meeting at a time
            return

        meetings = db_get_upcoming_meetings(lookahead_minutes=LOOKAHEAD_MINUTES)
        if not meetings:
            return

        for m in meetings:
            meeting_id = m["id"]
            # Attempt atomic claim
            claimed = db_claim_meeting(meeting_id, target_status="joining")
            if not claimed:
                continue

            logger.info("Successfully claimed meeting: %s ('%s')", meeting_id, m.get("title"))
            self.current_meeting_id = meeting_id
            self.current_state = "joining"
            send_heartbeat(status="online", current_meeting_id=meeting_id, current_state="joining")

            try:
                success = execute_meeting_pipeline(m)
                logger.info("Pipeline finished for meeting %s (success=%s)", meeting_id, success)
            except Exception as exc:
                logger.error("Unhandled exception executing meeting %s: %s", meeting_id, exc, exc_info=True)
                db_update_meeting_status(meeting_id, status="failed", error_message=str(exc))
            finally:
                self.current_meeting_id = None
                self.current_state = "idle"
                send_heartbeat(status="online", current_meeting_id=None, current_state="idle")
            break

    def run(self) -> None:
        """Main daemon loop."""
        self.running = True
        signal.signal(signal.SIGTERM, self.handle_signal)
        signal.signal(signal.SIGINT, self.handle_signal)

        logger.info("Scheduler daemon started. Polling every %ds.", POLL_INTERVAL_SECONDS)
        self.recover_stale_jobs()
        send_heartbeat(status="online", current_state="idle")

        while self.running:
            now = time.time()
            # Send periodic heartbeat
            if now - self.last_heartbeat_time >= HEARTBEAT_INTERVAL_SECONDS:
                send_heartbeat(
                    status="online",
                    current_meeting_id=self.current_meeting_id,
                    current_state=self.current_state,
                )
                self.last_heartbeat_time = now

            try:
                self.check_and_execute_upcoming()
            except Exception as exc:
                logger.error("Error in scheduler loop: %s", exc)

            time.sleep(POLL_INTERVAL_SECONDS)

        logger.info("Scheduler daemon stopped.")


def start_scheduler() -> None:
    """Entrypoint function to run the scheduler daemon."""
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
    daemon = SchedulerDaemon()
    daemon.run()


if __name__ == "__main__":
    start_scheduler()
