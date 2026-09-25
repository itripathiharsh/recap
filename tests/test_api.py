"""Unit tests for src/api.py."""

from datetime import datetime, timezone
import pytest
from fastapi.testclient import TestClient
from src.api import app

client = TestClient(app)


def test_system_status() -> None:
    """Verify /api/system/status returns expected health and hardware metrics."""
    resp = client.get("/api/system/status")
    assert resp.status_code == 200
    data = resp.json()
    assert "worker_status" in data
    assert "disk_usage" in data
    assert "models_available" in data
    assert "total_gb" in data["disk_usage"]
    assert "free_gb" in data["disk_usage"]


def test_worker_heartbeat() -> None:
    """Verify /api/worker/heartbeat updates worker state and is reflected in system status."""
    payload = {
        "status": "online",
        "current_meeting": "test-sync-123",
        "metadata": {"cpu_percent": 15.2},
    }
    resp = client.post("/api/worker/heartbeat", json=payload)
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"

    status_resp = client.get("/api/system/status")
    assert status_resp.status_code == 200
    status_data = status_resp.json()
    assert status_data["worker_status"] == "online"
    assert status_data["current_meeting"] == "test-sync-123"


def _cleanup_test_meeting(meeting_id: str) -> None:
    client.delete(f"/api/meetings/{meeting_id}")
    try:
        from src.supabase_client import get_supabase_client

        sb = get_supabase_client()
        if sb:
            sb.table("meetings").delete().eq("id", meeting_id).execute()
    except Exception:
        pass
    try:
        from pathlib import Path

        jf = Path(f"data/jobs/{meeting_id}.json")
        if jf.exists():
            jf.unlink(missing_ok=True)
    except Exception:
        pass


def test_create_and_get_meeting() -> None:
    """Verify creating a meeting and retrieving it via API."""
    now_iso = datetime.now(timezone.utc).isoformat()
    req = {
        "title": "API Test Sync",
        "meet_link": "https://meet.google.com/abc-defg-hij",
        "scheduled_start": now_iso,
        "expected_duration_minutes": 45,
    }
    create_resp = client.post("/api/meetings", json=req)
    assert create_resp.status_code == 201
    meeting_data = create_resp.json()
    assert "id" in meeting_data
    meeting_id = meeting_data["id"]

    try:
        # Get details
        get_resp = client.get(f"/api/meetings/{meeting_id}")
        assert get_resp.status_code == 200
        assert get_resp.json()["title"] == "API Test Sync"
        assert get_resp.json()["meet_link"] == "https://meet.google.com/abc-defg-hij"

        # List
        list_resp = client.get("/api/meetings")
        assert list_resp.status_code == 200
        assert any(m["id"] == meeting_id for m in list_resp.json())
    finally:
        _cleanup_test_meeting(meeting_id)


def test_cancel_meeting() -> None:
    """Verify cancelling a meeting updates its status."""
    now_iso = datetime.now(timezone.utc).isoformat()
    create_resp = client.post(
        "/api/meetings",
        json={
            "title": "Meeting to Cancel",
            "meet_link": "https://meet.google.com/abc-defg-hij",
            "scheduled_start": now_iso,
            "expected_duration_minutes": 30,
        },
    )
    meeting_id = create_resp.json()["id"]

    try:
        cancel_resp = client.post(f"/api/meetings/{meeting_id}/cancel")
        assert cancel_resp.status_code == 200

        status_resp = client.get(f"/api/meetings/{meeting_id}/status")
        assert status_resp.status_code == 200
        assert status_resp.json()["status"] == "cancelled"
    finally:
        _cleanup_test_meeting(meeting_id)


def test_loopback_detection() -> None:
    """Loopback clients (worker heartbeat, OAuth callback) bypass the token."""
    from starlette.requests import Request

    from src.api import _client_is_loopback

    def _req(host: str) -> Request:
        return Request(
            {
                "type": "http",
                "method": "GET",
                "path": "/",
                "headers": [],
                "client": (host, 1),
            }
        )

    assert _client_is_loopback(_req("127.0.0.1"))
    assert _client_is_loopback(_req("::1"))
    assert not _client_is_loopback(_req("203.0.113.5"))


def test_remote_requires_token_when_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    """When FASTAPI_AUTH_TOKEN is set, remote callers need a matching header."""
    monkeypatch.setenv("FASTAPI_AUTH_TOKEN", "unit-test-token")

    # Public paths stay reachable without the token.
    assert client.get("/health").status_code == 200

    # Protected path: no token -> 403, wrong token -> 403, right token -> 200.
    assert client.get("/api/system/status").status_code == 403
    assert (
        client.get(
            "/api/system/status", headers={"X-Internal-Token": "wrong"}
        ).status_code
        == 403
    )
    ok = client.get(
        "/api/system/status", headers={"X-Internal-Token": "unit-test-token"}
    )
    assert ok.status_code == 200


def test_remote_open_when_token_unset(monkeypatch: pytest.MonkeyPatch) -> None:
    """Legacy behaviour: remote access allowed while FASTAPI_AUTH_TOKEN is unset."""
    monkeypatch.delenv("FASTAPI_AUTH_TOKEN", raising=False)
    assert client.get("/api/system/status").status_code == 200
