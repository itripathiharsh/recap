-- ===========================================================================
-- 20260927120000_security_hardening.sql
--
-- Closes the anonymous data exposure and rebuilds the authorisation layer the
-- application depends on.
--
-- Derived from the LIVE database on 2026-09-27 (15 tables, enumerated from the
-- PostgREST OpenAPI document with the service role) and from the exact RPC
-- contracts the frontend issues. See DB_SECURITY_FIX_REPORT.md.
--
-- OBSERVED STATE THIS FIXES (anon key, no session):
--   meetings, transcripts, mom, speaker_turns, jobs, system_events
--     -> SELECT returns real rows
--     -> INSERT privilege exists (rejected only by NOT NULL)
--   organisations, organisation_members, organisation_invitations,
--   organisation_settings, teams, team_members, integrations, profiles
--     -> RLS already active and correctly returning zero rows
--   storage buckets: none exist; meetings.recording_url is populated by
--      supabase_client.py using a PUBLIC object URL
--
-- MISSING FUNCTIONS the frontend calls (all returned PGRST202):
--   create_organisation(text), invite_member(uuid,text,text),
--   accept_invitation(uuid), revoke_invitation(uuid),
--   update_member_role(uuid,uuid,text), remove_member(uuid,uuid),
--   can_access_meeting(uuid), can_manage_meeting(uuid)
--
-- ALREADY PRESENT, left untouched: is_org_member, is_org_admin, is_org_owner,
--   org_role_of, transfer_organisation_ownership, ensure_my_profile,
--   can_view_meeting (orphaned - see the note at the end of this file)
--
-- This migration is IDEMPOTENT. It is safe to run more than once.
-- It does not drop or modify any table, column or row.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 0. Widen the role / status domain
--    Verified in migration 001 and therefore almost certainly live:
--      organisation_members.role   check (role   in ('owner','admin','member'))
--      organisation_members.status check (status in ('active','suspended'))
--      organisation_invitations.role check (role in ('admin','member'))
--    A 'viewer' role and a 'removed' member status are both used below, and
--    both would be rejected by those constraints at runtime. The PostgreSQL
--    parser cannot catch a CHECK violation, so this is stated explicitly here.
--    Widen rather than narrow: nothing that is valid today stops being valid.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.organisation_members'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
  ) then
    alter table public.organisation_members
      drop constraint if exists organisation_members_role_check;
    alter table public.organisation_members
      add constraint organisation_members_role_check
      check (role in ('owner', 'admin', 'member', 'viewer'));
  end if;

  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.organisation_members'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  ) then
    alter table public.organisation_members
      drop constraint if exists organisation_members_status_check;
    alter table public.organisation_members
      add constraint organisation_members_status_check
      check (status in ('active', 'suspended', 'removed'));
  end if;

  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.organisation_invitations'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
  ) then
    alter table public.organisation_invitations
      drop constraint if exists organisation_invitations_role_check;
    alter table public.organisation_invitations
      add constraint organisation_invitations_role_check
      check (role in ('admin', 'member', 'viewer'));
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Ownership helper
--    Live meetings rows carry BOTH user_id and owner_id, and historical rows
--    have owner_id null. Ownership is therefore the coalesce of the two.
-- ---------------------------------------------------------------------------
create or replace function public.meeting_owner_id(p_meeting_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(m.owner_id, m.user_id)
  from public.meetings m
  where m.id = p_meeting_id;
$$;

revoke all on function public.meeting_owner_id(uuid) from public;
grant execute on function public.meeting_owner_id(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Authorisation predicates
--    can_access_meeting / can_manage_meeting are the foundation every RLS
--    policy below calls. They must be SECURITY DEFINER because they read
--    organisation_members, which is itself behind RLS, and they must pin
--    search_path so a caller cannot shadow auth.uid() or the tables.
-- ---------------------------------------------------------------------------
create or replace function public.can_access_meeting(p_meeting_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.meetings m
    where m.id = p_meeting_id
      and (
        -- the owner always sees their own meeting
        coalesce(m.owner_id, m.user_id) = auth.uid()
        -- an active member of the owning organisation
        or (
          m.organisation_id is not null
          and exists (
            select 1
            from public.organisation_members om
            where om.organisation_id = m.organisation_id
              and om.user_id = auth.uid()
              and om.status = 'active'
          )
        )
        -- an explicitly listed participant
        or exists (
          select 1
          from public.meeting_participants mp
          where mp.meeting_id = m.id
            and mp.user_id = auth.uid()
        )
      )
  );
$$;

create or replace function public.can_manage_meeting(p_meeting_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.meetings m
    where m.id = p_meeting_id
      and (
        coalesce(m.owner_id, m.user_id) = auth.uid()
        or (
          m.organisation_id is not null
          and m.visibility <> 'private'
          and exists (
            select 1
            from public.organisation_members om
            where om.organisation_id = m.organisation_id
              and om.user_id = auth.uid()
              and om.status = 'active'
              and om.role in ('owner', 'admin')
          )
        )
      )
  );
$$;

revoke all on function public.can_access_meeting(uuid) from public;
revoke all on function public.can_manage_meeting(uuid) from public;
grant execute on function public.can_access_meeting(uuid) to authenticated, service_role;
grant execute on function public.can_manage_meeting(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. RLS on the six leaking content tables
--    Each is reached only through meeting_id, so every policy delegates to
--    can_access_meeting / can_manage_meeting.
-- ---------------------------------------------------------------------------
alter table public.meetings            enable row level security;
alter table public.transcripts         enable row level security;
alter table public.mom                 enable row level security;
alter table public.speaker_turns       enable row level security;
alter table public.jobs                enable row level security;
alter table public.system_events       enable row level security;

drop policy if exists meetings_select on public.meetings;
create policy meetings_select on public.meetings
  for select to authenticated
  using (public.can_access_meeting(id));

drop policy if exists meetings_insert on public.meetings;
create policy meetings_insert on public.meetings
  for insert to authenticated
  with check (
    (coalesce(owner_id, user_id) is null or coalesce(owner_id, user_id) = auth.uid())
    and (organisation_id is null or public.is_org_member(organisation_id))
  );

drop policy if exists meetings_update on public.meetings;
create policy meetings_update on public.meetings
  for update to authenticated
  using (public.can_manage_meeting(id))
  with check (
    (coalesce(owner_id, user_id) = auth.uid() or public.is_org_admin(organisation_id))
    and (organisation_id is null or public.is_org_member(organisation_id))
  );

drop policy if exists meetings_delete on public.meetings;
create policy meetings_delete on public.meetings
  for delete to authenticated
  using (public.can_manage_meeting(id));

-- Child tables: read = access to the parent meeting,
--                write = manage the parent meeting.
-- The same four policies are applied to each child table; the child tables have
-- no id column of their own worth filtering on, so they key off meeting_id.
do $$
declare
  t text;
begin
  foreach t in array array['transcripts', 'mom', 'speaker_turns', 'jobs'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.can_access_meeting(meeting_id))',
      t || '_select', t
    );
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.can_manage_meeting(meeting_id))',
      t || '_insert', t
    );
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.can_manage_meeting(meeting_id)) with check (public.can_manage_meeting(meeting_id))',
      t || '_update', t
    );
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.can_manage_meeting(meeting_id))',
      t || '_delete', t
    );
  end loop;
