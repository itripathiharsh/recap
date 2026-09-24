"""Google Meet REST API v2 and OAuth Service Client.

Handles:
1. OAuth 2.0 authorization URL generation with offline access (refresh token).
2. Token exchange and secure server-side storage in credentials/google_meet_token.json.
3. Connection status and account identity querying without exposing secrets.
4. Google Meet REST API v2 conference record and participant/session retrieval.
5. Saving clean participant data to the meeting/job data model.
"""

from datetime import datetime, timezone
import json
import logging
import os
from pathlib import Path
import re
from typing import Any
from urllib.parse import urlparse

from dotenv import load_dotenv
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

load_dotenv()

logger = logging.getLogger("google_meet_client")

DEFAULT_SCOPES = [
    "https://www.googleapis.com/auth/meetings.space.readonly",
]

DEFAULT_TOKEN_PATH = Path(os.getenv("GOOGLE_MEET_TOKEN_PATH", "credentials/google_meet_token.json"))
DEFAULT_RECORDINGS_DIR = Path("data/recordings")
DEFAULT_JOBS_DIR = Path("data/jobs")


def get_oauth_config() -> dict[str, str]:
    """Retrieve OAuth client configuration from environment variables."""
    client_id = os.getenv("GOOGLE_CLIENT_ID", "").strip()
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET", "").strip()
    redirect_uri = os.getenv(
        "GOOGLE_OAUTH_REDIRECT_URI", "http://localhost:8000/api/auth/google/callback"
    ).strip()

    if not client_id or not client_secret:
        logger.warning(
            "GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set. Google Meet OAuth will fail."
        )

    return {
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": redirect_uri,
    }


def generate_auth_url(
    redirect_uri: str | None = None,
    state: str | None = None,
    scopes: list[str] | None = None,
) -> tuple[str, str]:
    """Generate Google OAuth authorization URL requesting offline access.

    Args:
        redirect_uri: Optional override for the redirect URI.
        state: State token for CSRF protection.
        scopes: Optional list of OAuth scopes.

    Returns:
        Tuple of (authorization_url, state).
    """
    config = get_oauth_config()
    target_redirect_uri = redirect_uri or config["redirect_uri"]
    target_scopes = scopes or DEFAULT_SCOPES

    client_config = {
        "web": {
            "client_id": config["client_id"],
            "client_secret": config["client_secret"],
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
        }
    }

    flow = Flow.from_client_config(
        client_config=client_config,
        scopes=target_scopes,
        redirect_uri=target_redirect_uri,
    )

    auth_url, generated_state = flow.authorization_url(
        access_type="offline",
        prompt="consent",
        include_granted_scopes="true",
        state=state,
    )

    return auth_url, generated_state


def exchange_code_for_tokens(
    code: str,
    redirect_uri: str | None = None,
    token_path: Path | None = None,
    scopes: list[str] | None = None,
) -> dict[str, Any]:
    """Exchange authorization code for tokens and save securely server-side.

    Args:
        code: Authorization code received from Google.
        redirect_uri: Redirect URI matching the authorization request.
        token_path: Destination path for token JSON.
        scopes: Expected scopes.

    Returns:
        Dictionary with connection status and sanitized identity.
    """
    config = get_oauth_config()
    target_redirect_uri = redirect_uri or config["redirect_uri"]
    target_scopes = scopes or DEFAULT_SCOPES
    target_token_path = token_path or DEFAULT_TOKEN_PATH

    client_config = {
        "web": {
            "client_id": config["client_id"],
            "client_secret": config["client_secret"],
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
        }
    }

    flow = Flow.from_client_config(
        client_config=client_config,
        scopes=target_scopes,
        redirect_uri=target_redirect_uri,
    )

    flow.fetch_token(code=code)
    creds = flow.credentials

    # Ensure target directory exists
    target_token_path.parent.mkdir(parents=True, exist_ok=True)

    # Persist credentials JSON securely server-side
    token_data = json.loads(creds.to_json())

    # Attempt to extract account identity safely if id_token is present
    identity = None
    if creds.id_token and isinstance(creds.id_token, dict):
        identity = creds.id_token.get("email") or creds.id_token.get("sub")

    if identity:
        token_data["account_identity"] = identity

    with open(target_token_path, "w", encoding="utf-8") as f:
        json.dump(token_data, f, indent=2)

    logger.info("Successfully saved Google Meet OAuth credentials to %s", target_token_path)

    return {
        "connected": True,
        "account_identity": identity,
        "message": "Google Meet OAuth successfully connected",
    }


