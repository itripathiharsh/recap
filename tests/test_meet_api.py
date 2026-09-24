"""Unit tests for Google Meet REST API OAuth integration and speaker mapping engine."""

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient
import pytest

from src.api import app, _oauth_states
from src.google_meet_client import (
    extract_meeting_code,
    get_meeting_participants,
    save_meeting_participants,
)
from src.speaker_resolver import resolve_speaker_names

client = TestClient(app)


# --- 1. OAuth Endpoints Tests ---

def test_google_auth_endpoint_redirect() -> None:
    """Verify GET /api/auth/google generates authorization URL with offline access and redirects."""
    resp = client.get("/api/auth/google", follow_redirects=False)
    assert resp.status_code == 307
    location = resp.headers.get("location", "")
    assert "accounts.google.com" in location
    assert "access_type=offline" in location
    assert "prompt=consent" in location
    assert "state=" in location
    assert "meetings.space.readonly" in location


def test_google_auth_endpoint_json() -> None:
    """Verify GET /api/auth/google?json=true returns authorization URL and state in JSON."""
    resp = client.get("/api/auth/google?json=true")
    assert resp.status_code == 200
    data = resp.json()
    assert "authorization_url" in data
    assert "state" in data
    assert "access_type=offline" in data["authorization_url"]
    assert data["state"] in _oauth_states


def test_google_auth_callback_invalid_state() -> None:
    """Verify GET /api/auth/google/callback rejects requests with invalid or missing CSRF state."""
    # Missing state
    resp = client.get("/api/auth/google/callback?code=mock_code")
    assert resp.status_code == 400

    # Invalid state
    resp = client.get("/api/auth/google/callback?code=mock_code&state=nonexistent_state")
    assert resp.status_code == 400
    assert "CSRF verification failed" in resp.json()["detail"]


@patch("src.api.exchange_code_for_tokens")
def test_google_auth_callback_success(mock_exchange: MagicMock) -> None:
    """Verify successful OAuth callback validates state, exchanges tokens, and never exposes tokens."""
    mock_exchange.return_value = {
        "connected": True,
        "account_identity": "testuser@gmail.com",
        "message": "Google Meet OAuth successfully connected",
    }

    # Generate legitimate state
    init_resp = client.get("/api/auth/google?json=true")
    state = init_resp.json()["state"]

    callback_resp = client.get(f"/api/auth/google/callback?code=test_auth_code&state={state}")
    assert callback_resp.status_code == 200
    assert "Google Meet Connected" in callback_resp.text
    assert "testuser@gmail.com" in callback_resp.text
    # Ensure tokens are never exposed in response
    assert "access_token" not in callback_resp.text
    assert "refresh_token" not in callback_resp.text
    assert "client_secret" not in callback_resp.text