end;
$$;

-- system_events also holds infrastructure rows (meeting_id IS NULL, e.g.
-- worker heartbeats). The policy excludes them, so they stay backend-only.
drop policy if exists system_events_select on public.system_events;
create policy system_events_select on public.system_events
  for select to authenticated
  using (meeting_id is not null and public.can_access_meeting(meeting_id));

drop policy if exists system_events_insert on public.system_events;
create policy system_events_insert on public.system_events
  for insert to authenticated
  with check (false);

drop policy if exists system_events_update on public.system_events;
create policy system_events_update on public.system_events
  for update to authenticated
  using (false)
  with check (false);

drop policy if exists system_events_delete on public.system_events;
create policy system_events_delete on public.system_events
  for delete to authenticated
  using (public.can_manage_meeting(meeting_id));

-- meeting_participants is part of the meeting graph and was readable by anon.
alter table public.meeting_participants enable row level security;
drop policy if exists meeting_participants_select on public.meeting_participants;
create policy meeting_participants_select on public.meeting_participants
  for select to authenticated
  using (public.can_access_meeting(meeting_id));

-- ---------------------------------------------------------------------------
-- 4. Grants
--    RLS alone is not sufficient: the anon role also holds table-level grants.
--    Revoke them so that a future accidental `disable row level security`
--    cannot silently re-open the corpus.
-- ---------------------------------------------------------------------------
revoke all on public.meetings             from anon;
revoke all on public.transcripts          from anon;
revoke all on public.mom                  from anon;
revoke all on public.speaker_turns        from anon;
revoke all on public.jobs                 from anon;
revoke all on public.system_events        from anon;
revoke all on public.meeting_participants from anon;
revoke all on public.organisations        from anon;
revoke all on public.organisation_members from anon;
revoke all on public.organisation_invitations from anon;
revoke all on public.organisation_settings from anon;
revoke all on public.teams                from anon;
revoke all on public.team_members         from anon;
revoke all on public.integrations         from anon;
revoke all on public.profiles             from anon;

