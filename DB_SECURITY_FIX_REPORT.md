# DB_SECURITY_FIX_REPORT.md

**Date:** 2026-09-27
**Project:** `pukfwaxuhmeyirkddcga` (Supabase hosted, existing Recap demo)
**Status of database changes: NOT APPLIED.** See §1.

---

## 1. Why nothing was applied to the database

Every available route to executing DDL was tested and none exists on this machine.

| Attempt | Result |
|---|---|
| `GET https://api.supabase.com/v1/projects/pukfwaxuhmeyirkddcga` (no token) | **HTTP 401 Unauthorized** |
| Search `.env` for `SUPABASE_ACCESS_TOKEN` / `MANAGEMENT_TOKEN` / `sbp_*` / `sb_secret_*` | **not present** |
| Search `.env` for `POSTGRES_PASSWORD` / `DATABASE_URL` / `SUPABASE_DB_PASSWORD` | **not present** |
| Search whole filesystem for `sbp_` / `sb_secret_` / `postgresql://` / `pooler.supabase.com` | **no Recap-related hit** |
| `C:\Users\imhar\.supabase`, `supabase\.temp`, `supabase\config.toml` | **no credentials** (telemetry + version string only) |
| TCP `db.pukfwaxuhmeyirkddcga.supabase.co:5432` | **DNS does not resolve** |
| `psql`, `pg_dump` | **not installed** |
| `psycopg2` | **blocked by Windows Application Control** — `ImportError: DLL load failed` |
| Docker Desktop | **not installed** (only the CLI shim; engine never starts) |
| podman / nerdctl / containerd | **not installed** |
| PostgREST RPC that executes SQL (`exec_sql`, `execute_sql`, `run_sql`, `sql`, `eval`, `query`, `pg_execute`, `admin_exec_sql`, `apply_migration`, `exec`) | **none exist** (all 404) |
| `pg_catalog` via PostgREST | **HTTP 404** |

I did not create a new Supabase project, did not reset the database, and did not
modify the existing `Sentio Mind` organisation.

**To unblock, supply any one of:** the database password, a Supabase management API
token, or run the SQL below in the Supabase SQL editor and paste the output back.

---

## 2. What was actually changed (source control only)

| File | Change |
|---|---|
| `supabase/migrations/20260927120000_security_hardening.sql` | **NEW.** 84 statements. RLS on 6 leaking tables, 12+ policies, 36 grants/revokes, 8 functions, 1 trigger, 1 storage bucket + 3 storage policies. |
| `supabase/migrations/20260925130002_workspace_functions.sql` | **MODIFIED.** Replaced 3 references to the non-existent `public."User"` with `public.profiles`. Without this the file aborts on apply. |
| `supabase/migrations/20260925130003_workspace_rls.sql` | **MODIFIED.** Replaced 5 references to the non-existent `public."User"` with self-only `profiles` policies keyed on `id = auth.uid()`. Without this the file aborts at line 24. |
| `supabase/migrations/20260926120000_organisation_settings.sql` | Modified earlier: removed the impossible `grant ... on sequence organisation_settings_organisation_id_seq`. |
| `tools/verify_rls.py` | **NEW.** Executable verifier. Run after applying; exits non-zero on any failure. |
| `AUDIT_DB_BASELINE.md` | **NEW.** Live-state evidence. |
| `AUDIT_BASELINE.md` | Corrected: real project ref, real auth-user count, corrected leak scope. |

**Validation actually performed:** all five migration files were parsed with
`pglast` v8.4, which wraps the real PostgreSQL parser. Result: `PARSE OK` for all
five (30 / 32 / 50 / 62 / 84 statements). This proves the SQL is syntactically valid
PostgreSQL. **It does not prove it executes**, because no database was available.

---

## 3. The exposure being fixed (measured, not assumed)

With the `anon` key and no session, against the live project:

| Table | anon SELECT | anon INSERT |
|---|---|---|
| `meetings` | returns real rows | privilege exists |
| `transcripts` | returns real rows | privilege exists |
| `mom` | returns real rows | privilege exists |
| `speaker_turns` | returns real rows | privilege exists |
| `jobs` | returns real rows | privilege exists |
| `system_events` | returns real rows | privilege exists |

The other nine tables (`organisations`, `organisation_members`,
`organisation_invitations`, `organisation_settings`, `teams`, `team_members`,
`integrations`, `profiles`, `meeting_participants`) already have RLS and correctly
return zero rows.

The anon key is public by design and was previously hardcoded as a fallback in
`dashboard/src/lib/supabase.js`. That fallback has been removed, so the app now
throws at startup instead of silently retargeting a different project.

