# DB_BLOCKERS.md

**Status: DATABASE ACTION REQUIRED — NOT FIXED.**

Nothing in this document has been applied. This machine has **no SQL execution path**
(no DB password, no Supabase management token, no `psql`, `psycopg2` blocked by App
Control, Docker daemon down). See `AUDIT_BASELINE.md` §2 and §10.

Every statement below was **derived from evidence**, not invented:
- the four files in `supabase/migrations/`
- the live schema, enumerated via the PostgREST OpenAPI document with the service role
- the exact queries and RPC names the frontend issues (`grep` of `dashboard/src`)
- the expectations in `tests/test_workspace_rls.py` (currently 10 errors, not skipped)
- anonymous-key probes against the live project

**Environment: treat as DEVELOPMENT/DEMO.** Do not delete data, do not reset the
database, do not modify the existing `Sentio Mind` organisation. Nothing below is
destructive to rows; it is DDL + privilege work only.

---

## DATABASE ACTION REQUIRED

### 1. Tables currently exposed to the `anon` role

Verified by anonymous-key `SELECT`. There is no effective RLS on any content table.

| Table | anon SELECT | anon INSERT |
|---|---|---|
| `meetings` | **reads** | **privilege exists** (rejected only by NOT NULL) |
| `transcripts` | **reads** | **privilege exists** |
| `mom` | **reads** | **privilege exists** |
| `speaker_turns` | **reads** | **privilege exists** |
| `jobs` | **reads** | not tested |
| `system_events` | **reads** | not tested |
| `organisations` | **reads** | not tested |
| `organisation_members` | **reads** | denied 42501 |
| `organisation_settings` | **reads** | not tested |
| `teams` / `team_members` | **reads** | denied 42501 |
| `integrations` | **reads** | denied 42501 |
| `meeting_participants` | **reads** | not tested |
| `profiles` | **reads** | not tested |

anon `UPDATE`/`DELETE` returned HTTP 204 with no privilege rejection on `meetings`,
`organisations`, `organisation_settings` (zero-row filters, so not conclusive for
row-level effect, but no grant was refused).

### 2. Required RLS policies

`20260925130003_workspace_rls.sql` already contains policies, but they call
`can_access_meeting()` / `is_org_member()` / `is_org_admin()`, and those functions
**do not exist in the live database** (see §4). So the policies either were never
created or were created against missing functions.

**Prerequisite — create the function layer first (§4).** Then the RLS file can be
re-applied. The minimum policy set the application requires, derived from the
frontend's actual access patterns:

```sql
-- meetings: members of the owning org, or the owner, or explicit participants
alter table public.meetings enable row level security;

drop policy if exists meetings_select on public.meetings;
create policy meetings_select on public.meetings
  for select to authenticated
  using (public.can_access_meeting(id));

drop policy if exists meetings_insert on public.meetings;
create policy meetings_insert on public.meetings
  for insert to authenticated
  with check (
    (owner_id is null or owner_id = auth.uid())
    and (organisation_id is null or public.is_org_member(organisation_id))
  );

drop policy if exists meetings_update on public.meetings;
create policy meetings_update on public.meetings
  for update to authenticated
  using (public.can_manage_meeting(id))
  with check (
    (owner_id = auth.uid() or public.is_org_admin(organisation_id))
    and (organisation_id is null or public.is_org_member(organisation_id))
  );

drop policy if exists meetings_delete on public.meetings;
create policy meetings_delete on public.meetings
  for delete to authenticated
  using (public.can_manage_meeting(id));
```

The child tables (`transcripts`, `speaker_turns`, `mom`, `jobs`, `system_events`,
`meeting_participants`) have **no `organisation_id` column** — they are reachable only
through `meeting_id`. They must key off the parent meeting:

```sql
alter table public.transcripts  enable row level security;
alter table public.speaker_turns enable row level security;
alter table public.mom         enable row level security;
alter table public.jobs        enable row level security;
alter table public.meeting_participants enable row level security;

drop policy if exists transcripts_select on public.transcripts;
create policy transcripts_select on public.transcripts
  for select to authenticated
  using (public.can_access_meeting(meeting_id));
-- (repeat select+insert+update+delete for speaker_turns, mom, jobs,
--  meeting_participants with the same meeting_id guard)

-- system_events holds infrastructure rows (meeting_id IS NULL, e.g. heartbeats).
-- Those must stay backend-only: no authenticated policy may cover them.
alter table public.system_events enable row level security;
drop policy if exists system_events_select on public.system_events;
create policy system_events_select on public.system_events
  for select to authenticated
  using (meeting_id is not null and public.can_access_meeting(meeting_id));
```

`organisation_settings`, `teams`, `team_members`, `integrations` are org-scoped and
already have policies in the repo file; confirm they were applied and that they call
the §4 functions.

### 3. Incorrect `anon` privileges