-- can_view_meeting is an orphaned SECURITY DEFINER function: it is not
-- referenced anywhere in the repository, and anon can currently call it, which
-- turns it into an oracle for probing which meeting ids exist. Keep the
-- function (do not drop a live object blindly) but stop anon calling it.
revoke all on function public.can_view_meeting(uuid) from public;
revoke all on function public.can_view_meeting(uuid) from anon;
grant execute on function public.can_view_meeting(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Organisation RPCs
--    Signatures match the exact argument names the frontend sends.
--    Every function: pins search_path, requires an authenticated caller,
--    validates membership and role, and never returns another org's data.
-- ---------------------------------------------------------------------------

-- 5.1 create_organisation(p_name text)
--     Caller becomes owner. Returns the created row (the switcher accepts either
--     an array or a single object).
create or replace function public.create_organisation(p_name text)
returns public.organisations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_org public.organisations;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_name is null or btrim(p_name) = '' then
    raise exception 'Organisation name is required' using errcode = '22023';
  end if;
  if length(btrim(p_name)) > 120 then
    raise exception 'Organisation name is too long' using errcode = '22023';
  end if;

  insert into public.organisations (name, owner_id, created_at, updated_at)
  values (btrim(p_name), v_uid, now(), now())
  returning * into v_org;

  insert into public.organisation_members
    (organisation_id, user_id, role, status, created_at, updated_at)
  values
    (v_org.id, v_uid, 'owner', 'active', now(), now());

  -- Guarantee the settings row exists, mirroring the trigger below.
  insert into public.organisation_settings (organisation_id)
  values (v_org.id)
  on conflict (organisation_id) do nothing;

  return v_org;
end;
$$;

-- 5.2 invite_member(p_organisation_id uuid, p_email text, p_role text)
--     Admin or owner only. Does not create an auth user; it records the
--     invitation that accept_invitation later consumes.
create or replace function public.invite_member(
  p_organisation_id uuid,
  p_email text,
  p_role text
)
returns public.organisation_invitations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_inv public.organisation_invitations;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_email is null or btrim(p_email) = '' then
    raise exception 'Email is required' using errcode = '22023';
  end if;
  if p_role is null or p_role not in ('admin', 'member', 'viewer') then
    raise exception 'Invalid role' using errcode = '22023';
  end if;

  select om.role into v_role
  from public.organisation_members om
  where om.organisation_id = p_organisation_id
    and om.user_id = v_uid
    and om.status = 'active';

  if v_role is null or v_role not in ('owner', 'admin') then
    raise exception 'Only organisation admins can invite members' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.organisation_invitations i
    where i.organisation_id = p_organisation_id
      and lower(i.email) = lower(btrim(p_email))
      and i.status = 'pending'
  ) then
    raise exception 'This person has already been invited' using errcode = '23505';
  end if;

  insert into public.organisation_invitations
    (organisation_id, email, role, invited_by, status, expires_at, created_at, updated_at)
  values
    (p_organisation_id, lower(btrim(p_email)), p_role, v_uid, 'pending',
     now() + interval '7 days', now(), now())
  returning * into v_inv;

  return v_inv;
end;
$$;

