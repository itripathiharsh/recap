# AUDIT_DB_BASELINE.md

**Captured:** 2026-09-27
**Project:** `pukfwaxuhmeyirkddcga` (Supabase hosted, read from `SUPABASE_URL` in `.env`)
**Method:** live probing over HTTPS via PostgREST / GoTrue (Auth) / Storage, using the
`anon` and `service_role` keys. **No row was written or deleted.** Table/column
inventory was read from the service-role OpenAPI document.
**This is the live database as observed, not the migration files.**

---

## 1. Execution-path check (run first, because it gates everything)

| Path | Result |
|---|---|
| Supabase Management API `/v1/projects/<ref>` without token | **HTTP 401 Unauthorized** |
| `SUPABASE_ACCESS_TOKEN` / management token in `.env` | **absent** (only `GOOGLE_CLIENT_SECRET`, unrelated) |
| Database password / `DATABASE_URL` / `POSTGRES_PASSWORD` | **absent** (only `GOOGLE_BOT_APP_PASSWORD`, a Gmail app password) |
| Direct Postgres `db.<ref>.supabase.co:5432` | **DNS does not resolve** (`gaierror`) |
| `psql` / `pg_dump` binaries | **not installed** |
| `psycopg2` | installed but **blocked by Windows Application Control** (`DLL load failed`) |
| Docker / podman container engine | **not running / not installed** |
| SQL-executing PostgREST RPC (`exec_sql`, `execute_sql`, `run_sql`, `sql`, …) | **none exist** |
| `pg_catalog` reachable through PostgREST | **HTTP 404** |

**Consequence: no DDL can be executed from this machine.** Everything in
`DB_SECURITY_FIX_REPORT.md` is authored and syntax-verified but **NOT APPLIED**.

---

## 2. Tables (15) and columns, exactly as live

| Table | Cols | Columns |
|---|---|---|
| `meetings` | 19 | id, user_id, title, meet_link, scheduled_start, scheduled_end, expected_duration_minutes, status, started_at, ended_at, error_message, created_at, updated_at, recording_url, organisation_id, workspace_type, visibility, owner_id, team_id |
| `transcripts` | 6 | id, meeting_id, language, confidence, transcript_json, created_at |
| `mom` | 9 | id, meeting_id, summary, decisions, action_items, open_questions, mom_markdown, created_at, updated_at |
| `speaker_turns` | 7 | id, meeting_id, speaker, start_time, end_time, created_at, text |
| `meeting_participants` | 3 | meeting_id, user_id, created_at |
| `jobs` | 9 | id, meeting_id, job_type, status, attempts, started_at, completed_at, error, created_at |
| `system_events` | 7 | id, meeting_id, level, event_type, message, metadata, created_at |
| `organisations` | 14 | id, name, owner_id, description, website, logo_url, industry, org_size, timezone, address, contact_email, contact_phone, created_at, updated_at |
| `organisation_members` | 9 | id, organisation_id, user_id, role, status, email, display_name, created_at, updated_at |
| `organisation_invitations` | 10 | id, organisation_id, email, name, role, invited_by, status, expires_at, created_at, updated_at |
| `organisation_settings` | 23 | organisation_id, auto_record_meetings, auto_summaries, default_language, default_privacy, meeting_data_access, export_downloads, org_settings_access, plan, member_limit, storage_quota_bytes, storage_used_bytes, recording_notification, recording_quality, bot_name, join_delay_seconds, generate_transcripts, extract_action_items, detect_speakers, default_meeting_message, allowed_domains, blocked_keywords, updated_at |
| `teams` | 9 | id, organisation_id, name, description, color, meeting_data_access, library_access, export_downloads, created_at |
| `team_members` | 4 | team_id, user_id, organisation_id, created_at |
| `integrations` | 10 | id, organisation_id, provider, status, account_email, account_name, connected_at, config, created_at, updated_at |
| `profiles` | 5 | id, name, avatar_url, created_at, updated_at |

Notes:
- There is **no `action_items` table and no `recordings` table**. Action items live in
  `mom.action_items` (jsonb). Audio lives in Supabase Storage and is referenced by
  `meetings.recording_url`.
- `meetings` carries **both** `user_id` and `owner_id`. Any ownership predicate must
  coalesce them, because historical rows have `owner_id` null.
- `team_members` has **no `id` column** (composite `(team_id, user_id)`).

---

## 3. Access matrix — anonymous key, no session

| Table | anon SELECT | anon INSERT | service rows |
|---|---|---|---|
| `meetings` | **READABLE** | **PRIVILEGE EXISTS** | 14 |
| `transcripts` | **READABLE** | **PRIVILEGE EXISTS** | 12 |
| `mom` | **READABLE** | **PRIVILEGE EXISTS** | 12 |
| `speaker_turns` | **READABLE** | **PRIVILEGE EXISTS** | 28 |
| `jobs` | **READABLE** | **PRIVILEGE EXISTS** | 14 |
| `system_events` | **READABLE** | **PRIVILEGE EXISTS** | 12 |
| `meeting_participants` | returns 0 rows | denied 42501 | 40 |
| `organisations` | returns 0 rows | denied 42501 | 1 |
| `organisation_members` | returns 0 rows | denied 42501 | 6 |
| `organisation_invitations` | returns 0 rows | denied 42501 | 0 |
| `organisation_settings` | returns 0 rows | denied 42501 | 1 |
| `teams` | returns 0 rows | denied 42501 | 5 |
| `team_members` | returns 0 rows | denied 42501 | 12 |
| `integrations` | returns 0 rows | denied 42501 | 7 |
| `profiles` | returns 0 rows | denied 42501 | 6 |

