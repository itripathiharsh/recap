"""Phase 2 workspace RLS + member-management RPC tests.

Covers the meeting-visibility matrix (private / participants / organisation),
organisation roster access, and the role/removal/invitation RPC guards.

Skips cleanly (entire module) unless:
  * SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are set in .env
  * The Phase 2 migrations are already applied to the target project

All seeded data uses a unique ``phase1-test-`` prefix and is removed on teardown.
The service-role key is used ONLY for user/roster/meeting seeding and cleanup;
every assertion runs through real authenticated user sessions so RLS is enforced.
"""

from __future__ import annotations

import os
import uuid
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

URL = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
ANON = os.getenv("SUPABASE_ANON_KEY", "").strip()
SERVICE = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()

_missing = [
    name
    for name, value in (
        ("SUPABASE_URL", URL),
        ("SUPABASE_ANON_KEY", ANON),
        ("SUPABASE_SERVICE_ROLE_KEY", SERVICE),
    )
    if not value
]
if _missing:
    pytest.skip(
        f"workspace RLS tests need {', '.join(_missing)} in .env "
        "(run scripts/verify_phase1.py without a service key for read-only checks)",
        allow_module_level=True,
    )

from supabase import create_client  # noqa: E402

TEST_PREFIX = "phase1-test-"
PASSWORD = "Phase1-Test-Passw0rd!"


def _first(payload: Any) -> dict[str, Any]:
    """PostgREST returns composite RPC results as a one-element list or object."""
    if isinstance(payload, list):
        return payload[0] if payload else {}
    return payload or {}


def _rpc_error_text(err: BaseException) -> str:
    return str(getattr(err, "message", "") or err)


@pytest.fixture(scope="module")
def env() -> Iterator[dict[str, Any]]:
    """Seed users, an organisation and meetings; tear everything down after."""
    service = create_client(URL, SERVICE)
    run_id = uuid.uuid4().hex[:8]
    created_user_ids: list[str] = []

    # --- schema gate: migrations must be applied -------------------------
    try:
        (
            service.table("meetings")
            .select("owner_id, visibility, workspace_type")
            .limit(1)
            .execute()
        )
        service.table("organisation_members").select("email").limit(1).execute()
    except Exception as err:  # pragma: no cover - environment dependent
        pytest.skip(
            f"Phase 2 workspace migrations not applied on this project: {err}",
            allow_module_level=False,
        )

    def make_user(label: str) -> tuple[str, str]:
        email = f"{TEST_PREFIX}{run_id}-{label}@example.com"
        res = service.auth.admin.create_user(
            {"email": email, "password": PASSWORD, "email_confirm": True}
        )
        user_id = res.user.id
        created_user_ids.append(user_id)
        return email, user_id

    owner_email, owner_id = make_user("owner")
    admin_email, admin_id = make_user("admin")
    member_email, member_id = make_user("member")
    outsider_email, outsider_id = make_user("outsider")

    def login(email: str):
        client = create_client(URL, ANON)
        client.auth.sign_in_with_password({"email": email, "password": PASSWORD})
        return client

    owner = login(owner_email)
    outsider = login(outsider_email)

    # --- organisation via the real RPC ------------------------------------
    org = _first(
        owner.rpc("create_organisation", {"p_name": f"{TEST_PREFIX}org {run_id}"})
        .execute()
        .data
    )
    org_id = org["id"]

    # --- roster (service-role seeding; assertions still go through RLS) ---
    service.table("organisation_members").insert(
        [
            {
                "organisation_id": org_id,
                "user_id": admin_id,
                "role": "admin",
                "status": "active",
                "email": admin_email,
                "display_name": "Phase1 Admin",
            },
            {
                "organisation_id": org_id,
                "user_id": member_id,
                "role": "member",
                "status": "active",
                "email": member_email,
                "display_name": "Phase1 Member",
            },
        ]
    ).execute()

    def make_meeting(client, title: str, **extra: Any) -> str:
        row = _first(
            client.table("meetings")
            .insert(
                {
                    "title": title,
                    "meet_link": "https://meet.google.com/aaa-bbbb-ccc",
                    "scheduled_start": "2026-01-01T10:00:00+00:00",
                    "expected_duration_minutes": 30,
                    "status": "scheduled",
                    **extra,
                }
            )
            .select()
            .execute()
            .data
        )
        return row["id"]

    base = f"{TEST_PREFIX}{run_id}"
    m_private = make_meeting(
        owner, f"{base}-private", organisation_id=org_id, visibility="private"
    )
    m_org = make_meeting(
        owner, f"{base}-org", organisation_id=org_id, visibility="organisation"
    )
    m_participants = make_meeting(
        owner, f"{base}-participants", organisation_id=org_id, visibility="participants"
    )
    m_outsider = make_meeting(outsider, f"{base}-outsider")

    # explicit participant share for the member on the participants meeting
    owner.table("meeting_participants").insert(
        {"meeting_id": m_participants, "user_id": member_id}
    ).execute()

    yield {
        "service": service,
        "run_id": run_id,
        "org_id": org_id,
        "ids": {
            "owner": owner_id,
            "admin": admin_id,
            "member": member_id,
            "outsider": outsider_id,
        },
        "emails": {
            "owner": owner_email,
            "admin": admin_email,
            "member": member_email,
            "outsider": outsider_email,
        },
        "login": login,
        "users": created_user_ids,
        "meetings": {
            "private": m_private,
            "org": m_org,
            "participants": m_participants,
            "outsider": m_outsider,
        },
    }

    # --- teardown ---------------------------------------------------------
    try:
        service.table("meeting_participants").delete().in_(
            "meeting_id", [m_private, m_org, m_participants, m_outsider]
        ).execute()
        service.table("meetings").delete().in_(
            "id", [m_private, m_org, m_participants, m_outsider]
        ).execute()
    except Exception:
        pass
    try:
        service.table("organisation_invitations").delete().eq(
            "organisation_id", org_id
        ).execute()
        service.table("organisation_members").delete().eq(
            "organisation_id", org_id
        ).execute()
        service.table("organisations").delete().eq("id", org_id).execute()
    except Exception:
        pass
    for uid in created_user_ids:
        try:
            service.auth.admin.delete_user(uid, should_soft_delete=False)
        except Exception:
            pass


