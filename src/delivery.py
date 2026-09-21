"""MOM delivery module: renders mom.md and delivers via Gmail API or local file fallback.

Per API_SPECS.md §1 and SPEC.md §4.4:
- Input: data/recordings/{meeting_id}/mom.json (job must be status="mom_ready")
- Renders mom.md (human-readable markdown per SCHEMA.md §7)
- Sends via Gmail API to OWNER_EMAIL.
- On email failure or missing credentials, does NOT mark the job 'failed':
  mom.md is saved to disk, so falls back to status 'delivered' with a note in the
  job's error field: 'email failed, file saved locally: <reason>'.
- Updates job status to 'delivered'.
"""

import argparse
import base64
from email.mime.text import MIMEText
import json
import logging
import os
from pathlib import Path
from typing import Any, Callable

from src.job_state import (
    JobStatus,
    get_job,
    update_job_status,
)

logger = logging.getLogger(__name__)

DEFAULT_RECORDINGS_DIR = Path("data/recordings")
DEFAULT_JOBS_DIR = Path("data/jobs")
DEFAULT_CREDENTIALS_PATH = Path(os.getenv("GMAIL_API_CREDENTIALS_PATH", "./credentials/gmail_credentials.json"))
GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.send"]


class DeliveryError(Exception):
    """Raised when critical delivery preconditions are violated (e.g. missing mom.json)."""


def render_markdown(
    mom_data: dict[str, Any],
    title: str = "Meeting",
    date: str = "",
) -> str:
    """Render structured mom.json into human-readable mom.md.

    Args:
        mom_data: Validated MOM dictionary matching SCHEMA.md §6.
        title: Meeting title.
        date: Meeting date (YYYY-MM-DD).

    Returns:
        Formatted markdown string.
    """
    meeting_id = mom_data.get("meeting_id", "")
    summary = mom_data.get("summary", "").strip()
    decisions = mom_data.get("decisions", [])
    action_items = mom_data.get("action_items", [])
    open_questions = mom_data.get("open_questions", [])

    lines = [
        f"# Minutes of Meeting: {title}",
        f"**Date:** {date}  ",
        f"**Meeting ID:** `{meeting_id}`  \n",
        "## Summary",
        summary if summary else "_No summary provided._",
        "\n## Key Decisions",
    ]

    if decisions:
        for d in decisions:
            lines.append(f"- {d}")
    else:
        lines.append("_No decisions recorded._")

    lines.append("\n## Action Items")
    if action_items:
        lines.append("| Task | Owner | Due Date |")
        lines.append("|---|---|---|")
        for item in action_items:
            task = item.get("task", "").replace("|", "\\|")
            owner = item.get("owner", "unassigned").replace("|", "\\|")
            due = item.get("due", "not specified").replace("|", "\\|")
            lines.append(f"| {task} | {owner} | {due} |")
    else:
        lines.append("_No action items recorded._")

    lines.append("\n## Open Questions")
    if open_questions:
        for q in open_questions:
            lines.append(f"- {q}")
    else:
        lines.append("_No open questions recorded._")

    lines.append("")
    return "\n".join(lines)