Even with RLS enabled, the anon role currently holds table grants. Revoke them
explicitly so a future `alter table ... disable row level security` cannot silently
re-open the corpus:

```sql
revoke all on public.meetings            from anon;
revoke all on public.transcripts         from anon;
revoke all on public.mom                 from anon;
revoke all on public.speaker_turns       from anon;
revoke all on public.jobs                from anon;
revoke all on public.system_events       from anon;
revoke all on public.meeting_participants from anon;
revoke all on public.profiles            from anon;
revoke all on public.organisations       from anon;
revoke all on public.organisation_members from anon;
revoke all on public.organisation_settings from anon;
revoke all on public.teams               from anon;
revoke all on public.team_members        from anon;
revoke all on public.integrations        from anon;
```

`anon` must also not be able to call `ensure_my_profile`, which it currently can
(verified: it executed and hit a NOT NULL violation).

### 4. Missing organisation RPCs — the frontend cannot work without these

Enumerated from the live OpenAPI document. **Present:** `is_org_member`,
`is_org_admin`, `is_org_owner`, `org_role_of`, `transfer_organisation_ownership`,
`ensure_my_profile`, and `can_view_meeting` (which is in **no** migration file).

**Missing but called by the frontend:**

| Function | Called from | Consequence today |
|---|---|---|
| `create_organisation` | `WorkspaceSwitcher.jsx` (`supabase.rpc('create_organisation')`) | creating an org returns PGRST202 |
| `invite_member` | `MembersAccessPanel.jsx` | inviting returns PGRST202 |
| `accept_invitation` | `WorkspaceSwitcher.jsx` | the pending-invite Accept button cannot work |
| `revoke_invitation` | `MembersAccessPanel.jsx` | cannot revoke |
| `update_member_role` | `MembersAccessPanel.jsx` | role change cannot work |
| `remove_member` | `MembersAccessPanel.jsx` | removing a member cannot work |

**Missing and required as the authorization foundation:**

| Function | Expected by |
|---|---|
| `can_access_meeting(uuid)` | every RLS policy in §2 |
| `can_manage_meeting(uuid)` | update/delete policies |
| `ensure_organisation_settings_row()` | migration 004's per-org settings trigger |
| `assign_orphan_meetings(text)` | meeting ownership backfill |
| `get_auth_user_id(text)` | worker bootstrap |

`20260925130002_workspace_functions.sql` defines the first two plus the org RPCs, but
it is **not applied**. Apply it (see §7) rather than re-authoring the SQL.

**Naming divergence to resolve:** the live DB has `can_view_meeting`, the repo has
`can_access_meeting`. Decide which is canonical, then align both. Right now the live
function is orphaned — nothing calls it, and the repo's policies cannot compile
without `can_access_meeting`.

### 5. Missing migration / schema objects

- `20260925130002_workspace_functions.sql` — not applied (see §4).
- `20260925130003_workspace_rls.sql` — not applied / ineffective.
- `get_storage_usage` — called by `library/page.jsx` before this repair; **no such
  function exists in any migration**. The library page has been changed to read
  `organisation_settings.storage_used_bytes` / `storage_quota_bytes` instead, so no
  function is required. If a per-workspace storage roll-up is wanted later, it must be
  authored and added to a migration.
- `profiles`, `system_events`, `meeting_participants`, `can_view_meeting`,
  `ensure_my_profile` exist in the live DB and in **no** migration file. They must be
  captured in a forward migration or the schema remains unreproducible.
- No migration creates a **storage bucket**, yet `supabase_client.py` builds a public
  recording URL. The bucket does not exist today (verified: bucket list is empty), so
  this is latent rather than active.

### 6. Live objects not represented in migrations

| Live object | Consequence |
|---|---|
| `can_view_meeting` | unreferenced by the repo; the repo's authorization story is therefore not the deployed one |
| `ensure_my_profile` | called on every page load by `workspace.jsx`, defined nowhere in the repo |
| `profiles` (5 cols) | RLS-policied in `20260925130003` but never created by any migration |
| `system_events` | policies assume it exists; no migration creates it |
| `transfer_organisation_ownership` | live; also in migration 002 |

**Action:** dump the live schema (`pg_dump --schema-only`) and commit the delta as a
new forward migration. Until then no engineer can reason about the schema and no
environment can be rebuilt.

### 7. Migration reconciliation required

1. **Remove the broken statement from `20260926120000_organisation_settings.sql`.**
   It ends with
   `grant usage, select on sequence public.organisation_settings_organisation_id_seq to authenticated;`
   but `organisation_settings.organisation_id` is a `uuid` primary key, so no such
   sequence exists. Replaying the file inside a transaction aborts the entire
   migration. The tables currently exist, so this statement either failed last or was
   tolerated — it must not survive into any replay.

2. **Add `testpaths = tests` to `pytest.ini`.** Bare `python -m pytest` from the repo
   root collects the gitignored `scratch/` directory and dies with collection errors.

