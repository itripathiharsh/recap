# AUDIT_BASELINE.md

**Purpose:** establish ground truth before any repair work, per instruction
"Start by producing the baseline audit."
**Produced:** 2026-09-27
**Method:** direct probing of the live project over HTTPS (PostgREST / Auth / Storage),
plus static inspection of the repository, migrations, and git history.
**Secret handling:** no secret value is reproduced in this document. Credentials were
read from `.env` programmatically and only their presence/shape/length is reported.

---

## 1. Git

| Item | Value |
|---|---|
| Commit | `652854653e11dbd348848e52f14ff7815130b131` |
| Commit subject | `feat(org-meetings): redesign Organisation Meetings page to match screenshot…` |
| Branch | `product_phase2` |
| Tracked `.env` files | **none** — only `.env.example` and `dashboard/.env.example` are tracked |
| Modified (tracked, uncommitted) | 15 files |
| Untracked (product code) | 7 files |

**Untracked product code — a fresh clone loses all of it:**

```
dashboard/src/components/BillingPanel.jsx
dashboard/src/components/IntegrationsPanel.jsx
dashboard/src/components/MeetingSettingsPanel.jsx
dashboard/src/components/MembersAccessPanel.jsx
dashboard/src/components/TeamsPanel.jsx
dashboard/src/lib/teams.mjs
supabase/migrations/20260926120000_organisation_settings.sql
```

**Committed credential-shaped string (confirmed):**
`dashboard/src/lib/supabase.js` is tracked and hardcodes the project URL and anon key
as a fallback. The Supabase **anon/public key is designed to be public** and is not a
secret, so this is not a credential leak — but hardcoding a live project URL as a
fallback means the app silently targets this project with zero configuration, and the
committed value must be kept in sync with `.env` by hand. It is **not** the cause of
the data exposure in §5; the cause is missing RLS.

---

## 2. Database / project under test

| Item | Value |
|---|---|
| Project ref | `pukfwaxuhmeyirkddcga` (read from `SUPABASE_URL` in `.env` — the project every probe in this document actually hit) |
| Kind | **Supabase hosted** (PostgREST + GoTrue + Storage reachable) |
| `auth /health` | HTTP 200 |
| `service_role` accepted by PostgREST | HTTP 200 |
| anon key accepted at schema root | HTTP 401 (root listing is privileged) |
| Auth users | 6 |
| Organisations | 1 — `Sentio Mind`, created 2026-08-18 |
| Demo vs production | **Assessment: DEVELOPMENT / DEMO.** 6 users, 1 org, 0 invitations, `system_events` populated only by heartbeats. **Requires owner confirmation before treating as production.** |

### Project-reference divergence (latent retargeting bug)

`dashboard/.env.local` and the root `.env` both point at `pukfwaxuhmeyirkddcga` — correct
and consistent. However `dashboard/src/lib/supabase.js` hardcodes a **different** project
(`opiipezwttttnallhegz`) as a fallback when the env var is absent. If `NEXT_PUBLIC_SUPABASE_URL`
is ever missing, the frontend silently retargets a different database than the backend
worker writes to. The fallback must be removed so the app fails loudly instead.

### SQL execution capability — **BLOCKER**

| Path | Available? |
|---|---|
| DB password in `.env` or anywhere in repo | **NO** |
| Supabase management API token | **NO** |
| `exec_sql` / `execute_sql` / `run_sql` / `sql` RPC | **NO** (all 404) |
| `pg_catalog` exposed via PostgREST | **NO** (404) |
| `psql` / `pg_dump` binaries | **NOT INSTALLED** |
| `psycopg2` | installed but **blocked by Windows Application Control** (`DLL load failed`) |
| Docker daemon | **NOT RUNNING** (Docker Desktop present, engine down) |
| Local Postgres on 5432 | port open, but no usable credential and psycopg2 blocked |

**Consequence:** this machine **cannot apply DDL, cannot read `pg_class`/`pg_proc`, and
cannot `REVOKE` anything.** Every Phase 0 and Phase 1 database change is blocked on
operator action. I have not simulated, mocked, or "fixed" any of it.