def get_stored_credentials(token_path: Path | None = None) -> Credentials | None:
    """Load and refresh stored Google OAuth credentials if available.

    Args:
        token_path: Path to stored token file.

    Returns:
        Valid Credentials instance or None.
    """
    target_token_path = token_path or DEFAULT_TOKEN_PATH
    if not target_token_path.exists():
        return None

    try:
        creds = Credentials.from_authorized_user_file(str(target_token_path), DEFAULT_SCOPES)
        if creds and creds.expired and creds.refresh_token:
            logger.info("Refreshing expired Google Meet OAuth credentials...")
            creds.refresh(Request())
            # Save refreshed tokens
            with open(target_token_path, "w", encoding="utf-8") as f:
                f.write(creds.to_json())
        return creds
    except Exception as exc:
        logger.error("Error loading or refreshing Google Meet credentials: %s", exc)
        return None


def get_connection_status(token_path: Path | None = None) -> dict[str, Any]:
    """Check Google Meet API connection status without exposing tokens.

    Args:
        token_path: Path to token file.

    Returns:
        Dictionary with connection status, account identity, and scopes.
    """
    target_token_path = token_path or DEFAULT_TOKEN_PATH
    if not target_token_path.exists():
        return {
            "connected": False,
            "account_identity": None,
            "scopes": [],
            "expires_at": None,
        }

    try:
        creds = get_stored_credentials(target_token_path)
        if not creds or not creds.valid:
            return {
                "connected": False,
                "account_identity": None,
                "scopes": [],
                "expires_at": None,
            }

        # Read identity from saved file if present
        identity = None
        try:
            with open(target_token_path, "r", encoding="utf-8") as f:
                saved = json.load(f)
                identity = saved.get("account_identity")
        except Exception:
            pass

        return {
            "connected": True,
            "account_identity": identity,
            "scopes": list(creds.scopes) if creds.scopes else DEFAULT_SCOPES,
            "expires_at": creds.expiry.isoformat() if creds.expiry else None,
        }
    except Exception as exc:
        logger.warning("Error checking Google Meet status: %s", exc)
        return {
            "connected": False,
            "account_identity": None,
            "scopes": [],
            "expires_at": None,
        }


def extract_meeting_code(meet_link_or_code: str) -> str:
    """Extract standard Google Meet 10-character code (xxx-yyyy-zzz) from URL or code.

    Args:
        meet_link_or_code: Full Google Meet link or bare code.

    Returns:
        Standardized meeting code string.
    """
    cleaned = meet_link_or_code.strip()
    match = re.search(r"([a-z]{3}-[a-z]{4}-[a-z]{3})", cleaned)
    if match:
        return match.group(1)

    # Fallback: check path of URL
    if "meet.google.com" in cleaned:
        parsed = urlparse(cleaned)
        path = parsed.path.strip("/")
        if path:
            return path

    return cleaned


def get_conference_record_for_meeting(
    meet_code: str,
    scheduled_time: datetime | str | None = None,
    credentials: Credentials | None = None,
) -> dict[str, Any] | None:
    """Determine the relevant Google Meet conference record for a meeting code.

    Calls:
    GET https://meet.googleapis.com/v2/conferenceRecords?filter=space.meeting_code = "{meet_code}"

    Args:
        meet_code: Google Meet code (e.g. 'abc-defg-hij').
        scheduled_time: Optional datetime to select the closest conference record.
        credentials: Optional Google Credentials override.

    Returns:
        Conference record dictionary or None.
    """
    creds = credentials or get_stored_credentials()
    if not creds:
        logger.warning("Google Meet credentials not available for conference record lookup.")
        return None

    code = extract_meeting_code(meet_code)
    try:
        service = build("meet", "v2", credentials=creds, cache_discovery=False)
        filter_expr = f'space.meeting_code = "{code}"'
        response = service.conferenceRecords().list(filter=filter_expr).execute()
        records = response.get("conferenceRecords", [])

        if not records:
            logger.info("No conference records found for meeting code: %s", code)
            return None

        if len(records) == 1:
            return records[0]

        # If multiple records exist, pick the one closest to scheduled_time or most recent
        if scheduled_time:
            target_dt = (
                scheduled_time
                if isinstance(scheduled_time, datetime)
                else datetime.fromisoformat(str(scheduled_time).replace("Z", "+00:00"))
            )
            if target_dt.tzinfo is None:
                target_dt = target_dt.replace(tzinfo=timezone.utc)

            def get_dt_diff(record: dict[str, Any]) -> float:
                st = record.get("startTime")
                if not st:
                    return float("inf")
                rec_dt = datetime.fromisoformat(st.replace("Z", "+00:00"))
                return abs((rec_dt - target_dt).total_seconds())

            sorted_records = sorted(records, key=get_dt_diff)
            return sorted_records[0]

        # Return latest record by startTime
        return records[0]

    except HttpError as exc:
        logger.error("HTTP error fetching conference records for %s: %s", code, exc)
        return None
    except Exception as exc:
        logger.error("Unexpected error fetching conference records for %s: %s", code, exc)
        return None