def _visible_meeting_ids(client, meeting_ids: list[str]) -> set[str]:
    rows = (
        client.table("meetings").select("id").in_("id", meeting_ids).execute().data
        or []
    )
    return {r["id"] for r in rows}


def _all(env: dict[str, Any]) -> list[str]:
    return list(env["meetings"].values())


# ============================================================
# Meeting visibility matrix
# ============================================================
def test_private_meeting_visible_to_owner_only(env):
    owner = env["login"](env["emails"]["owner"])
    assert env["meetings"]["private"] in _visible_meeting_ids(owner, _all(env))
    for label in ("admin", "member", "outsider"):
        client = env["login"](env["emails"][label])
        assert env["meetings"]["private"] not in _visible_meeting_ids(client, _all(env))


def test_organisation_visibility_visible_to_all_active_members(env):
    for label in ("owner", "admin", "member"):
        client = env["login"](env["emails"][label])
        assert env["meetings"]["org"] in _visible_meeting_ids(client, _all(env))
    outsider = env["login"](env["emails"]["outsider"])
    assert env["meetings"]["org"] not in _visible_meeting_ids(outsider, _all(env))


def test_participants_visibility_and_explicit_share(env):
    member = env["login"](env["emails"]["member"])
    assert env["meetings"]["participants"] in _visible_meeting_ids(member, _all(env))

    # admin is an org member but NOT a participant of a participants-only meeting
    admin = env["login"](env["emails"]["admin"])
    assert env["meetings"]["participants"] not in _visible_meeting_ids(admin, _all(env))

    # explicit meeting_participants row always grants access (even to private)
    service = env["service"]
    service.table("meeting_participants").insert(
        {"meeting_id": env["meetings"]["private"], "user_id": env["ids"]["outsider"]}
    ).execute()
    outsider = env["login"](env["emails"]["outsider"])
    assert env["meetings"]["private"] in _visible_meeting_ids(outsider, _all(env))
    service.table("meeting_participants").delete().eq(
        "meeting_id", env["meetings"]["private"]
    ).eq("user_id", env["ids"]["outsider"]).execute()


def test_org_admin_cannot_access_private_meeting(env):
    admin = env["login"](env["emails"]["admin"])
    res = admin.rpc(
        "can_access_meeting", {"p_meeting_id": env["meetings"]["private"]}
    ).execute()
    assert res.data is False

    owner = env["login"](env["emails"]["owner"])
    res = owner.rpc(
        "can_access_meeting", {"p_meeting_id": env["meetings"]["private"]}
    ).execute()
    assert res.data is True