def test_google_auth_status_disconnected(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify GET /api/auth/google/status returns disconnected when no token exists."""
    monkeypatch.setattr(
        "src.google_meet_client.DEFAULT_TOKEN_PATH",
        tmp_path / "nonexistent_token.json",
    )
    resp = client.get("/api/auth/google/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["connected"] is False
    assert data["account_identity"] is None
    assert "access_token" not in data
    assert "refresh_token" not in data


def test_google_auth_status_connected(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify GET /api/auth/google/status returns connected state without exposing secrets."""
    token_file = tmp_path / "google_meet_token.json"
    token_file.write_text(
        json.dumps({
            "token": "mock-access-token-12345",
            "refresh_token": "mock-refresh-token-67890",
            "token_uri": "https://oauth2.googleapis.com/token",
            "client_id": "test-client.apps.googleusercontent.com",
            "client_secret": "test-client-secret",
            "scopes": ["https://www.googleapis.com/auth/meetings.space.readonly"],
            "account_identity": "harsh@example.com",
        }),
        encoding="utf-8",
    )
    monkeypatch.setattr("src.google_meet_client.DEFAULT_TOKEN_PATH", token_file)

    mock_creds = MagicMock()
    mock_creds.valid = True
    mock_creds.scopes = ["https://www.googleapis.com/auth/meetings.space.readonly"]
    mock_creds.expiry = None

    with patch("src.google_meet_client.get_stored_credentials", return_value=mock_creds):
        resp = client.get("/api/auth/google/status")
        assert resp.status_code == 200
        data = resp.json()
        assert data["connected"] is True
        assert data["account_identity"] == "harsh@example.com"
        assert "access_token" not in data
        assert "refresh_token" not in data
        assert "client_secret" not in data


# --- 2. Google Meet REST API v2 Participant Retrieval Tests ---

def test_extract_meeting_code() -> None:
    """Verify meeting code extraction handles full URLs and bare codes."""
    assert extract_meeting_code("https://meet.google.com/abc-defg-hij") == "abc-defg-hij"
    assert extract_meeting_code("https://meet.google.com/abc-defg-hij?authuser=0") == "abc-defg-hij"
    assert extract_meeting_code("abc-defg-hij") == "abc-defg-hij"


@patch("src.google_meet_client.build")
def test_get_meeting_participants_mocked(mock_build: MagicMock) -> None:
    """Verify participant and session parsing from mocked Google Meet API v2 response."""
    mock_service = MagicMock()
    mock_build.return_value = mock_service

    # Mock participants list
    mock_service.conferenceRecords().participants().list().execute.return_value = {
        "participants": [
            {
                "name": "conferenceRecords/conf-123/participants/part-1",
                "earliestStartTime": "2026-09-22T10:00:00Z",
                "latestEndTime": "2026-09-22T10:30:00Z",
                "signedinUser": {
                    "user": "users/user-1",
                    "displayName": "Harsh Vardhan Tripathi",
                },
            },
            {
                "name": "conferenceRecords/conf-123/participants/part-2",
                "earliestStartTime": "2026-09-22T10:02:00Z",
                "latestEndTime": "2026-09-22T10:28:00Z",
                "anonymousUser": {
                    "displayName": "Mohit Sharma",
                },
            },
            {
                "name": "conferenceRecords/conf-123/participants/part-3",
                "earliestStartTime": "2026-09-22T10:05:00Z",
                "latestEndTime": "2026-09-22T10:20:00Z",
                "phoneUser": {
                    "displayName": "+1 555-0199",
                },
            },
        ]
    }

    # Mock participant sessions
    mock_service.conferenceRecords().participants().participantSessions().list().execute.return_value = {
        "participantSessions": [
            {
                "name": "conferenceRecords/conf-123/participants/part-1/participantSessions/sess-1",
                "startTime": "2026-09-22T10:00:00Z",
                "endTime": "2026-09-22T10:30:00Z",
            }
        ]
    }

    mock_creds = MagicMock()
    participants = get_meeting_participants("conferenceRecords/conf-123", credentials=mock_creds)

    assert len(participants) == 3

    # Check participant 1 (signed_in)
    p1 = participants[0]
    assert p1["displayName"] == "Harsh Vardhan Tripathi"
    assert p1["user_type"] == "signed_in"
    assert p1["earliestStartTime"] == "2026-09-22T10:00:00Z"
    assert p1["latestEndTime"] == "2026-09-22T10:30:00Z"
    assert p1["source"] == "google_meet_api"
    assert len(p1["sessions"]) == 1

    # Check participant 2 (anonymous)
    p2 = participants[1]
    assert p2["displayName"] == "Mohit Sharma"
    assert p2["user_type"] == "anonymous"
    assert p2["source"] == "google_meet_api"

    # Check participant 3 (phone)
    p3 = participants[2]
    assert p3["displayName"] == "+1 555-0199"
    assert p3["user_type"] == "phone"
    assert p3["source"] == "google_meet_api"


def test_get_meeting_participants_endpoint_dom_fallback(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify GET /api/meetings/{id}/participants falls back to DOM participant extraction."""
    meeting_id = "test-fallback-meet"

    # Mock get_meeting_endpoint
    monkeypatch.setattr(
        "src.api.get_meeting_endpoint",
        lambda m_id: {
            "id": meeting_id,
            "title": "Fallback Test Meeting",
            "meet_link": "https://meet.google.com/abc-defg-hij",
            "scheduled_start": "2026-09-22T10:00:00Z",
        },
    )
    # Mock Google Meet API as disconnected
    monkeypatch.setattr(
        "src.api.get_connection_status",
        lambda: {"connected": False, "account_identity": None},
    )

    # Set up DOM fallback participants file
    rec_dir = tmp_path / meeting_id
    rec_dir.mkdir(parents=True, exist_ok=True)
    p_file = rec_dir / "participants.json"
    p_file.write_text(
        json.dumps({
            "meeting_id": meeting_id,
            "source": "dom_fallback",
            "participants": [
                {"displayName": "Alice Smith", "user_type": "unknown", "source": "dom_fallback"},
                {"displayName": "Bob Jones", "user_type": "unknown", "source": "dom_fallback"},
            ],
        }),
        encoding="utf-8",
    )
    monkeypatch.setattr("src.api.DEFAULT_RECORDINGS_DIR", tmp_path)

    resp = client.get(f"/api/meetings/{meeting_id}/participants")
    assert resp.status_code == 200
    data = resp.json()
    assert data["source"] == "dom_fallback"
    assert len(data["participants"]) == 2
    assert data["participants"][0]["displayName"] == "Alice Smith"
    assert data["participants"][1]["displayName"] == "Bob Jones"


# --- 3. Speaker Mapping Engine Tests ---

def test_speaker_mapping_single_speaker() -> None:
    """Verify single-speaker detection maps to sole participant/target user with 100% confidence."""
    turns = [
        {"speaker": "SPEAKER_00", "start": 0.0, "end": 10.0, "text": "Hello world, this is a test update."},
        {"speaker": "SPEAKER_00", "start": 10.5, "end": 20.0, "text": "Everything is running smoothly."},
    ]
    participants = [{"displayName": "Harsh Vardhan Tripathi", "source": "google_meet_api"}]

    updated_turns, mapping = resolve_speaker_names(
        turns=turns,
        user_name="Harsh Vardhan Tripathi",
        participants=participants,
    )

    assert mapping["SPEAKER_00"] == "Harsh Vardhan Tripathi"
    assert updated_turns[0]["speaker"] == "Harsh Vardhan Tripathi"
    assert updated_turns[1]["speaker"] == "Harsh Vardhan Tripathi"


def test_speaker_mapping_insufficient_evidence_retains_speaker_id() -> None:
    """Verify that when evidence is insufficient, speaker IDs (SPEAKER_00) are retained without guessing."""
    turns = [
        {"speaker": "SPEAKER_00", "start": 0.0, "end": 5.0, "text": "Good morning everyone."},
        {"speaker": "SPEAKER_01", "start": 5.2, "end": 10.0, "text": "Yes, good morning."},
    ]
    # No Gemini API keys provided -> strict retention of generic labels
    updated_turns, mapping = resolve_speaker_names(
        turns=turns,
        user_name="Harsh Vardhan Tripathi",
        participants=[{"displayName": "Alice"}, {"displayName": "Bob"}],
        gemini_keys=[],
    )

    # Must retain generic labels; never guess!
    assert mapping["SPEAKER_00"] == "SPEAKER_00"
    assert mapping["SPEAKER_01"] == "SPEAKER_01"
    assert updated_turns[0]["speaker"] == "SPEAKER_00"
    assert updated_turns[1]["speaker"] == "SPEAKER_01"