def get_meeting_participants(
    conference_record_name: str,
    credentials: Credentials | None = None,
) -> list[dict[str, Any]]:
    """Retrieve participants and their sessions for a conference record via Google Meet REST API.

    Calls:
    GET https://meet.googleapis.com/v2/{conferenceRecord}/participants
    GET https://meet.googleapis.com/v2/{participant}/participantSessions

    Args:
        conference_record_name: Resource name (e.g. 'conferenceRecords/Cxxxxxxxx').
        credentials: Optional Google Credentials override.

    Returns:
        List of clean participant dictionaries.
    """
    creds = credentials or get_stored_credentials()
    if not creds:
        logger.warning("Google Meet credentials not available for participant lookup.")
        return []

    try:
        service = build("meet", "v2", credentials=creds, cache_discovery=False)
        participants_response = (
            service.conferenceRecords().participants().list(parent=conference_record_name).execute()
        )
        raw_participants = participants_response.get("participants", [])

        clean_participants: list[dict[str, Any]] = []

        for p in raw_participants:
            p_name = p.get("name")
            display_name = None
            user_type = "unknown"

            if "signedinUser" in p and p["signedinUser"]:
                user_type = "signed_in"
                display_name = p["signedinUser"].get("displayName")
            elif "anonymousUser" in p and p["anonymousUser"]:
                user_type = "anonymous"
                display_name = p["anonymousUser"].get("displayName")
            elif "phoneUser" in p and p["phoneUser"]:
                user_type = "phone"
                display_name = p["phoneUser"].get("displayName")

            # Retrieve participant sessions
            sessions: list[dict[str, Any]] = []
            if p_name:
                try:
                    sess_resp = (
                        service.conferenceRecords()
                        .participants()
                        .participantSessions()
                        .list(parent=p_name)
                        .execute()
                    )
                    for s in sess_resp.get("participantSessions", []):
                        sessions.append({
                            "session_id": s.get("name"),
                            "start_time": s.get("startTime"),
                            "end_time": s.get("endTime"),
                        })
                except Exception as s_exc:
                    logger.debug("Could not fetch sessions for %s: %s", p_name, s_exc)

            clean_participants.append({
                "participant_id": p_name,
                "displayName": display_name,
                "user_type": user_type,
                "earliestStartTime": p.get("earliestStartTime"),
                "latestEndTime": p.get("latestEndTime"),
                "sessions": sessions,
                "source": "google_meet_api",
            })

        logger.info(
            "Retrieved %d participants from Google Meet API for %s",
            len(clean_participants),
            conference_record_name,
        )
        return clean_participants

    except HttpError as exc:
        logger.error("HTTP error fetching participants for %s: %s", conference_record_name, exc)
        return []
    except Exception as exc:
        logger.error("Unexpected error fetching participants for %s: %s", conference_record_name, exc)
        return []


def save_meeting_participants(
    meeting_id: str,
    participants: list[dict[str, Any]],
    source: str = "google_meet_api",
    conference_record: str | None = None,
    recordings_dir: Path | None = None,
    jobs_dir: Path | None = None,
) -> dict[str, Any]:
    """Save clean participant data to the existing meeting/job data model.

    Writes to data/recordings/{meeting_id}/participants.json and updates
    data/jobs/{meeting_id}.json.

    Args:
        meeting_id: Unique meeting identifier.
        participants: Clean participant list.
        source: Source identifier ('google_meet_api' or 'dom_fallback').
        conference_record: Google conference record identifier if available.
        recordings_dir: Directory for recording storage.
        jobs_dir: Directory for job state JSON files.

    Returns:
        Structured participant payload.
    """
    rec_dir = (recordings_dir or DEFAULT_RECORDINGS_DIR) / meeting_id
    rec_dir.mkdir(parents=True, exist_ok=True)
    participants_file = rec_dir / "participants.json"

    payload = {
        "meeting_id": meeting_id,
        "source": source,
        "conference_record": conference_record,
        "retrieved_at": datetime.now(timezone.utc).isoformat(),
        "participants": participants,
    }

    participants_file.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    logger.info("Saved %d participants for %s to %s", len(participants), meeting_id, participants_file)

    # Update local job JSON
    j_dir = jobs_dir or DEFAULT_JOBS_DIR
    job_file = j_dir / f"{meeting_id}.json"
    if job_file.exists():
        try:
            with open(job_file, "r", encoding="utf-8") as f:
                job_data = json.load(f)
            job_data["participants"] = participants
            job_data["participants_source"] = source
            if conference_record:
                job_data["conference_record"] = conference_record
            job_data["updated_at"] = datetime.now(timezone.utc).isoformat()
            with open(job_file, "w", encoding="utf-8") as f:
                json.dump(job_data, f, indent=2)
        except Exception as j_exc:
            logger.warning("Could not update job file with participants for %s: %s", meeting_id, j_exc)

    return payload