---

## 3. Schema version vs migrations

**The live schema does NOT match the repository migrations.** Tables largely exist;
the function layer does not.

### Tables — live columns match repo expectations

| Table | Live cols | Verdict |
|---|---|---|
| `organisations` | 14 — incl. `owner_id`, `website`, `logo_url`, `industry`, `org_size`, `timezone`, `address`, `contact_email`, `contact_phone` | **matches migration 001+004** |
| `organisation_members` | 7 | matches |
| `meetings` | 15 — incl. `team_id`, `recording_url`, `visibility`, `workspace_type`, `owner_id` | matches |
| `organisation_settings` | 12 | matches migration 004 |
| `teams` | 6 | matches |
| `team_members` | 4 — `created_at`, `organisation_id`, `team_id`, `user_id` (**no `id`**) | matches |
| `integrations` | 5 | matches |
| `meeting_participants` | 3 | matches |
| `transcripts` / `speaker_turns` / `mom` / `jobs` | 6 / 7 / 9 / 9 | present |
| `profiles` | 5 | **exists, in no migration file** |
| `system_events` | present (0 cols returned on `select=*` limit 1) | pre-existing, in no migration |
| `public."User"` | **DOES NOT EXIST** (HTTP 404) | see §6 correction |

Row counts (service role): meetings 14, transcripts 12, speaker_turns 28, mom 12,
jobs 14, meeting_participants 40, organisation_members 6, profiles 6, teams 5,
team_members 12, integrations 7, organisation_settings 1, invitations 0, system_events 0.

### Functions — live set is a DIVERGENT BRANCH

Enumerated from the PostgREST OpenAPI document with the service role:

| Function | Live? | In repo? |
|---|---|---|
| `is_org_member` | **LIVE** | migration 002 |
| `is_org_admin` | **LIVE** | migration 002 |
| `is_org_owner` | **LIVE** | migration 002 |
| `org_role_of` | **LIVE** | migration 002 |
| `transfer_organisation_ownership` | **LIVE** | migration 002 |
| `ensure_my_profile` | **LIVE** | **in no migration file** |
| `can_view_meeting` | **LIVE** | **in no migration file — not in the repo at all** |
| `can_access_meeting` | **MISSING** | migration 002 defines it |
| `can_manage_meeting` | **MISSING** | migration 002 defines it |
| `create_organisation` | **MISSING** | migration 002 defines it |
| `invite_member` | **MISSING** | migration 002 defines it |
| `accept_invitation` | **MISSING** | migration 002 defines it |
| `revoke_invitation` | **MISSING** | migration 002 defines it |
| `update_member_role` | **MISSING** | migration 002 defines it |
| `remove_member` | **MISSING** | migration 002 defines it |
| `ensure_organisation_settings_row` | **MISSING** | migration 004 defines it |
| `assign_orphan_meetings`, `get_auth_user_id` | **MISSING** | migration 002 |
| `get_storage_usage` | **MISSING** | **in no migration file** (frontend calls it) |

**`can_view_meeting` exists but `can_access_meeting` does not** — the live database is a
different branch of the schema from the repository. Migration 002/003 are therefore
**not** applied, and something else was applied instead.

### Migration status

| Migration | Status | Note |
|---|---|---|
| `20260925130001_workspace_schema.sql` | **APPLIED** | its tables exist with expected columns |
| `20260925130002_workspace_functions.sql` | **NOT APPLIED** | 6 of its functions missing; 2 live functions are not in it |
| `20260925130003_workspace_rls.sql` | **NOT APPLIED / INEFFECTIVE** | policies depend on the missing functions |
| `20260926120000_organisation_settings.sql` | **APPLIED** | tables/columns present — despite its own header saying "not exercised against a live database yet" |

**Migration 004 static defect (still valid):** it ends with
`grant usage, select on sequence public.organisation_settings_organisation_id_seq`
but `organisation_settings.organisation_id` is a `uuid` primary key, so no such
sequence exists. The tables clearly *were* created, so this statement either failed
last or the file was applied in a way that tolerated it. It must be removed before
the file is ever replayed from zero.