def test_outsider_sees_no_org_meetings(env):
    outsider = env["login"](env["emails"]["outsider"])
    visible = _visible_meeting_ids(outsider, _all(env))
    assert visible == {env["meetings"]["outsider"]}


# ============================================================
# Roster access
# ============================================================
def test_roster_readable_by_plain_member_with_emails(env):
    member = env["login"](env["emails"]["member"])
    rows = (
        member.table("organisation_members")
        .select("user_id, role, email, display_name")
        .eq("organisation_id", env["org_id"])
        .execute()
        .data
        or []
    )
    assert len(rows) == 3
    by_user = {r["user_id"]: r for r in rows}
    assert by_user[env["ids"]["owner"]]["role"] == "owner"
    assert by_user[env["ids"]["admin"]]["role"] == "admin"
    assert by_user[env["ids"]["member"]]["role"] == "member"
    assert by_user[env["ids"]["member"]]["email"] == env["emails"]["member"]
    assert by_user[env["ids"]["member"]]["display_name"] == "Phase1 Member"

    # outsiders see nothing
    outsider = env["login"](env["emails"]["outsider"])
    rows = (
        outsider.table("organisation_members")
        .select("user_id")
        .eq("organisation_id", env["org_id"])
        .execute()
        .data
        or []
    )
    assert rows == []


# ============================================================
# RPC guards
# ============================================================
def test_update_member_role_owner_only(env):
    admin = env["login"](env["emails"]["admin"])
    with pytest.raises(Exception) as err:
        admin.rpc(
            "update_member_role",
            {
                "p_organisation_id": env["org_id"],
                "p_target_user_id": env["ids"]["member"],
                "p_role": "admin",
            },
        ).execute()
    assert "owner" in _rpc_error_text(err.value).lower()

    member = env["login"](env["emails"]["member"])
    with pytest.raises(Exception):
        member.rpc(
            "update_member_role",
            {
                "p_organisation_id": env["org_id"],
                "p_target_user_id": env["ids"]["admin"],
                "p_role": "member",
            },
        ).execute()

    owner = env["login"](env["emails"]["owner"])
    res = owner.rpc(
        "update_member_role",
        {
            "p_organisation_id": env["org_id"],
            "p_target_user_id": env["ids"]["member"],
            "p_role": "admin",
        },
    ).execute()
    assert _first(res.data)["role"] == "admin"

    # the owner row itself can never be changed
    with pytest.raises(Exception) as err:
        owner.rpc(
            "update_member_role",
            {
                "p_organisation_id": env["org_id"],
                "p_target_user_id": env["ids"]["owner"],
                "p_role": "member",
            },
        ).execute()
    assert "owner" in _rpc_error_text(err.value).lower()

    # restore
    res = owner.rpc(
        "update_member_role",
        {
            "p_organisation_id": env["org_id"],
            "p_target_user_id": env["ids"]["member"],
            "p_role": "member",
        },
    ).execute()
    assert _first(res.data)["role"] == "member"


def test_remove_member_guards_and_access_loss(env):
    service = env["service"]
    run_id = env["run_id"]
    target_email = f"{TEST_PREFIX}{run_id}-removetarget@example.com"
    res = service.auth.admin.create_user(
        {"email": target_email, "password": PASSWORD, "email_confirm": True}
    )
    env["users"].append(res.user.id)
    service.table("organisation_members").insert(
        {
            "organisation_id": env["org_id"],
            "user_id": res.user.id,
            "role": "member",
            "status": "active",
            "email": target_email,
            "display_name": "Removable",
        }
    ).execute()

    # plain member cannot remove anyone
    member = env["login"](env["emails"]["member"])
    with pytest.raises(Exception) as err:
        member.rpc(
            "remove_member",
            {
                "p_organisation_id": env["org_id"],
                "p_target_user_id": env["ids"]["admin"],
            },
        ).execute()
    assert "owners and admins" in _rpc_error_text(err.value)

    admin = env["login"](env["emails"]["admin"])

    # admin cannot remove themselves
    with pytest.raises(Exception) as err:
        admin.rpc(
            "remove_member",
            {
                "p_organisation_id": env["org_id"],
                "p_target_user_id": env["ids"]["admin"],
            },
        ).execute()
    assert "yourself" in _rpc_error_text(err.value).lower()

    # admin cannot remove the owner
    with pytest.raises(Exception) as err:
        admin.rpc(
            "remove_member",
            {
                "p_organisation_id": env["org_id"],
                "p_target_user_id": env["ids"]["owner"],
            },
        ).execute()
    assert "owner" in _rpc_error_text(err.value).lower()

    # admin CAN remove a plain member, and access is lost immediately
    admin.rpc(
        "remove_member",
        {
            "p_organisation_id": env["org_id"],
            "p_target_user_id": res.user.id,
        },
    ).execute()

    removed = env["login"](target_email)
    assert _visible_meeting_ids(removed, _all(env)) == set()
    rows = (
        removed.table("organisation_members")
        .select("user_id")
        .eq("organisation_id", env["org_id"])
        .execute()
        .data
        or []
    )
    assert rows == []


