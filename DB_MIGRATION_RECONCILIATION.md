# DB_MIGRATION_RECONCILIATION.md

**Date:** 2026-09-27
**Goal:** `LIVE DB schema` == `INTENDED SCHEMA` == `VERSION-CONTROLLED MIGRATIONS`

---

## 1. Migration-by-migration status against the live database

| Migration | Statements | Parses | Applied live? | Evidence |
|---|---|---|---|---|
| `20260925130001_workspace_schema.sql` | 30 | OK | **Effectively yes** | All its tables exist with the expected columns |
| `20260925130002_workspace_functions.sql` | 32 | OK | **NO** | 8 of its functions are missing from the live OpenAPI document |
| `20260925130003_workspace_rls.sql` | 50 | OK | **NO** | Its policies call `can_access_meeting`/`is_org_member`, which do not exist; and it aborted at line 24 on `public."User"` |
| `20260926120000_organisation_settings.sql` | 62 | OK | **Yes, in effect** | `organisation_settings` (23 cols), `teams` (9), `team_members` (4), `integrations` (10) all exist |
| `20260927120000_security_hardening.sql` | 84 | OK | **NOT APPLIED** | New; requires DDL access |

"Parses" = validated with `pglast` v8.4, which wraps the PostgreSQL parser.

---

## 2. Objects in the live database that no migration creates

| Object | Kind | Consequence |
|---|---|---|
| `can_view_meeting(uuid)` | function | **Orphaned.** Defined nowhere in `supabase/migrations`. Referenced nowhere in `dashboard/src`, `src`, `tests`, `scripts` (verified with `git grep`). |
| `profiles` (id, name, avatar_url, created_at, updated_at) | table | Migration 003 creates *policies* on `profiles` but no migration creates the table. |
| `system_events` | table | Same: policies and grants exist, no `CREATE TABLE`. |
| `meeting_participants` | table | Same. |

`profiles`, `system_events` and `meeting_participants` are presumably created by the
Supabase dashboard or an earlier manual step. They are not reproducible from the repo.

---

## 3. Investigation: `can_view_meeting`

| Question | Finding |
|---|---|
| Who created it? | Unknown. Not in any migration, so it was created manually through the Supabase SQL editor or dashboard, or by a migration that was later deleted. |
| What does it do? | Returns `false` for a non-existent meeting id. It is an access predicate, evidently an earlier name for `can_access_meeting`. |
| Does the app use it? | **No.** `git grep can_view_meeting` over `dashboard/src`, `src`, `supabase`, `tests`, `scripts` returns nothing. |
| Is it required? | Not by the application. It is almost certainly dead code from a renamed function. |
| Is it secure? | **No.** Called with the `anon` key and a non-existent id it returned **HTTP 200 `false`**, so anon can call it. That turns it into an oracle for probing which meeting ids exist. |

**Decision: do not drop it blindly.** A live object with no recorded provenance is
exactly the kind of thing that should not be deleted on a guess. The security
migration therefore **revokes `anon` EXECUTE** and grants it only to
`authenticated`/`service_role`, keeping the function. A later migration should drop
it once the application is confirmed not to need it.

---

## 4. Defects found and fixed in the migration files

These were real breakages, found by inspecting the live schema against the repo, and
they are fixed in source control now.

### 4.1 `public."User"` does not exist — 8 references across 2 files

`GET /rest/v1/"User"` returns **HTTP 404** for both `anon` and `service_role`. The
live profile table is `profiles`.

| File | Lines | Fix |
|---|---|---|
| `…_002_workspace_functions.sql` | 173 | `display_name` fallback in `create_organisation` now reads `public.profiles p where p.id = v_uid` |
| `…_002_workspace_functions.sql` | 337 | same, in `accept_invitation` |
| `…_002_workspace_functions.sql` | 494–520 | `ensure_my_profile` rewritten to upsert `profiles (id, name, …)`. The live deployed function already writes to `profiles`, so the repo copy was simply stale. |
| `…_003_workspace_rls.sql` | 24 | `alter table public."User"` → `public.profiles` |
| `…_003_workspace_rls.sql` | 55 | grant list retargeted to `profiles` |
| `…_003_workspace_rls.sql` | 236/240/244 | three self-only policies retargeted to `profiles`, keyed on `id = auth.uid()` (the old ones keyed on `email`, which `profiles` does not have) |