---

## 4. Storage

| Item | Value |
|---|---|
| `GET /storage/v1/bucket` (service role) | HTTP 200, **empty list — zero buckets** |
| Meetings with a `recording_url` | none |
| Public audio reachable | **not currently exploitable — there is no bucket and no audio** |

**Latent P0:** `src/supabase_client.py` builds a **public** object URL for recordings.
The moment a bucket is created (or exists in another environment) every recording
becomes world-readable. This is a code defect that is currently masked by an empty
bucket, not a fix.

---

## 5. RLS status — independently verified

Probed with the **anon** key (the least-privileged role).

| Table | anon SELECT | anon INSERT |
|---|---|---|
| `meetings` | **READS** | **PRIVILEGE EXISTS** (rejected only by NOT NULL) |
| `transcripts` | **READS** | **PRIVILEGE EXISTS** |
| `mom` | **READS** | **PRIVILEGE EXISTS** |
| `speaker_turns` | **READS** | **PRIVILEGE EXISTS** |
| `jobs` | **READS** | — |
| `system_events` | **READS** | — |
| `organisations` | **READS** | — |
| `organisation_members` | **READS** | DENIED 42501 |
| `organisation_settings` | **READS** | — |
| `teams` | **READS** | DENIED 42501 |
| `team_members` | **READS** | DENIED 42501 |
| `integrations` | **READS** | DENIED 42501 |
| `meeting_participants` | **READS** | — |
| `profiles` | **READS** | — |

anon `UPDATE` / `DELETE` on `meetings`, `organisations`, `organisation_settings` returned
**HTTP 204 with no permission error** (zero-row filters, so this is not conclusive for
row-level effect, but no privilege rejection occurred).

`anon` can also execute `ensure_my_profile` (it ran and hit a NOT NULL violation).

**Conclusion: there is no effective row-level security on any meeting-content table.
Anonymous internet users can read every transcript, MOM, speaker identity, meeting row,
job row and system event in this project, and can insert into four content tables.**

Attack path: the anon key is public by design and is present in the tracked file
`dashboard/src/lib/supabase.js`. `curl -H "apikey: <anon>" "$URL/rest/v1/transcripts?select=*"`
returns the full transcript corpus. For write: `POST /rest/v1/meetings` with a
`scheduled` row containing an attacker-controlled Meet link would be picked up by
`scheduler.py` and cause the bot to join and record that meeting.

---

## 6. Corrections to the three-agent audit

Verified false or materially wrong. Recorded so no repair work is spent on them.

| Audit claim | Verdict | Evidence |
|---|---|---|
| **P0-2** `public."User"` exposes bcrypt password hashes | **FALSE** | Table does not exist. `GET /rest/v1/"User"` → HTTP 404 for both anon and service role. |
| **P0-4** anon can call `create_organisation` (an org named `__probe__` was created) | **FALSE** | `create_organisation` does not exist in the live DB (PGRST202). No such org exists; the only org is `Sentio Mind`. |
| Schema drift: `organisation_settings`, `teams`, `team_members`, `integrations` "do not exist" (PGRST205) | **FALSE** | All four exist with the expected columns and real rows. |
| Schema drift: `organisations.website/logo_url/industry/…` "all missing" | **FALSE** | All 14 columns present. |
| Schema drift: `meetings.team_id` missing | **FALSE** | Present. |
| RLS test suite "silently skips" without a service key | **FALSE** | It runs and **fails**: `71 passed, 1 skipped, 10 errors`. The 10 errors are real `PGRST202` failures for the missing `create_organisation`. |
| `SUPABASE_SERVICE_ROLE_KEY` absent from `.env` | **FALSE** | Present and populated (219 chars, JWT). |
| "No `__probe__` cleanup needed" | n/a | No probe artefacts were created. My probes used constraint-violating payloads and zero-row filters; **no row was written or deleted.** |