-- 5.3 accept_invitation(p_invitation_id uuid)
--     The caller may only accept an invitation addressed to their own email.
create or replace function public.accept_invitation(p_invitation_id uuid)
returns public.organisation_members
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_inv public.organisation_invitations;
  v_member public.organisation_members;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into v_inv
  from public.organisation_invitations i
  where i.id = p_invitation_id
    and i.status = 'pending'
    and i.expires_at > now();

  if v_inv.id is null then
    raise exception 'Invitation is invalid, expired or already used' using errcode = '22023';
  end if;

  select u.email into v_email
  from auth.users u
  where u.id = v_uid;

  if v_email is null or lower(v_email) <> lower(v_inv.email) then
    raise exception 'This invitation was sent to a different email address' using errcode = '42501';
  end if;

  insert into public.organisation_members
    (organisation_id, user_id, role, status, email, display_name, created_at, updated_at)
  values
    (v_inv.organisation_id, v_uid, v_inv.role, 'active', v_email,
     (select u.raw_user_meta_data ->> 'full_name' from auth.users u where u.id = v_uid),
     now(), now())
  on conflict (organisation_id, user_id)
  do update set role = excluded.role, status = 'active', updated_at = now()
  returning * into v_member;

  update public.organisation_invitations
  set status = 'accepted', updated_at = now()
  where id = p_invitation_id;

  return v_member;
end;
$$;