**Correction to the previous report.** An earlier audit described all 15 tables as
anon-readable. That was wrong: it tested only for HTTP 200 and mistook
"200 + empty array" for readable. The nine organisation/profile tables **do** have RLS
enabled and correctly return zero rows to anon. **The real exposure is exactly six
content tables**: `meetings`, `transcripts`, `mom`, `speaker_turns`, `jobs`,
`system_events`.

`anon UPDATE` / `anon DELETE` on `meetings`, `organisations`, `teams`,
`speaker_turns` returned **HTTP 204 with no privilege error** using zero-row filters.
That is inconclusive at row level (RLS can also produce 204 by hiding rows) but no
grant was refused, so the grants are assumed present and are revoked explicitly.

---

## 4. Functions / RPCs

**Live (7):** `can_view_meeting`, `ensure_my_profile`, `is_org_admin`, `is_org_member`,
`is_org_owner`, `org_role_of`, `transfer_organisation_ownership`

**Called by the frontend but MISSING (all return `PGRST202`):**

| RPC | Called from | Consequence |
|---|---|---|
| `create_organisation(text)` | `WorkspaceSwitcher.jsx` | creating an org fails |
| `invite_member(uuid,text,text)` | `MembersAccessPanel.jsx` | inviting fails |
| `accept_invitation(uuid)` | `WorkspaceSwitcher.jsx` | pending invite cannot be accepted |
| `revoke_invitation(uuid)` | `MembersAccessPanel.jsx` | revoke fails |
| `update_member_role(uuid,uuid,text)` | `MembersAccessPanel.jsx` | role change fails |
| `remove_member(uuid,uuid)` | `MembersAccessPanel.jsx` | removal fails |

**Missing and required as the RLS foundation:** `can_access_meeting(uuid)`,
`can_manage_meeting(uuid)` — defined in migration 002, absent live, and referenced by
every policy in migration 003. This is why migration 003 could never have applied.

### `can_view_meeting` investigation (Phase 4)

- Exists live; **defined in no repository migration**.
- **Referenced nowhere** in `dashboard/src`, `src`, `tests`, `scripts`, or
  `supabase/` (verified with `git grep`).
- Called as **anon** with a non-existent meeting id it returned **HTTP 200 `false`** —
  so it is anon-callable and acts as an existence oracle for meeting ids.
- **Verdict: orphaned, and a minor information leak.** It is *not* dropped blindly; the
  fix revokes `anon` EXECUTE and keeps the function. A later migration should drop it
  once the application is confirmed not to need it.

---

## 5. Storage

- `GET /storage/v1/bucket` (service role) → **HTTP 200, zero buckets**.
- `meetings` with a non-null `recording_url` → **0**.

No recording is exposed today, because nothing has been recorded to this project.
**This is latent, not fixed:** `src/supabase_client.py` builds a **public** object URL,
so the instant a bucket exists every recording becomes world-readable.

---

## 6. Tenancy data

- Organisations: **1** — `Sentio Mind`, created 2026-08-18
- `organisation_members`: **6 rows** — roles `{owner: 1, admin: 1, member: 4}`,
  statuses `{active: 6}`
- Auth users: **22**, including 16 `phase1-test-*` accounts left behind by previous
  runs of `tests/test_workspace_rls.py` (4 runs × owner/admin/member/outsider), plus
  6 `*.demo` accounts.
  *(An earlier report said 6 users; that was an artefact of paginating with
  `per_page=1`.)*

Because there is exactly **one** organisation, a live cross-tenant probe is not
possible without seeding a second tenant. `tools/verify_rls.py` reports this as SKIP
rather than pretending to pass.

---

## 7. Constraint facts that affect the fix (from migration 001, assumed live)

| Constraint | Definition | Consequence |
|---|---|---|
| `organisation_members.role` | `check (role in ('owner','admin','member'))` | **`viewer` would be rejected** |
| `organisation_members.status` | `check (status in ('active','suspended'))` | **`removed` would be rejected** |
| `organisation_invitations.role` | `check (role in ('admin','member'))` | **`viewer` would be rejected** |
| `organisation_members` | `unique (organisation_id, user_id)` | required by `accept_invitation`'s `on conflict` |

These are CHECK constraints. **The PostgreSQL parser does not validate them**, so a
migration that inserts `'viewer'` or sets `'removed'` parses cleanly and then fails at
runtime. The fix widens the constraints before using the new values.

---

## 8. Storage-bucket history

`public."User"` (with a `passwordHash` column) was reported by an earlier audit as
world-readable. **It does not exist** — `GET /rest/v1/"User"` returns 404 for both
`anon` and `service_role`. No password hashes are exposed. However migration 002 and
003 still reference it in 8 places, so **migration 002 and 003 will abort** if applied
to this project. See `DB_MIGRATION_RECONCILIATION.md`.