def _send_via_gmail_api(
    subject: str,
    body: str,
    recipient: str,
    credentials_path: Path,
) -> None:
    """Send an email using the Gmail REST API with OAuth2 credentials.

    Args:
        subject: Email subject line.
        body: Plain text / markdown content of the email.
        recipient: Destination email address.
        credentials_path: Path to client credentials JSON.

    Raises:
        FileNotFoundError: If credentials_path does not exist.
        Exception: If authentication or sending fails.
    """
    if not credentials_path.exists():
        raise FileNotFoundError(f"Gmail credentials file not found: {credentials_path}")

    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow
    from googleapiclient.discovery import build

    token_path = credentials_path.parent / "gmail_token.json"
    creds = None

    if token_path.exists():
        creds = Credentials.from_authorized_user_file(str(token_path), GMAIL_SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            from google.auth.transport.requests import Request
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(str(credentials_path), GMAIL_SCOPES)
            creds = flow.run_local_server(port=0)
        with open(token_path, "w", encoding="utf-8") as token_file:
            token_file.write(creds.to_json())

    service = build("gmail", "v1", credentials=creds)

    message = MIMEText(body, "plain", "utf-8")
    message["to"] = recipient
    message["subject"] = subject

    raw_message = base64.urlsafe_b64encode(message.as_bytes()).decode("utf-8")
    service.users().messages().send(userId="me", body={"raw": raw_message}).execute()
    logger.info("Successfully sent email via Gmail API to %s", recipient)


def deliver(
    meeting_id: str,
    recordings_dir: Path | None = None,
    jobs_dir: Path | None = None,
    credentials_path: Path | None = None,
    force: bool = False,
    send_fn: Callable[[str, str, str, Path], None] | None = None,
) -> dict[str, Any]:
    """Deliver MOM by rendering mom.md and emailing the owner or falling back locally.

    Input: data/recordings/{meeting_id}/mom.json (job must be status="mom_ready")
    Output: data/recordings/{meeting_id}/mom.md
    Updates job status to 'delivered' (even on email failure, with error note).

    Args:
        meeting_id: Unique identifier for the meeting.
        recordings_dir: Optional directory containing recordings.
        jobs_dir: Optional directory containing jobs.
        credentials_path: Optional path to gmail_credentials.json.
        force: If True, bypass initial status checks.
        send_fn: Optional email sender callable for testing/dependency injection.

    Returns:
        Dictionary with meeting_id, mom_md_path, delivered_via, and email_status.

    Raises:
        DeliveryError: If mom.json is missing or unreadable.
    """
    rec_dir = (recordings_dir if recordings_dir is not None else DEFAULT_RECORDINGS_DIR) / meeting_id
    mom_json_path = rec_dir / "mom.json"
    mom_md_path = rec_dir / "mom.md"
    j_dir = jobs_dir if jobs_dir is not None else DEFAULT_JOBS_DIR
    creds_path = credentials_path if credentials_path is not None else DEFAULT_CREDENTIALS_PATH

    if not mom_json_path.exists():
        raise DeliveryError(f"mom.json not found at {mom_json_path}")

    # Read job info
    title = "Meeting"
    date_str = ""
    try:
        job = get_job(meeting_id, jobs_dir=j_dir)
        current_status = job.get("status")
        if not force and current_status != JobStatus.MOM_READY.value:
            logger.warning("Job %s is in status '%s', expected '%s'", meeting_id, current_status, JobStatus.MOM_READY.value)
        title = job.get("title") or "Meeting"
        if job.get("scheduled_start"):
            date_str = str(job["scheduled_start"])[:10]
    except Exception as exc:
        logger.warning("Could not read job state for %s: %s", meeting_id, exc)

    # Read and parse mom.json
    try:
        with open(mom_json_path, "r", encoding="utf-8") as f:
            mom_data = json.load(f)
    except Exception as exc:
        raise DeliveryError(f"Failed to read/parse mom.json at {mom_json_path}: {exc}") from exc

    # Render mom.md
    rendered_md = render_markdown(mom_data, title=title, date=date_str)

    # Save mom.md atomically
    temp_md = mom_md_path.with_suffix(".md.tmp")
    temp_md.write_text(rendered_md, encoding="utf-8")
    temp_md.replace(mom_md_path)
    logger.info("Successfully saved mom.md at %s", mom_md_path)

    # Attempt email delivery
    owner_email = os.getenv("OWNER_EMAIL", "").strip()
    subject = f"MOM: {title} — {date_str}" if date_str else f"MOM: {title}"
    email_error: str | None = None

    if not owner_email:
        email_error = "OWNER_EMAIL environment variable is not set"
        logger.warning("Email delivery skipped: %s", email_error)
    else:
        try:
            if send_fn is not None:
                send_fn(subject, rendered_md, owner_email, creds_path)
            else:
                _send_via_gmail_api(subject, rendered_md, owner_email, creds_path)
            logger.info("Email delivery succeeded for %s to %s", meeting_id, owner_email)
        except Exception as exc:
            email_error = f"email failed, file saved locally: {exc}"
            logger.warning("Email delivery failed for %s: %s. Falling back to local file.", meeting_id, exc)

    # Update job state to 'delivered'
    # Per API_SPECS.md §1: On email failure, job status is STILL 'delivered',
    # with a note in the job's error field.
    delivery_note = email_error if email_error else None
    try:
        update_job_status(
            meeting_id=meeting_id,
            new_status=JobStatus.DELIVERED.value,
            error=delivery_note,
            jobs_dir=j_dir,
            force=force,
        )
    except Exception as exc:
        logger.warning("Could not update job status for %s to 'delivered': %s", meeting_id, exc)

    return {
        "meeting_id": meeting_id,
        "mom_md_path": str(mom_md_path),
        "delivered_via": "email" if email_error is None else "local_file_fallback",
        "email_status": "sent" if email_error is None else f"failed ({email_error})",
    }


def main() -> None:
    """CLI entrypoint for delivery.py."""
    parser = argparse.ArgumentParser(description="Deliver Minutes of Meeting (MOM)")
    parser.add_argument("--meeting-id", required=True, help="Unique meeting identifier")
    parser.add_argument("--force", action="store_true", help="Bypass status check")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")

    try:
        result = deliver(meeting_id=args.meeting_id, force=args.force)
        print(f"Delivery completed: {result}")
    except Exception as exc:
        logger.error("Delivery failed: %s", exc)
        sys.exit(1)


if __name__ == "__main__":
    main()