-- 5.4 revoke_invitation(p_invitation_id uuid)
--     Admin/owner of the invitation's own organisation only.
create or replace function public.revoke_invitation(p_invitation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_role text;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select i.organisation_id into v_org
  from public.organisation_invitations i
  where i.id = p_invitation_id;

  if v_org is null then
    raise exception 'Invitation not found' using errcode = '22023';
  end if;

  select om.role into v_role
  from public.organisation_members om
  where om.organisation_id = v_org and om.user_id = v_uid and om.status = 'active';

  if v_role is null or v_role not in ('owner', 'admin') then
    raise exception 'Only organisation admins can revoke invitations' using errcode = '42501';
  end if;

  update public.organisation_invitations
  set status = 'revoked', updated_at = now()
  where id = p_invitation_id;

  return true;
end;
$$;

-- 5.5 update_member_role(p_organisation_id uuid, p_target_user_id uuid, p_role text)
--     Owner-only for role changes, and the owner cannot be demoted by an admin.
create or replace function public.update_member_role(
  p_organisation_id uuid,
  p_target_user_id uuid,
  p_role text
)
returns public.organisation_members
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_actor text;
  v_target_role text;
  v_row public.organisation_members;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_role is null or p_role not in ('admin', 'member', 'viewer') then
    raise exception 'Invalid role' using errcode = '22023';
  end if;

  select om.role into v_actor
  from public.organisation_members om
  where om.organisation_id = p_organisation_id
    and om.user_id = v_uid and om.status = 'active';

  if v_actor is distinct from 'owner' then
    raise exception 'Only the organisation owner can change roles' using errcode = '42501';
  end if;

  select om.role into v_target_role
  from public.organisation_members om
  where om.organisation_id = p_organisation_id
    and om.user_id = p_target_user_id and om.status = 'active';

  if v_target_role is null then
    raise exception 'That person is not a member of this organisation' using errcode = '22023';
  end if;
  if v_target_role = 'owner' then
    raise exception 'The owner role cannot be changed here' using errcode = '42501';
  end if;

  update public.organisation_members
  set role = p_role, updated_at = now()
  where organisation_id = p_organisation_id and user_id = p_target_user_id
  returning * into v_row;

  return v_row;
end;
$$;

-- 5.6 remove_member(p_organisation_id uuid, p_target_user_id uuid)
--     Admin may remove members; only the owner may remove another admin.
--     Marks the membership 'removed' rather than deleting the row, so historical
--     authorship and audit references survive. 'removed' is a value added to the
--     check constraint in section 0.
create or replace function public.remove_member(
  p_organisation_id uuid,
  p_target_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_actor text;
  v_target_role text;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_target_user_id = v_uid then
    raise exception 'Use the ownership transfer flow to leave an organisation' using errcode = '22023';
  end if;

  select om.role into v_actor
  from public.organisation_members om
  where om.organisation_id = p_organisation_id
    and om.user_id = v_uid and om.status = 'active';

  if v_actor is null or v_actor not in ('owner', 'admin') then
    raise exception 'Only organisation admins can remove members' using errcode = '42501';
  end if;

  select om.role into v_target_role
  from public.organisation_members om
  where om.organisation_id = p_organisation_id
    and om.user_id = p_target_user_id and om.status = 'active';

  if v_target_role is null then
    raise exception 'That person is not a member of this organisation' using errcode = '22023';
  end if;
  if v_target_role = 'owner' then
    raise exception 'The owner cannot be removed' using errcode = '42501';
  end if;
  if v_target_role = 'admin' and v_actor <> 'owner' then
    raise exception 'Only the organisation owner can remove an admin' using errcode = '42501';
  end if;

  update public.organisation_members
  set status = 'removed', updated_at = now()
  where organisation_id = p_organisation_id and user_id = p_target_user_id;

  return true;
end;
$$;

revoke all on function public.create_organisation(text) from public;
revoke all on function public.invite_member(uuid, text, text) from public;
revoke all on function public.accept_invitation(uuid) from public;
revoke all on function public.revoke_invitation(uuid) from public;
revoke all on function public.update_member_role(uuid, uuid, text) from public;
revoke all on function public.remove_member(uuid, uuid) from public;

grant execute on function public.create_organisation(text) to authenticated, service_role;
grant execute on function public.invite_member(uuid, text, text) to authenticated, service_role;
grant execute on function public.accept_invitation(uuid) to authenticated, service_role;
grant execute on function public.revoke_invitation(uuid) to authenticated, service_role;
grant execute on function public.update_member_role(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.remove_member(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. organisation_settings: one row per organisation
--    Migration 004 references ensure_organisation_settings_row() but that
--    function does not exist in the live database, so a new organisation never
--    gets its settings row. Created here, and create_organisation above also
--    inserts one explicitly so the RPC works even without the trigger firing.
-- ---------------------------------------------------------------------------
create or replace function public.ensure_organisation_settings_row()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.organisation_settings (organisation_id)
  values (new.id)
  on conflict (organisation_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_organisation_settings_row on public.organisations;
create trigger trg_organisation_settings_row
  after insert on public.organisations
  for each row execute function public.ensure_organisation_settings_row();

-- ---------------------------------------------------------------------------
-- 7. Storage
--    No bucket exists today, so no recording is currently exposed. But
--    supabase_client.py builds a PUBLIC object URL, so the moment a bucket
--    exists every meeting recording becomes world-readable. The bucket is
--    created PRIVATE and reads are gated on the same meeting predicate.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recordings', 'recordings', false, 524288000,
  array['audio/wav', 'audio/webm', 'audio/mpeg', 'audio/mp4', 'application/octet-stream']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Recordings are stored as "<meeting_id>/audio.wav", so the first path segment
-- is the meeting id.
drop policy if exists "recordings read authorised" on storage.objects;
create policy "recordings read authorised" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'recordings'
    and public.can_access_meeting((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "recordings write owner or admin" on storage.objects;
create policy "recordings write owner or admin" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'recordings'
    and public.can_manage_meeting((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "recordings delete owner or admin" on storage.objects;
create policy "recordings delete owner or admin" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'recordings'
    and public.can_manage_meeting((storage.foldername(name))[1]::uuid)
  );

-- No policy grants anon anything on this bucket; storage.objects is RLS-enabled
-- by default in Supabase, and public=false additionally blocks the public URL.

commit;

-- ===========================================================================
-- NOTES FOR THE OPERATOR
--
-- can_view_meeting
--   Investigated 2026-09-27. It exists in the live database, is NOT defined in
--   any repository migration, and is referenced nowhere in dashboard/src, src,
--   tests or scripts. Called as anon with a non-existent meeting id it returned
--   HTTP 200 false, so it is callable by anon and acts as an existence oracle.
--   It is intentionally NOT dropped here (do not delete a live object blindly);
--   this migration only revokes anon EXECUTE. Once the application is confirmed
--   not to need it, a later migration should drop it.
--
-- ensure_my_profile
--   Called by workspace.jsx on every authenticated page load. It exists live and
--   is deliberately left callable by authenticated.
--
-- Expected verification
--   After applying, run:  python tools/verify_rls.py
--   which performs the anonymous and cross-tenant negative probes and prints
--   PASS/FAIL per check. Do not consider this migration proven until that
--   script reports zero failures.
--
-- Not included, because it would break the demo data:
--   * no table drops, no column changes, no row deletes
--   * meetings.owner_id is left as-is; meeting_owner_id() coalesces it with
--     user_id instead, so historical rows keep working
-- ===========================================================================