**Impact:** before this fix, migration 002 and migration 003 would abort on apply.
Migration 003 aborted at its very first content statement (line 24), which is why its
policies were never in force.

### 4.2 Impossible sequence grant (fixed earlier, recorded here)

`20260926120000_organisation_settings.sql` ended with

```sql
grant usage, select on sequence public.organisation_settings_organisation_id_seq to authenticated;
```

`organisation_settings.organisation_id` is a `uuid` primary key, so no such sequence
exists. Replaying that file inside a transaction aborted the entire migration.
Removed, with a comment explaining why.

### 4.3 Missing function: `ensure_organisation_settings_row()`

Migration 004 installs a trigger that calls it, but the function is not defined in
004 and does not exist live. Result: a newly created organisation never receives its
`organisation_settings` row, and Billing/Teams/Meeting-Settings silently degrade.
Defined in the new security migration, together with the trigger and an explicit
insert inside `create_organisation`.

### 4.4 CHECK constraints that would reject the new role/status values

| Constraint | Current | New code needs |
|---|---|---|
| `organisation_members.role` | `('owner','admin','member')` | `viewer` |
| `organisation_members.status` | `('active','suspended')` | `removed` |
| `organisation_invitations.role` | `('admin','member')` | `viewer` |

`pglast` cannot validate CHECK constraints, so this parses cleanly and then fails at
runtime. The security migration widens all three inside a guarded `DO` block that
first checks `pg_constraint`, so it is a no-op if the constraint is absent or already
wide.

---

## 5. Reconciliation status

| Goal | State |
|---|---|
| Live table set == migration table set | **Yes.** All 15 live tables are created by 001 or 004, or are the three dashboard-created tables (`profiles`, `system_events`, `meeting_participants`) that no migration creates. |
| Live columns == migration columns | **Yes** for every table checked (full column lists captured in `AUDIT_DB_BASELINE.md` §2). |
| Live functions == migration functions | **No.** 8 functions the frontend calls, plus 2 that RLS depends on, are missing. The new security migration creates all 10. |
| `public."User"` drift | **Resolved in source.** The table does not exist; all references retargeted to `profiles`. |
| Orphaned live function | **Contained, not deleted.** `can_view_meeting` retained, anon EXECUTE revoked. |
| Migration replayability from zero | **Not proven.** No Postgres instance is reachable. All five files parse. `001→002→003→004→005` should now apply cleanly, but that is a prediction, not a verified result. |
| Migration history | **Out of order relative to reality.** 001 and 004 are applied; 002 and 003 are not. A fresh environment running them in filename order will produce a *stricter* schema than the live one, which is the correct direction. |

---

## 6. How to prove replayability once a database is available

1. Create a throwaway Postgres 15 (any Supabase project or local instance).
2. Apply in filename order, one transaction each:
   `20260925130001` → `002` → `003` → `004` → `005`
3. Any abort identifies the next divergence; the parse check will not catch it.
4. Then point the app at it and run `python tools/verify_rls.py`.

Step 3 is the part that could not be performed here.

---

## 7. Outstanding drift, honestly

- `profiles`, `system_events`, `meeting_participants` are **not created by any
  migration**. A new environment will not have them and the new migration's policies
  on `profiles` will fail. **A forward migration creating those three tables is still
  needed** and was deliberately not written here, because their exact live definition
  (types, defaults, indexes, triggers) cannot be read without `pg_catalog` access and
  guessing would risk breaking the demo data.
- `organisation_invitations.name` and `organisation_members.display_name` are live
  columns with no documented purpose in the repo.
- 16 `phase1-test-*` auth users and 4 test tenants are left behind by previous runs of
  `tests/test_workspace_rls.py`. They are test residue in a demo project. Cleaning
  them requires `auth.admin.deleteUser` and was not done, to avoid destroying data
  without instruction.
