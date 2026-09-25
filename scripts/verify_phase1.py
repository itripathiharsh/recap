"""Phase 1 live verification harness for Recap workspaces + RLS.

Runs controlled checks against the LIVE Supabase project. Never touches
production rows: all test users are prefixed ``phase1-test-`` and all test
organisations are prefixed ``Phase1 Test``, and cleanup removes only those.

Commands:
  audit    Record baseline counts (meetings/jobs/... + meeting ids). Read-only.
  schema   Verify workspace migrations are applied (tables, columns, functions,
           policies, RLS enabled).
  backfill Run the ownership backfill RPC (service role) and verify results.
  counts   Compare current counts against the baseline; flag any loss.
  rls      Run isolation tests A-J with temporary test users (service role).
  orgflow  Run the full organisation flow: create -> owner -> invite -> accept
           -> member -> scoped meeting visibility (service role + user JWTs).
  all      schema + backfill + counts + rls + orgflow (in that order).

Requires SUPABASE_URL + SUPABASE_ANON_KEY. ``backfill``/``rls``/``orgflow``
also require SUPABASE_SERVICE_ROLE_KEY (test users and cross-user checks are
impossible without it). Baseline lives next to this script as
``phase1_baseline.local.json`` (git-ignored).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

BASELINE_PATH = Path(__file__).resolve().parent / "phase1_baseline.local.json"
TEST_PREFIX = "phase1-test-"
TEST_ORG_PREFIX = "Phase1 Test"
COUNT_TABLES = [
    "meetings",
    "jobs",
    "transcripts",
    "speaker_turns",
    "mom",
    "system_events",
    "User",
]

PASS = "PASS"
FAIL = "FAIL"
SKIP = "SKIP"

_results: list[tuple[str, str, str]] = []


def record(test_id: str, status: str, detail: str = "") -> None:
    _results.append((test_id, status, detail))
    print(f"  [{status}] {test_id}" + (f" — {detail}" if detail else ""))


def cfg() -> tuple[str, str, str]:
    url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    anon = os.getenv("SUPABASE_ANON_KEY", "").strip()
    service = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url or not anon:
        sys.exit("SUPABASE_URL and SUPABASE_ANON_KEY must be set in .env")
    return url, anon, service


def rest(
    path: str,
    key: str,
    method: str = "GET",
    body: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
    timeout: int = 30,
) -> tuple[int, Any]:
    url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    h = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    if headers:
        h.update(headers)
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url + path, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read().decode()
            return r.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except json.JSONDecodeError:
            return e.code, raw
    except urllib.error.URLError as e:
        return 0, str(e)


def svc_required() -> str:
    _, _, service = cfg()
    if not service:
        sys.exit(
            "SUPABASE_SERVICE_ROLE_KEY is not set in .env — this command "
            "cannot run without it (Project Settings -> API -> service_role)."
        )
    return service


# ---------------------------------------------------------------- audit ----
def cmd_audit() -> None:
    url, anon, _ = cfg()
    print(f"Auditing {url} ...")
    counts: dict[str, int] = {}
    meeting_ids: list[str] = []
    for t in COUNT_TABLES:
        status, rows = rest(f"/rest/v1/{t}?select=id", anon)
        if status != 200:
            print(f"  {t}: ERROR {status} {rows}")
            counts[t] = -1
            continue
        counts[t] = len(rows)
        print(f"  {t}: {counts[t]}")
        if t == "meetings":
            meeting_ids = [r["id"] for r in rows]

    status, meetings = rest(
        "/rest/v1/meetings?select=id,owner_id,user_id,organisation_id,"
        "workspace_type,visibility,title",
        anon,
    )
    owners_ok = status == 200 and all(m.get("owner_id") for m in meetings)
    print(f"  meetings with owner_id set: {owners_ok}")

    baseline = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "counts": counts,
        "meeting_ids": sorted(meeting_ids),
    }
    BASELINE_PATH.write_text(json.dumps(baseline, indent=2))
    print(f"  baseline written -> {BASELINE_PATH}")


# ---------------------------------------------------------------- schema ---
def _table_exists(name: str, key: str) -> bool:
    status, _ = rest(f"/rest/v1/{name}?select=id&limit=0", key)
    return status in (200, 206)


def cmd_schema() -> None:
    _, anon, service = cfg()
    key = service or anon
    print("Verifying workspace schema migration ...")

    for t in (
        "organisations",
        "organisation_members",
        "organisation_invitations",
        "meeting_participants",
    ):
        record(f"schema: table {t}", PASS if _table_exists(t, key) else FAIL)

    status, row = rest("/rest/v1/meetings?select=owner_id&limit=1", key)
    record(
        "schema: meetings.owner_id column",
        PASS if status == 200 else FAIL,
        f"status={status}",
    )
    status, _ = rest("/rest/v1/meetings?select=workspace_type,visibility&limit=1", key)
    record(
        "schema: meetings workspace_type/visibility columns",
        PASS if status == 200 else FAIL,
        f"status={status}",
    )
    status, _ = rest(
        "/rest/v1/organisation_members?select=email,display_name&limit=1", key
    )
    record(
        "schema: organisation_members email/display_name columns",
        PASS if status == 200 else FAIL,
        f"status={status}",
    )

    # Functions callable? anon cannot execute service-only RPCs (expected 403/401
    # or a raised exception), authenticated-only RPCs raise 'Not authenticated'.
    status, _ = rest("/rest/v1/rpc/can_access_meeting", anon, "POST", {})
    record(
        "schema: function can_access_meeting exists",
        PASS if status != 404 else FAIL,
        f"status={status}",
    )
    for fn in ("update_member_role", "remove_member", "revoke_invitation"):
        status, _ = rest(f"/rest/v1/rpc/{fn}", anon, "POST", {})
        record(
            f"schema: function {fn} exists",
            PASS if status != 404 else FAIL,
            f"status={status}",
        )

    # RLS enabled? With RLS on, anon reads of meetings return 0 rows or 401/403;
    # with RLS off they return real rows. Detect via a guaranteed-existing count.
    status, rows = rest("/rest/v1/meetings?select=id", anon)
    rls_enforced = status == 200 and rows == []
    rls_broken = status == 200 and len(rows) > 0
    if rls_enforced:
        record("schema: RLS enforced for anon on meetings", PASS, "0 rows visible")
    elif rls_broken:
        record(
            "schema: RLS enforced for anon on meetings",
            FAIL,
            f"anon can still read {len(rows)} meetings — RLS migration not applied?",
        )
    else:
        record("schema: RLS enforced for anon on meetings", SKIP, f"status={status}")


# -------------------------------------------------------------- backfill ---
def cmd_backfill() -> None:
    service = svc_required()
    email = os.getenv("MEETINGS_OWNER_EMAIL", "").strip()
    if not email:
        sys.exit("MEETINGS_OWNER_EMAIL must be set in .env (e.g. harsh@sentio.in)")

    status, before = rest(
        "/rest/v1/meetings?select=id,owner_id,workspace_type,organisation_id", service
    )
    if status != 200:
        sys.exit(f"Could not list meetings with service key: {status} {before}")
    orphans = [m for m in before if not m.get("owner_id")]
    print(f"  meetings before: {len(before)}, owner_id NULL: {len(orphans)}")

    if orphans:
        status, res = rest(
            "/rest/v1/rpc/assign_orphan_meetings",
            service,
            "POST",
            {"p_owner_email": email},
        )
        if status != 200:
            sys.exit(f"Backfill RPC failed: {status} {res}")
        print(f"  backfilled rows: {res}")
    else:
        print("  nothing to backfill (idempotent skip)")

    status, after = rest(
        "/rest/v1/meetings?select=id,owner_id,workspace_type,organisation_id,user_id",
        service,
    )
    if status != 200:
        sys.exit(f"Post-backfill read failed: {status}")
    nulls = [m for m in after if not m.get("owner_id")]
    wrong_ws = [
        m
        for m in after
        if m.get("organisation_id") and m.get("workspace_type") != "organisation"
    ]
    with_org = [m for m in after if m.get("organisation_id")]
    record(
        "backfill: no NULL owner_id meetings",
        PASS if not nulls else FAIL,
        f"{len(nulls)} still NULL",
    )
    record(
        "backfill: meeting count preserved",
        PASS if len(after) == len(before) else FAIL,
        f"{len(before)} -> {len(after)}",
    )
    record("backfill: workspace_type coherent", PASS if not wrong_ws else FAIL)
    record(
        "backfill: individual meetings have organisation_id NULL",
        PASS if not with_org else FAIL,
        f"{len(with_org)} unexpectedly attached to an org",
    )


# ---------------------------------------------------------------- counts ---
def cmd_counts() -> None:
    _, anon, service = cfg()
    if not BASELINE_PATH.exists():
        sys.exit("No baseline found — run 'audit' first.")
    baseline = json.loads(BASELINE_PATH.read_text())
    key = service or anon
    print(f"Comparing against baseline from {baseline['timestamp']}")
    ok = True
    for t in COUNT_TABLES:
        status, rows = rest(f"/rest/v1/{t}?select=id", key)
        now = len(rows) if status == 200 else -1
        before = baseline["counts"].get(t, -1)
        flag = "OK" if now >= before else "LOST ROWS"
        if now < before:
            ok = False
        print(f"  {t}: {before} -> {now} [{flag}]")
    status, rows = rest("/rest/v1/meetings?select=id", key)
    now_ids = {r["id"] for r in rows} if status == 200 else set()
    lost = [i for i in baseline["meeting_ids"] if i not in now_ids]
    record(
        "counts: baseline meeting ids all present",
        PASS if not lost else FAIL,
        f"missing={lost}",
    )
    record("counts: no table lost rows", PASS if ok else FAIL)


# ---------------------------------------------------------------- helpers --
def create_test_user(email: str, password: str) -> dict[str, Any]:
    service = svc_required()
    status, res = rest(
        "/auth/v1/admin/users",
        service,
        "POST",
        {
            "email": email,
            "password": password,
            "email_confirm": True,
            "user_metadata": {"phase1_test": True},
        },
    )
    if status not in (200, 201):
        sys.exit(f"Could not create test user {email}: {status} {res}")
    assert isinstance(res, dict)
    print(f"  created test user {email} ({res.get('id')})")
    return res


def user_token(email: str, password: str) -> str:
    _, anon, service = cfg()
    status, res = rest(
        "/auth/v1/token?grant_type=password",
        service or anon,
        "POST",
        {"email": email, "password": password},
    )
    if status != 200:
        sys.exit(f"Password grant failed for {email}: {status} {res}")
    assert isinstance(res, dict)
    return res["access_token"]


def cleanup_test_data(user_ids: list[str]) -> None:
    """Delete ONLY test orgs, profile rows, meetings and users we created."""
    service = svc_required()

    # Test organisations (name-prefixed) — must go before users (owner restrict).
    status, orgs = rest("/rest/v1/organisations?select=id,name", service)
    if status == 200 and isinstance(orgs, list):
        for org in [
            o for o in orgs if str(o.get("name", "")).startswith(TEST_ORG_PREFIX)
        ]:
            rest(
                f"/rest/v1/organisation_invitations?organisation_id=eq.{org['id']}",
                service,
                "DELETE",
            )
            rest(
                f"/rest/v1/organisation_members?organisation_id=eq.{org['id']}",
                service,
                "DELETE",
            )
            rest(f"/rest/v1/meetings?organisation_id=eq.{org['id']}", service, "DELETE")
            rest(f"/rest/v1/organisations?id=eq.{org['id']}", service, "DELETE")
            print(f"  cleaned test org {org['name']}")

    # Meetings whose title carries the test prefix (owner-scoped or orphaned).
    status, meetings = rest("/rest/v1/meetings?select=id,title,owner_id", service)
    if status == 200 and isinstance(meetings, list):
        test_meetings = [
            m
            for m in meetings
            if str(m.get("title", "")).startswith(TEST_PREFIX)
            or (m.get("owner_id") in user_ids and user_ids)
        ]
        for m in test_meetings:
            for tbl in ("speaker_turns", "transcripts", "mom", "jobs", "system_events"):
                rest(f"/rest/v1/{tbl}?meeting_id=eq.{m['id']}", service, "DELETE")
            rest(f"/rest/v1/meetings?id=eq.{m['id']}", service, "DELETE")
        if test_meetings:
            print(f"  cleaned {len(test_meetings)} test meeting(s)")

    # Test profile rows.
    status, profiles = rest("/rest/v1/User?select=email", service)
    if status == 200 and isinstance(profiles, list):
        for p in profiles:
            if str(p.get("email", "")).startswith(TEST_PREFIX):
                rest(f'/rest/v1/User?email=eq.{p["email"]}', service, "DELETE")

    # Test users (cascades remaining membership/invitation rows).
    for uid in user_ids:
        status, _ = rest(f"/auth/v1/admin/users/{uid}", service, "DELETE")
        print(f"  deleted test user {uid}: {status}")


def rpc(name: str, token: str, payload: dict[str, Any]) -> tuple[int, Any]:
    """Call an RPC as `token`.

    PostgREST may return a composite-typed result either as a single object or
    as a one-element list; normalise to the object form so callers can index it.
    """
    _, anon, _ = cfg()
    status, res = rest(
        f"/rest/v1/rpc/{name}",
        anon,
        "POST",
        payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    if (
        status in (200, 201)
        and isinstance(res, list)
        and len(res) == 1
        and isinstance(res[0], dict)
    ):
        res = res[0]
    return status, res


def q(token: str, path: str) -> tuple[int, Any]:
    _, anon, _ = cfg()
    return rest(path, anon, "GET", headers={"Authorization": f"Bearer {token}"})


# ------------------------------------------------------------------- rls ---
def cmd_rls() -> None:
    service = svc_required()
    _, anon, _ = cfg()
    ts = int(time.time())
    pw = f"{TEST_PREFIX}pw-{ts}"
    emails = [
        f"{TEST_PREFIX}alice-{ts}@example.com",
        f"{TEST_PREFIX}bob-{ts}@example.com",
        f"{TEST_PREFIX}carol-{ts}@example.com",
    ]
    user_ids: list[str] = []

    try:
        users: dict[str, dict[str, Any]] = {}
        for e in emails:
            u = create_test_user(e, pw)
            users[e] = u
            user_ids.append(u["id"])
        alice, bob, carol = emails
        tok = {e: user_token(e, pw) for e in emails}

        # --- individual meetings (owner-scoped) ---
        def make_meeting(token: str, title: str, **extra: Any) -> str:
            status, res = rest(
                "/rest/v1/meetings",
                anon,
                "POST",
                {
                    "title": title,
                    "meet_link": "https://meet.google.com/aaa-bbbb-ccc",
                    "scheduled_start": "2026-01-01T10:00:00+00:00",
                    "expected_duration_minutes": 30,
                    **extra,
                },
                headers={"Authorization": f"Bearer {token}"},
            )
            if status not in (200, 201):
                sys.exit(f"Meeting insert failed ({title}): {status} {res}")
            return res[0]["id"]

        alice_m = make_meeting(tok[alice], f"{TEST_PREFIX}alice-private")
        bob_m = make_meeting(tok[bob], f"{TEST_PREFIX}bob-private")

        # TEST A: owner reads own individual meeting.
        _, rows = q(tok[alice], f"/rest/v1/meetings?id=eq.{alice_m}&select=id")
        record(
            "TEST A: user reads own individual meeting",
            PASS if len(rows) == 1 else FAIL,
            f"rows={len(rows)}",
        )

        # TEST B: other user cannot read it (nor its transcript).
        _, rows = q(tok[bob], f"/rest/v1/meetings?id=eq.{alice_m}&select=id")
        record(
            "TEST B: user cannot read another user's private meeting",
            PASS if len(rows) == 0 else FAIL,
            f"rows={len(rows)}",
        )

        # --- organisations via RPCs ---
        status, org_a = rpc(
            "create_organisation",
            tok[alice],
            {"p_name": f"{TEST_ORG_PREFIX} Alpha {ts}"},
        )
        if status != 200:
            sys.exit(f"create_organisation failed: {status} {org_a}")
        status, org_b = rpc(
            "create_organisation",
            tok[carol],
            {"p_name": f"{TEST_ORG_PREFIX} Beta {ts}"},
        )
        if status != 200:
            sys.exit(f"create_organisation (B) failed: {status} {org_b}")
        org_a_id, org_b_id = org_a["id"], org_b["id"]

        # Creator becomes OWNER.
        _, mrows = q(
            tok[alice],
            f"/rest/v1/organisation_members?organisation_id=eq.{org_a_id}"
            "&select=role,status",
        )
        record(
            "Flow: creator becomes owner",
            PASS if mrows and mrows[0]["role"] == "owner" else FAIL,
            str(mrows),
        )

        # Invite Bob (member) and Carol (admin) into org A.
        status, inv_bob = rpc(
            "invite_member",
            tok[alice],
            {"p_organisation_id": org_a_id, "p_email": bob, "p_role": "member"},
        )
        if status != 200:
            sys.exit(f"invite_member(bob) failed: {status} {inv_bob}")
        status, inv_carol = rpc(
            "invite_member",
            tok[alice],
            {"p_organisation_id": org_a_id, "p_email": carol, "p_role": "admin"},
        )
        if status != 200:
            sys.exit(f"invite_member(carol) failed: {status} {inv_carol}")
        record(
            "Flow: invitation created",
            PASS,
            f"invitations={inv_bob['id']}," f"{inv_carol['id']}",
        )

        # Invitee can see their own pending invite.
        _, inv_rows = q(
            tok[bob],
            f"/rest/v1/organisation_invitations?id=eq.{inv_bob['id']}" "&select=id",
        )
        record(
            "Flow: invitee can read own pending invite",
            PASS if len(inv_rows) == 1 else FAIL,
        )

        # Accept.
        status, _ = rpc(
            "accept_invitation", tok[bob], {"p_invitation_id": inv_bob["id"]}
        )
        if status != 200:
            sys.exit(f"accept_invitation(bob) failed: {status}")
        status, _ = rpc(
            "accept_invitation", tok[carol], {"p_invitation_id": inv_carol["id"]}
        )
        if status != 200:
            sys.exit(f"accept_invitation(carol) failed: {status}")

        _, arows = q(
            tok[bob],
            f"/rest/v1/organisation_members?organisation_id=eq.{org_a_id}"
            "&user_id=eq.{users[bob]['id']}&select=role",
        )
        record(
            "Flow: member becomes member",
            PASS if arows and arows[0]["role"] == "member" else FAIL,
            str(arows),
        )

        # Workspace switcher data (as Bob): org list via membership embed.
        _, switch_rows = q(
            tok[bob],
            "/rest/v1/organisation_members?select=role,"
            "organisations(id,name)&status=eq.active",
        )
        names = [r.get("organisations", {}).get("name", "") for r in switch_rows]
        record(
            "Flow: workspace switcher shows organisation",
            PASS if any(n.startswith(TEST_ORG_PREFIX) for n in names) else FAIL,
            str(names),
        )

        # --- org meetings across visibility levels ---
        m_org = make_meeting(
            tok[alice],
            f"{TEST_PREFIX}org-a-visible",
            organisation_id=org_a_id,
            visibility="organisation",
        )
        m_adm = make_meeting(
            tok[alice],
            f"{TEST_PREFIX}org-a-admin",
            organisation_id=org_a_id,
            visibility="admin",
        )
        m_priv = make_meeting(
            tok[alice],
            f"{TEST_PREFIX}org-a-private",
            organisation_id=org_a_id,
            visibility="private",
        )
        m_beta = make_meeting(
            tok[carol],
            f"{TEST_PREFIX}org-b-visible",
            organisation_id=org_b_id,
            visibility="organisation",
        )

        # TEST C: org A member cannot access org B data.
        _, rows = q(tok[bob], f"/rest/v1/meetings?id=eq.{m_beta}&select=id")
        record(
            "TEST C: org member cannot access another organisation",
            PASS if len(rows) == 0 else FAIL,
            f"rows={len(rows)}",
        )

        # TEST D: member can access authorised org meeting.
        _, rows = q(tok[bob], f"/rest/v1/meetings?id=eq.{m_org}&select=id")
        record(
            "TEST D: member can access authorised org meeting",
            PASS if len(rows) == 1 else FAIL,
            f"rows={len(rows)}",
        )

        # TEST E: member cannot access admin-only/private data.
        _, rows_adm = q(tok[bob], f"/rest/v1/meetings?id=eq.{m_adm}&select=id")
        _, rows_priv = q(tok[bob], f"/rest/v1/meetings?id=eq.{m_priv}&select=id")
        _, members_bob = q(
            tok[bob],
            f"/rest/v1/organisation_members?organisation_id=eq.{org_a_id}"
            "&select=id,email",
        )
        record(
            "TEST E: member cannot read admin/private meetings",
            PASS if len(rows_adm) == 0 and len(rows_priv) == 0 else FAIL,
            f"admin={len(rows_adm)} private={len(rows_priv)}",
        )
        record(
            "TEST E: member sees full roster with emails",
            (
                PASS
                if len(members_bob) == 3 and all(r.get("email") for r in members_bob)
                else FAIL
            ),
            f"rows={len(members_bob)}",
        )

        # TEST F: admin can access permitted meetings + invite.
        _, rows = q(tok[carol], f"/rest/v1/meetings?id=eq.{m_adm}&select=id")
        record(
            "TEST F: admin can access admin-visibility meeting",
            PASS if len(rows) == 1 else FAIL,
            f"rows={len(rows)}",
        )
        _, rows_priv_c = q(tok[carol], f"/rest/v1/meetings?id=eq.{m_priv}&select=id")
        record(
            "TEST F: admin still excluded from private meetings",
            PASS if len(rows_priv_c) == 0 else FAIL,
            f"rows={len(rows_priv_c)}",
        )

        # TEST F2: participants visibility — participant sees it, non-participant
        # admin does not (org membership alone is not enough).
        m_part = make_meeting(
            tok[alice],
            f"{TEST_PREFIX}org-a-participants",
            organisation_id=org_a_id,
            visibility="participants",
        )
        status, _ = rest(
            "/rest/v1/meeting_participants",
            anon,
            "POST",
            {"meeting_id": m_part, "user_id": users[bob]["id"]},
            headers={"Authorization": f"Bearer {tok[alice]}"},
        )
        shared_ok = status in (200, 201)
        _, rows_p_bob = q(tok[bob], f"/rest/v1/meetings?id=eq.{m_part}&select=id")
        _, rows_p_carol = q(tok[carol], f"/rest/v1/meetings?id=eq.{m_part}&select=id")
        record(
            "TEST F2: participants visibility — participant sees meeting",
            PASS if shared_ok and len(rows_p_bob) == 1 else FAIL,
            f"share_status={status} rows={len(rows_p_bob)}",
        )
        record(
            "TEST F2: participants visibility — non-participant admin excluded",
            PASS if len(rows_p_carol) == 0 else FAIL,
            f"rows={len(rows_p_carol)}",
        )

        # TEST F3: an explicit meeting_participants row always grants access,
        # even to a private meeting.
        status, _ = rest(
            "/rest/v1/meeting_participants",
            anon,
            "POST",
            {"meeting_id": m_priv, "user_id": users[carol]["id"]},
            headers={"Authorization": f"Bearer {tok[alice]}"},
        )
        _, rows_priv_c2 = q(tok[carol], f"/rest/v1/meetings?id=eq.{m_priv}&select=id")
        record(
            "TEST F3: explicit share grants access to private meeting",
            PASS if status in (200, 201) and len(rows_priv_c2) == 1 else FAIL,
            f"share_status={status} rows={len(rows_priv_c2)}",
        )
        rest(
            f"/rest/v1/meeting_participants?meeting_id=eq.{m_priv}"
            f"&user_id=eq.{users[carol]['id']}",
            service,
            "DELETE",
        )

        # TEST K: admin authorization boundaries.
        # K1: role changes are owner-only.
        status, _ = rpc(
            "update_member_role",
            tok[carol],
            {
                "p_organisation_id": org_a_id,
                "p_target_user_id": users[bob]["id"],
                "p_role": "admin",
            },
        )
        record(
            "TEST K: admin cannot change roles (owner-only RPC)",
            PASS if status >= 400 else FAIL,
            f"status={status}",
        )
        # K2: admin cannot remove the owner.
        status, _ = rpc(
            "remove_member",
            tok[carol],
            {"p_organisation_id": org_a_id, "p_target_user_id": users[alice]["id"]},
        )
        record(
            "TEST K: admin cannot remove the owner (remove_member guard)",
            PASS if status >= 400 else FAIL,
            f"status={status}",
        )
        # K3: admin cannot update a private meeting (manage policy).
        status, res = rest(
            f"/rest/v1/meetings?id=eq.{m_priv}",
            anon,
            "PATCH",
            {"title": f"{TEST_PREFIX}org-a-private-hijack"},
            headers={"Authorization": f"Bearer {tok[carol]}"},
        )
        hijacked = isinstance(res, list) and len(res) > 0
        record(
            "TEST K: admin cannot update private meeting",
            PASS if status < 400 and not hijacked else FAIL,
            f"status={status} rows={len(res) if isinstance(res, list) else '?'}",
        )
        # K4: admin cannot add participants to a private meeting.
        status, _ = rest(
            "/rest/v1/meeting_participants",
            anon,
            "POST",
            {"meeting_id": m_priv, "user_id": users[carol]["id"]},
            headers={"Authorization": f"Bearer {tok[carol]}"},
        )
        record(
            "TEST K: admin cannot share private meeting",
            PASS if status >= 400 else FAIL,
            f"status={status}",
        )
        # K5: admin cannot revoke invitations (invite_member/revoke are admin-
        # level, but revocation of someone else's invite is still admin-only
        # and Bob is a plain member).
        status, _ = rpc(
            "revoke_invitation", tok[bob], {"p_invitation_id": inv_carol["id"]}
        )
        record(
            "TEST K: member cannot revoke invitations",
            PASS if status >= 400 else FAIL,
            f"status={status}",
        )

        # TEST G: owner has full organisation permissions (read members, update org).
        _, members_all = q(
            tok[alice],
            f"/rest/v1/organisation_members?organisation_id=eq.{org_a_id}&select=id,role",
        )
        status, _ = rest(
            f"/rest/v1/organisations?id=eq.{org_a_id}",
            service,
            "PATCH",
            {"name": f"{TEST_ORG_PREFIX} Alpha {ts} (renamed)"},
            headers={"Authorization": f"Bearer {tok[alice]}"},
        )
        record(
            "TEST G: owner sees all members",
            PASS if len(members_all) == 3 else FAIL,
            f"rows={len(members_all)}",
        )
        record(
            "TEST G: owner can update organisation",
            PASS if status in (200, 204) else FAIL,
            f"status={status}",
        )

        # TEST H: removed member loses access immediately (via remove_member).
        status, res = rpc(
            "remove_member",
            tok[alice],
            {"p_organisation_id": org_a_id, "p_target_user_id": users[bob]["id"]},
        )
        record(
            "TEST H: owner removes member via remove_member RPC",
            PASS if status == 200 else FAIL,
            f"status={status} {res}",
        )
        _, rows = q(tok[bob], f"/rest/v1/meetings?id=eq.{m_org}&select=id")
        record(
            "TEST H: removed member loses access immediately",
            PASS if len(rows) == 0 else FAIL,
            f"rows={len(rows)}",
        )
        _, gone = q(
            tok[bob],
            f"/rest/v1/organisation_members?organisation_id=eq.{org_a_id}&select=id",
        )
        record(
            "TEST H: removed member no longer in roster",
            PASS if len(gone) == 0 else FAIL,
            f"rows={len(gone)}",
        )

        # TEST I: direct anon query cannot bypass RLS.
        status, rows = rest("/rest/v1/meetings?select=id", anon)
        record(
            "TEST I: direct anon query bypasses RLS",
            FAIL if (status == 200 and len(rows) > 0) else PASS,
            f"status={status} rows={len(rows) if isinstance(rows, list) else '?'}",
        )

        # TEST J: direct writes without authorisation are rejected/empty.
        status, res = rest(
            "/rest/v1/meetings",
            anon,
            "POST",
            {
                "title": f"{TEST_PREFIX}sneaky",
                "meet_link": "https://meet.google.com/aaa-bbbb-ccc",
                "scheduled_start": "2026-01-01T10:00:00+00:00",
                "expected_duration_minutes": 30,
            },
        )
        sneaky_blocked = status >= 400 or not res
        # also: authenticated non-member cannot insert into someone else's org
        status2, res2 = rest(
            "/rest/v1/meetings",
            anon,
            "POST",
            {
                "title": f"{TEST_PREFIX}intruder",
                "meet_link": "https://meet.google.com/aaa-bbbb-ccc",
                "scheduled_start": "2026-01-01T10:00:00+00:00",
                "expected_duration_minutes": 30,
                "organisation_id": org_b_id,
            },
            headers={"Authorization": f"Bearer {tok[alice]}"},
        )
        intruder_blocked = status2 >= 400 or not res2
        if isinstance(res2, list):
            pass  # nothing to track; cleanup also matches the title prefix
        record(
            "TEST J: unauthenticated insert blocked",
            PASS if sneaky_blocked else FAIL,
            f"status={status}",
        )
        record(
            "TEST J: non-member org insert blocked",
            PASS if intruder_blocked else FAIL,
            f"status={status2}",
        )

        # Step 10: ownership stamps on inserted meetings.
        _, mine = q(
            tok[bob],
            f"/rest/v1/meetings?id=eq.{bob_m}&select=owner_id,workspace_type,"
            "organisation_id",
        )
        ok = (
            mine
            and mine[0]["owner_id"] == users[bob]["id"]
            and mine[0]["workspace_type"] == "individual"
            and mine[0]["organisation_id"] is None
        )
        record(
            "Step 10: individual meeting stamped correctly",
            PASS if ok else FAIL,
            str(mine),
        )
        _, orgm = q(
            tok[alice],
            f"/rest/v1/meetings?id=eq.{m_org}&select=owner_id,workspace_type,"
            "organisation_id",
        )
        ok = (
            orgm
            and orgm[0]["owner_id"] == users[alice]["id"]
            and orgm[0]["workspace_type"] == "organisation"
            and orgm[0]["organisation_id"] == org_a_id
        )
        record(
            "Step 10: organisation meeting stamped correctly",
            PASS if ok else FAIL,
            str(orgm),
        )

        # Profile RPC sanity (used by frontend on login).
        status, _ = rpc(
            "ensure_my_profile", tok[alice], {"p_name": "Phase1 Test Alice"}
        )
        record(
            "Flow: ensure_my_profile RPC works",
            PASS if status == 200 else FAIL,
            f"status={status}",
        )

    finally:
        print("Cleaning up test data (only phase1-test rows/users) ...")
        cleanup_test_data(user_ids)


# --------------------------------------------------------------- orgflow ---
def cmd_orgflow() -> None:
    """Step 7 full-flow re-verification with an independent pair of users."""
    svc_required()
    ts = int(time.time())
    emails = [
        f"{TEST_PREFIX}owner-{ts}@example.com",
        f"{TEST_PREFIX}guest-{ts}@example.com",
    ]
    pw = f"{TEST_PREFIX}pw-{ts}"
    user_ids: list[str] = []
    try:
        users = {e: create_test_user(e, pw) for e in emails}
        user_ids = [u["id"] for u in users.values()]
        owner_e, guest_e = emails
        tok_o = user_token(owner_e, pw)
        tok_g = user_token(guest_e, pw)

        # Full flow: create -> owner -> invite -> accept -> member.
        status, org = rpc(
            "create_organisation", tok_o, {"p_name": f"{TEST_ORG_PREFIX} Flow {ts}"}
        )
        if status != 200:
            sys.exit(f"create_organisation failed: {status} {org}")
        status, inv = rpc(
            "invite_member", tok_o, {"p_organisation_id": org["id"], "p_email": guest_e}
        )
        if status != 200:
            sys.exit(f"invite_member failed: {status} {inv}")
        # wrong-user acceptance must fail
        status2, _ = rpc("accept_invitation", tok_o, {"p_invitation_id": inv["id"]})
        record(
            "OrgFlow: wrong user cannot accept invitation",
            PASS if status2 >= 400 else FAIL,
            f"status={status2}",
        )
        status, _ = rpc("accept_invitation", tok_g, {"p_invitation_id": inv["id"]})
        if status != 200:
            sys.exit(f"accept_invitation failed: {status}")

        # Guest sees the org in their workspace list, owner-scoped meeting set.
        _, switch = q(
            tok_g,
            "/rest/v1/organisation_members?select=role,"
            "organisations(id,name)&status=eq.active",
        )
        ok = any(
            (r.get("organisations") or {}).get("name", "").startswith(TEST_ORG_PREFIX)
            for r in switch
        )
        record(
            "OrgFlow: member workspace list contains organisation", PASS if ok else FAIL
        )

        # Owner creates an org meeting; member sees it, outsider does not.
        status, meet = rest(
            "/rest/v1/meetings",
            os.getenv("SUPABASE_ANON_KEY", ""),
            "POST",
            {
                "title": f"{TEST_PREFIX}flow-meeting",
                "meet_link": "https://meet.google.com/aaa-bbbb-ccc",
                "scheduled_start": "2026-01-01T10:00:00+00:00",
                "expected_duration_minutes": 30,
                "organisation_id": org["id"],
                "visibility": "organisation",
            },
            headers={"Authorization": f"Bearer {tok_o}"},
        )
        if status not in (200, 201):
            sys.exit(f"org meeting insert failed: {status} {meet}")
        mid = meet[0]["id"]

        _, rows_member = q(tok_g, f"/rest/v1/meetings?id=eq.{mid}&select=id")
        record(
            "OrgFlow: member sees authorised org meeting",
            PASS if len(rows_member) == 1 else FAIL,
        )
        _, owner_rows = q(tok_o, f"/rest/v1/meetings?id=eq.{mid}&select=id")
        record(
            "OrgFlow: owner sees own org meeting",
            PASS if len(owner_rows) == 1 else FAIL,
        )

        # Owner/admin can view members; manage invitations list.
        _, members = q(
            tok_o,
            f"/rest/v1/organisation_members?organisation_id=eq.{org['id']}"
            "&select=role",
        )
        record(
            "OrgFlow: owner views all organisation members",
            PASS if len(members) == 2 else FAIL,
            f"rows={len(members)}",
        )
        _, invs = q(
            tok_o,
            f"/rest/v1/organisation_invitations?organisation_id=eq.{org['id']}"
            "&select=id,status",
        )
        record(
            "OrgFlow: owner views invitations",
            PASS if len(invs) == 1 else FAIL,
            f"rows={len(invs)}",
        )
    finally:
        print("Cleaning up org-flow test data ...")
        cleanup_test_data(user_ids)


# ----------------------------------------------------------------- main ----
def summary() -> int:
    print("\n==== Phase 1 verification summary ====")
    failures = [r for r in _results if r[1] == FAIL]
    for tid, status, detail in _results:
        print(f"  [{status}] {tid}" + (f" — {detail}" if detail else ""))
    print(
        f"\n{len(_results)} checks, {len(failures)} failed, "
        f"{sum(1 for r in _results if r[1] == SKIP)} skipped"
    )
    return 1 if failures else 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "command",
        choices=["audit", "schema", "backfill", "counts", "rls", "orgflow", "all"],
    )
    args = parser.parse_args()

    if args.command == "audit":
        cmd_audit()
        return 0
    if args.command == "schema":
        cmd_schema()
    elif args.command == "backfill":
        cmd_backfill()
    elif args.command == "counts":
        cmd_counts()
    elif args.command == "rls":
        cmd_rls()
    elif args.command == "orgflow":
        cmd_orgflow()
    elif args.command == "all":
        cmd_schema()
        cmd_backfill()
        cmd_counts()
        cmd_rls()
        cmd_orgflow()
    return summary()


if __name__ == "__main__":
    sys.exit(main())