**Confirmed and worse than reported:**
- anon has **INSERT** privilege on four content tables (the audit only claimed read).
- The entire organisation **RPC layer is absent** — `create_organisation`, `invite_member`,
  `accept_invitation`, `revoke_invitation`, `update_member_role`, `remove_member` all
  missing. Every organisation mutation in the UI therefore cannot work against this
  database. Audit findings that "role change mutates the DB" were produced against a
  mock and are not valid.
- `can_view_meeting` exists in the live DB and **in no migration file** — the deployed
  schema has drifted from the repository in a way nobody has recorded.

---

## 7. Services

| Service | State | Evidence |
|---|---|---|
| Frontend | **RUNNING** | HTTP 200 on `/dashboard`; process is `next dev -p 3000 -H 0.0.0.0` (dev server, not a production build) |
| Recap FastAPI (`src/api.py`) | **NOT RUNNING** | no process; port 8000 is held by an unrelated project |
| Recap worker | **NOT RUNNING** | no `python` process from this repo |
| Recap scheduler | **NOT RUNNING** | same |
| Port 8000 | **belongs to another project** | `D:\movie wala\.venv\… uvicorn app.main:app` — "Movie App API" |
| Storage bucket | **none** | §4 |

**No worker or scheduler means the recording pipeline cannot run and has never run
against this project** (`system_events` is empty). Pipeline verification is therefore
**UNVERIFIED** and cannot be made verified without a live Google Meet credential, an
audio sink, and a running worker.

---

## 8. Routes

16 routes exist: `/`, `/login`, `/dashboard`, `/meetings`, `/meetings/[id]`, `/calendar`,
`/calendar/connect`, `/library`, `/insights`, `/settings`, `/organisation/overview`,
`/organisation/meetings`, `/organisation/members`, `/organisation/analytics`,
`/organisation/settings`, `/organisation/billing`.

**`/join` does not exist**, although the Members panel advertises an invite link of the
form `/join?org=…&role=…` — confirmed 404.

---

## 9. Tests

| Suite | Command | Result |
|---|---|---|
| Frontend unit | `npm test` (in `dashboard/`) | **10 passed** — all pure functions in `workspaceScope.mjs`; zero component/UI tests |
| Backend | `python -m pytest tests -q` | **71 passed, 1 skipped, 10 errors** |
| Backend (documented command) | `python -m pytest` from repo root | **fails** — collects gitignored `scratch/` and errors; `pytest.ini` has no `testpaths` |
| RLS / tenant isolation | `tests/test_workspace_rls.py` | **10 ERRORS** — real failures against the live DB, because `create_organisation` is missing. This suite is the correct safety net and it is currently red. |

---

## 10. What this baseline blocks

| Phase | Blocked? | Reason |
|---|---|---|
| Phase 0 — enable RLS, revoke anon, privatise audio, harden RPCs | **YES** | needs DDL |
| Phase 1 — fix + apply migrations, reproduce schema from zero | **YES** | needs DDL; no engine reachable to even test replay |
| Phase 4B/C/E/F/G/P — org members, teams auth, access-control enforcement, meeting settings enforcement, integrations, search backend, viewer role | **PARTIAL** | the RPC/function layer they depend on does not exist; I can write the SQL and the client code, but cannot deploy or prove it |
| Phase 4Q — verify the recording pipeline | **YES** | no worker, no scheduler, no audio device, no live Meet account |
| Phases 3, 5, 6, 7, 8, 9, 10, 12, 13 + Phase 4A/D/H/I/J/K/L/M/N/O/R/S | **NO** | pure application-layer work; fully actionable now |

## 11. What I need from the operator

Any **one** of these unblocks Phase 0 and Phase 1:

1. The **database password** for the project (enables direct DDL via `psql`/psycopg2 — note psycopg2 is currently App-Control-blocked, so `psql` or a Docker Postgres would be needed), **or**
2. A **Supabase management API token** (enables the `/v1/projects/{ref}/database/query` endpoint), **or**
3. Run the SQL I provide in the **Supabase SQL editor** and paste back the result.

Until then I will proceed with every unblocked phase and will not claim any database
change as fixed.