**Impact before the fix:** anyone on the internet holding the publishable anon key
could read every meeting title, Meet link, transcript, summary, decision, action
item and speaker identity in the project, and could insert rows into six content
tables — including inserting a `scheduled` meeting containing an attacker-controlled
Meet link, which `scheduler.py` would then claim and record.

---

## 4. What the migration does

### 4.1 Constraints widened first (a runtime failure the parser cannot catch)
`organisation_members.role` is `check (role in ('owner','admin','member'))`,
`organisation_members.status` is `check (status in ('active','suspended'))`, and
`organisation_invitations.role` is `check (role in ('admin','member'))`. The new
functions use `'viewer'` and `'removed'`, which those constraints would reject. The
migration widens all three before use. Parses fine either way; would have failed at
runtime.

### 4.2 Authorisation foundation
`meeting_owner_id(uuid)` coalesces `owner_id` and `user_id` because live rows carry
both and historical rows have `owner_id` null.

`can_access_meeting(uuid)` — owner, active member of the owning organisation, or an
explicit `meeting_participants` row.
`can_manage_meeting(uuid)` — owner, or an owner/admin of the org when the meeting is
not `private`.

Both are `security definer` with `set search_path = public, pg_temp` so a caller
cannot shadow `auth.uid()` or the tables.

### 4.3 RLS enabled on the six leaking tables
`meetings` gets select/insert/update/delete policies. `transcripts`, `mom`,
`speaker_turns`, `jobs` get the same four generated through a `DO` block keyed on
`meeting_id`. `system_events` explicitly excludes `meeting_id IS NULL` rows (worker
heartbeats), which stay backend-only. `meeting_participants` is added to the meeting
graph.

### 4.4 Grants revoked
`revoke all … from anon` on all 15 tables. RLS alone is not enough: anon also holds
table-level grants, so a future accidental `disable row level security` would
silently re-open the corpus.

`can_view_meeting` is revoked from `anon` (it is an orphaned anon-callable oracle) but
**not dropped** — see `DB_MIGRATION_RECONCILIATION.md`.

### 4.5 Six organisation RPCs created
Signatures match the exact argument names the frontend sends:

| RPC | Rules enforced |
|---|---|
| `create_organisation(text)` | authenticated; non-empty name; caller becomes `owner`; creates the settings row |
| `invite_member(uuid,text,text)` | owner/admin only; validates email and role; rejects a duplicate pending invite |
| `accept_invitation(uuid)` | must be pending and unexpired; **must match the caller's own auth email**; upserts membership |
| `revoke_invitation(uuid)` | owner/admin of that invitation's own org only |
| `update_member_role(uuid,uuid,text)` | **owner only**; the owner role cannot be changed through it |
| `remove_member(uuid,uuid)` | owner/admin; owner cannot be removed; only an owner may remove an admin; cannot remove yourself |

All are `security definer` with a pinned `search_path`, `EXECUTE` revoked from
`public` and granted only to `authenticated` and `service_role`.

### 4.6 `organisation_settings` trigger
`ensure_organisation_settings_row()` did not exist live, so a newly created
organisation never got its settings row. Created, plus a trigger on
`organisations`, plus an explicit insert inside `create_organisation` so the RPC
works even if the trigger has not fired.

### 4.7 Storage
No bucket exists today, so nothing is currently exposed — but
`src/supabase_client.py` builds a **public** object URL, so the first bucket created
would expose every recording. The migration creates `recordings` as
`public = false` and gates reads on `can_access_meeting((storage.foldername(name))[1]::uuid)`,
since files are stored as `<meeting_id>/audio.wav`.

---

## 5. Verification performed

`python tools/verify_rls.py` run against the **current, unfixed** database:

```
1. Anonymous access must be denied
  FAIL  anon SELECT meetings returns no rows
  FAIL  anon SELECT transcripts returns no rows
  FAIL  anon SELECT mom returns no rows
  FAIL  anon SELECT speaker_turns returns no rows
  FAIL  anon SELECT jobs returns no rows
  FAIL  anon SELECT system_events returns no rows
  PASS  anon SELECT meeting_participants / organisations / organisation_members /
        organisation_invitations / organisation_settings / teams / team_members /
        integrations / profiles  (10 tables)

2. Anonymous writes must be denied by permission, not by constraint
  FAIL  anon INSERT meetings / transcripts / mom / speaker_turns / jobs / system_events
        (all rejected only by NOT NULL, proving the grant exists)

3. Anonymous RPC execution must be denied
  FAIL  all six — HTTP 404 PGRST202, the functions do not exist

5. Storage  SKIP  (no buckets exist)

6. Required RPCs must exist
  FAIL  all eight missing

RESULT   passed: 9   failed: 26   total: 35
SECURITY VERIFICATION FAILED
```