3. **Apply order for a fresh database:** 001 → 002 → 003 → 004, each in its own
   transaction, with `SUPABASE_SERVICE_ROLE_KEY` provisioned so
   `tests/test_workspace_rls.py` runs rather than being environment-gated.

4. **Do not use `CREATE TABLE IF NOT EXISTS` to paper over divergence** in new
   migrations — it is why 001 and 004 silently skipped existing tables while later
   statements assumed success.

### 8. Required security verification queries

Run as an **authorised admin** after applying. Each must return the stated result.

```sql
-- 8.1 RLS enabled on every content table (expect one row per table, all true)
select relname, relrowsecurity
from pg_class
where relname in ('meetings','transcripts','mom','speaker_turns','jobs',
                  'system_events','meeting_participants','organisations',
                  'organisation_members','organisation_invitations',
                  'organisation_settings','teams','team_members',
                  'integrations','profiles')
order by relname;

-- 8.2 anon holds no table privileges (expect zero rows)
select table_name, privilege_type
from information_schema.role_table_grants
where grantee = 'anon'
  and table_schema = 'public';

-- 8.3 anon holds no function EXECUTE (expect zero rows)
select p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join pg_proc p2 on p2.oid = p.p
where n.nspname = 'public'
  and has_function_privilege('anon', p.oid, 'EXECUTE')
  and p.proname in ('create_organisation','invite_member','accept_invitation',
                    'revoke_invitation','update_member_role','remove_member',
                    'transfer_organisation_ownership','ensure_my_profile',
                    'is_org_admin','is_org_owner');

-- 8.4 the required functions exist (expect 11 rows)
select proname from pg_proc
join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
where nspname = 'public'
  and proname in ('can_access_meeting','can_manage_meeting','is_org_member',
                  'is_org_admin','is_org_owner','org_role_of','create_organisation',
                  'invite_member','accept_invitation','update_member_role',
                  'remove_member');

-- 8.5 recordings bucket is private (expect public = false)
select id, name, public from storage.buckets;
```

### 9. Required post-fix negative tests

Run `tests/test_workspace_rls.py` (it must no longer error) and then these
**anonymous-key** probes, which must all fail closed. Run them from a machine that
holds the anon key; none may write a row.

| # | Probe | Expected after fix |
|---|---|---|
| 1 | `GET /rest/v1/transcripts?select=*` | 401 / 403 / empty — never rows |
| 2 | `GET /rest/v1/mom?select=*` | 401 / 403 / empty |
| 3 | `GET /rest/v1/speaker_turns?select=*` | 401 / 403 / empty |
| 4 | `GET /rest/v1/meetings?select=*` | 401 / 403 / empty |
| 5 | `GET /rest/v1/organisation_members?select=*` | 401 / 403 / empty |
| 6 | `POST /rest/v1/rpc/create_organisation` | 401 / 403 — **must not create an org** |
| 7 | `POST /rest/v1/rpc/invite_member` | 401 / 403 |
| 8 | `POST /rest/v1/rpc/ensure_my_profile` | 401 / 403 |
| 9 | `POST /rest/v1/meetings` with `{"title":null}` | 401/403 **permission**, not a NOT NULL error (a NOT NULL error proves the grant still exists) |
| 10 | `POST /rest/v1/transcripts` with `{"meeting_id":null}` | 401/403 permission, not NOT NULL |
| 11 | authenticated **non-member** reads an org meeting | 0 rows |
| 12 | authenticated **member of org B** reads org A's meeting | 0 rows |
| 13 | member of org A updates org B's meeting | 0 rows updated |
| 14 | `GET /storage/v1/object/public/recordings/<file>` with no auth | 400/404 — never 200 |

### 10. Also outstanding (not security, but blocking a release)

- **Access Controls are unenforced.** `organisation_settings.meeting_data_access`,
  `export_downloads` and `org_settings_access` are written by the UI and read nowhere —
  not in `can_access_meeting`, not in any export path. Either implement the semantics
  inside the §4 functions, or remove the three controls. They currently look like a
  security control and are not one.
- **11 meeting-policy settings have no consumer.** `bot_name`, `join_delay_seconds`,
  `allowed_domains`, `blocked_keywords`, `recording_quality` etc. are persisted in
  `organisation_settings` (all 23 columns exist) but `src/worker.py` never reads the
  row. This is application-layer work and is being addressed separately; it needs no DDL.
- **No storage bucket exists**, so recorded audio cannot currently be stored at all.
  When one is created it must be **private**, with signed URLs from an authorised
  endpoint — never the public URL currently built in `supabase_client.py`.
- **Viewer role** does not exist. `organisation_members.role` needs a `viewer` value
  plus defined permissions before the UI may offer it.

---

**Until every item above is executed and every probe in §9 passes, this application
must not be described as secure, and cross-organisation data must be assumed reachable
by anyone who obtains the (public) anon key.**