def test_invite_revoke_accept_flow(env):
    service = env["service"]
    run_id = env["run_id"]
    invitee_email = f"{TEST_PREFIX}{run_id}-invitee@example.com"
    res = service.auth.admin.create_user(
        {"email": invitee_email, "password": PASSWORD, "email_confirm": True}
    )
    env["users"].append(res.user.id)
    invitee_id = res.user.id

    owner = env["login"](env["emails"]["owner"])
    inv = _first(
        owner.rpc(
            "invite_member",
            {
                "p_organisation_id": env["org_id"],
                "p_email": invitee_email,
                "p_role": "member",
            },
        )
        .execute()
        .data
    )
    assert inv["status"] == "pending"

    # plain member cannot invite
    member = env["login"](env["emails"]["member"])
    with pytest.raises(Exception) as err:
        member.rpc(
            "invite_member",
            {
                "p_organisation_id": env["org_id"],
                "p_email": f"{TEST_PREFIX}{run_id}-nope@example.com",
                "p_role": "member",
            },
        ).execute()
    assert "admins" in _rpc_error_text(err.value)

    # plain member cannot revoke; owner can
    with pytest.raises(Exception):
        member.rpc("revoke_invitation", {"p_invitation_id": inv["id"]}).execute()
    owner.rpc("revoke_invitation", {"p_invitation_id": inv["id"]}).execute()

    # re-invite reuses the same row (no duplicate accumulation)
    inv2 = _first(
        owner.rpc(
            "invite_member",
            {
                "p_organisation_id": env["org_id"],
                "p_email": invitee_email,
                "p_role": "member",
            },
        )
        .execute()
        .data
    )
    assert inv2["id"] == inv["id"]
    assert inv2["status"] == "pending"

    count = (
        service.table("organisation_invitations")
        .select("id", count="exact")
        .eq("organisation_id", env["org_id"])
        .eq("email", invitee_email)
        .execute()
        .count
    )
    assert count == 1

    # only the invitee's own JWT email may accept
    admin = env["login"](env["emails"]["admin"])
    with pytest.raises(Exception) as err:
        admin.rpc("accept_invitation", {"p_invitation_id": inv2["id"]}).execute()
    assert "different email" in _rpc_error_text(err.value)

    invitee = env["login"](invitee_email)
    invitee.rpc("accept_invitation", {"p_invitation_id": inv2["id"]}).execute()

    # accepted => active member with denormalised email, can see org meetings
    rows = (
        invitee.table("organisation_members")
        .select("role, status, email")
        .eq("organisation_id", env["org_id"])
        .eq("user_id", invitee_id)
        .execute()
        .data
        or []
    )
    assert rows and rows[0]["status"] == "active"
    assert rows[0]["email"] == invitee_email
    assert env["meetings"]["org"] in _visible_meeting_ids(invitee, _all(env))


def test_create_organisation_grants_owner_role(env):
    owner = env["login"](env["emails"]["admin"])
    org = _first(
        owner.rpc(
            "create_organisation",
            {"p_name": f"{TEST_PREFIX}org2 {env['run_id']}"},
        )
        .execute()
        .data
    )
    assert org["id"]
    rows = (
        env["service"]
        .table("organisation_members")
        .select("role, status")
        .eq("organisation_id", org["id"])
        .eq("user_id", env["ids"]["admin"])
        .execute()
        .data
        or []
    )
    assert rows and rows[0]["role"] == "owner" and rows[0]["status"] == "active"