This is the honest current state. The verifier is proven to detect the exposure; it
is the same script that must be re-run after the migration is applied.

---

## 6. Exact negative-probe results (current state, pre-fix)

| # | Probe | Expected after fix | Actual now |
|---|---|---|---|
| 1 | anon `SELECT meetings` | 401/403 or 0 rows | **rows returned** |
| 2 | anon `SELECT transcripts` | 401/403 or 0 rows | **rows returned** |
| 3 | anon `SELECT mom` | 401/403 or 0 rows | **rows returned** |
| 4 | anon `SELECT speaker_turns` | 401/403 or 0 rows | **rows returned** |
| 5 | anon `SELECT recordings` (storage) | 4xx | **no bucket exists** |
| 6 | anon `INSERT meetings` | 42501 | **23502 — grant exists** |
| 7 | anon `INSERT transcripts` | 42501 | **23502 — grant exists** |
| 8 | anon `RPC create_organisation` | 42501 | **404 — function missing** |
| 9 | user in org A reading org B meeting | 0 rows | **NOT TESTABLE — only 1 org exists** |
| 10 | user in org A reading org B transcript | 0 rows | **NOT TESTABLE — only 1 org exists** |
| 11 | user in org A reading org B recording | 4xx | **NOT TESTABLE — no recordings** |

Probes 9–11 are reported as untestable rather than passing. The environment has one
organisation and no authenticated session can be minted without credentials.

---

## 7. Application impact (Phase 9 — will the app still work?)

Designed so that **no application change is required**:

- The client scopes reads with `organisation_id` filters and filters `mom`,
  `speaker_turns`, `transcripts` client-side by meeting id. With RLS those reads
  additionally pass through `can_access_meeting`, which returns true for the same
  users who could already see the rows. No row a legitimate user could previously see
  becomes invisible.
- The six RPCs are created with the exact argument names `WorkspaceSwitcher.jsx` and
  `MembersAccessPanel.jsx` already send, so no frontend change is needed.
- The Python worker uses the service role, which bypasses RLS by design and is
  unaffected.
- `ensure_my_profile` continues to be callable by authenticated users.

The one behaviour change: `organisation_members` INSERT was already denied to anon, and
now `meetings` INSERT requires `owner_id`/`user_id` to be the caller. `AddMeetingModal`
does not set `owner_id`, so `coalesce(owner_id, user_id)` falls back to `user_id`,
which the backend defaults. If inserts start failing after the migration, that default
is the first thing to check — reported here in advance rather than discovered later.

**This has not been runtime-verified, because the migration is not applied.**

---

## 8. Credentials requiring rotation

| Credential | Status | Action |
|---|---|---|
| Supabase **anon** key | Public by design; was committed as a hardcoded fallback | Fallback removed from source. **No rotation required** — rotating it would break every client. Its exposure is only dangerous because RLS was missing, which this migration fixes. |
| `SUPABASE_SERVICE_ROLE_KEY` | Present in `.env`, gitignored, never in source or logs | **No rotation required.** Confirm it is not in git history: `git log -p --all \| grep <key>` should return nothing. |
| Database password | Not present anywhere | n/a |
| `GOOGLE_CLIENT_SECRET`, `GOOGLE_BOT_APP_PASSWORD`, `GROQ_API_KEY`, `GEMINI_API_KEY`, `HUGGINGFACE_TOKEN` | Present in `.env`, gitignored | No evidence of exposure. Not in any frontend bundle. |
| `public."User".passwordHash` | **Table does not exist.** No hashes are exposed. | **No rotation required.** The earlier report of leaked bcrypt hashes was incorrect. |

No secret value appears in this report, in the migration, or in any committed file.

---

## 9. Remaining blockers

1. **DDL cannot be applied from this machine.** Supply a database password, a
   management token, or run the migration in the SQL editor.
2. **After applying, the verifier must report 0 failures** before this is considered
   fixed. It currently reports 26.
3. **Cross-tenant isolation is unproven at runtime** — one organisation exists. Seed a
   second tenant, or add a second org via `create_organisation` once it exists, then
   re-run.
4. **`tests/test_workspace_rls.py` still reports 10 errors** because
   `create_organisation` is missing. Those errors should clear once the migration is
   applied; the tests themselves were not weakened.
5. **The recording pipeline has never been executed**, so the storage policies and the
   `pipeline_stage` instrumentation remain unverified against real audio.
6. `can_view_meeting` is still present (anon EXECUTE revoked). Drop it in a later
   migration once confirmed unused.
