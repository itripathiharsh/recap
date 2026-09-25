-- Row Level Security for workspace-aware access control.
-- Run AFTER 20260925130001_workspace_schema.sql and
-- 20260925130002_workspace_functions.sql.
--
-- PREREQUISITE: the Python backend must authenticate with
-- SUPABASE_SERVICE_ROLE_KEY (service role bypasses RLS) BEFORE this runs,
-- otherwise backend writes will be rejected.

begin;

-- ============================================================
-- Enable RLS everywhere
-- ============================================================
alter table public.organisations enable row level security;
alter table public.organisation_members enable row level security;
alter table public.organisation_invitations enable row level security;
alter table public.meeting_participants enable row level security;
alter table public.meetings enable row level security;
alter table public.jobs enable row level security;
alter table public.transcripts enable row level security;
alter table public.speaker_turns enable row level security;
alter table public.mom enable row level security;
alter table public.system_events enable row level security;
alter table public."User" enable row level security;

-- ============================================================
-- Drop any pre-existing policies on managed tables so no permissive
-- legacy policy can bypass these rules.
-- ============================================================
do $$
declare
  pol record;
begin
  for pol in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'organisations', 'organisation_members', 'organisation_invitations',
        'meeting_participants', 'meetings', 'jobs', 'transcripts',
        'speaker_turns', 'mom', 'system_events', 'User'
      )
  loop
    execute format('drop policy %I on public.%I', pol.policyname, pol.tablename);
  end loop;
end $$;

-- ============================================================
-- Explicit grants (RLS is the gatekeeper, not grants)
-- ============================================================
grant select, insert, update, delete
  on public.organisations, public.organisation_members,
     public.organisation_invitations, public.meeting_participants,
     public.meetings, public.jobs, public.transcripts,
     public.speaker_turns, public.mom, public.system_events, public."User"
  to authenticated;

-- ============================================================
-- organisations
-- Members see their organisations; a user with a pending
-- invitation may also read that one organisation row so the
-- invitation inbox can show the organisation name.
-- ============================================================
create policy "organisations_select" on public.organisations
  for select to authenticated
  using (
    public.is_org_member(id)
    or exists (
      select 1
      from public.organisation_invitations i
      where i.organisation_id = id
        and i.status = 'pending'
        and lower(i.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

-- INSERT has no policy => organisation creation is RPC-only
-- (create_organisation guarantees the owner membership row exists).

create policy "organisations_update" on public.organisations
  for update to authenticated
  using (public.is_org_owner(id))
  with check (public.is_org_owner(id));

create policy "organisations_delete" on public.organisations
  for delete to authenticated
  using (public.is_org_owner(id));

-- ============================================================
-- organisation_members
-- Any active member of an organisation can read its roster (needed for
-- owner/member columns and avatars); members of other organisations see
-- nothing. INSERT/UPDATE/DELETE have NO policies => RPC-only
-- (prevents role escalation).
-- ============================================================
create policy "organisation_members_select" on public.organisation_members
  for select to authenticated
  using (public.is_org_member(organisation_id));

-- ============================================================
-- organisation_invitations
-- Admins manage theirs; invitees may read their own pending invite by email.
-- Mutations are RPC-only (invite_member / accept_invitation).
-- ============================================================
create policy "organisation_invitations_select" on public.organisation_invitations
  for select to authenticated
  using (
    public.is_org_admin(organisation_id)
    or (
      status = 'pending'
      and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

-- ============================================================
-- meeting_participants
-- Visible to anyone who can see the meeting; managed by the meeting owner.
-- ============================================================
create policy "meeting_participants_select" on public.meeting_participants
  for select to authenticated
  using (public.can_access_meeting(meeting_id));

create policy "meeting_participants_insert" on public.meeting_participants
  for insert to authenticated
  with check (public.can_manage_meeting(meeting_id));

create policy "meeting_participants_delete" on public.meeting_participants
  for delete to authenticated
  using (public.can_manage_meeting(meeting_id));

-- ============================================================
-- meetings
-- ============================================================
create policy "meetings_select" on public.meetings
  for select to authenticated
  using (public.can_access_meeting(id));

create policy "meetings_insert" on public.meetings
  for insert to authenticated
  with check (
    (owner_id is null or owner_id = auth.uid())
    and (organisation_id is null or public.is_org_member(organisation_id))
  );

create policy "meetings_update" on public.meetings
  for update to authenticated
  using (public.can_manage_meeting(id))
  with check (
    (owner_id = auth.uid() or public.is_org_admin(organisation_id))
    and (organisation_id is null or public.is_org_member(organisation_id))
  );

create policy "meetings_delete" on public.meetings
  for delete to authenticated
  using (public.can_manage_meeting(id));

-- ============================================================
-- Child tables: read = meeting access, write = meeting management.
-- The Python backend writes as service role (bypasses RLS).
-- ============================================================
create policy "jobs_select" on public.jobs
  for select to authenticated
  using (public.can_access_meeting(meeting_id));
create policy "jobs_insert" on public.jobs
  for insert to authenticated
  with check (public.can_manage_meeting(meeting_id));
create policy "jobs_update" on public.jobs
  for update to authenticated
  using (public.can_manage_meeting(meeting_id))
  with check (public.can_manage_meeting(meeting_id));
create policy "jobs_delete" on public.jobs
  for delete to authenticated
  using (public.can_manage_meeting(meeting_id));

create policy "transcripts_select" on public.transcripts
  for select to authenticated
  using (public.can_access_meeting(meeting_id));
create policy "transcripts_insert" on public.transcripts
  for insert to authenticated
  with check (public.can_manage_meeting(meeting_id));
create policy "transcripts_update" on public.transcripts
  for update to authenticated
  using (public.can_manage_meeting(meeting_id))
  with check (public.can_manage_meeting(meeting_id));
create policy "transcripts_delete" on public.transcripts
  for delete to authenticated
  using (public.can_manage_meeting(meeting_id));

create policy "speaker_turns_select" on public.speaker_turns
  for select to authenticated
  using (public.can_access_meeting(meeting_id));
create policy "speaker_turns_insert" on public.speaker_turns
  for insert to authenticated
  with check (public.can_manage_meeting(meeting_id));
create policy "speaker_turns_update" on public.speaker_turns
  for update to authenticated
  using (public.can_manage_meeting(meeting_id))
  with check (public.can_manage_meeting(meeting_id));
create policy "speaker_turns_delete" on public.speaker_turns
  for delete to authenticated
  using (public.can_manage_meeting(meeting_id));

create policy "mom_select" on public.mom
  for select to authenticated
  using (public.can_access_meeting(meeting_id));
create policy "mom_insert" on public.mom
  for insert to authenticated
  with check (public.can_manage_meeting(meeting_id));
create policy "mom_update" on public.mom
  for update to authenticated
  using (public.can_manage_meeting(meeting_id))
  with check (public.can_manage_meeting(meeting_id));
create policy "mom_delete" on public.mom
  for delete to authenticated
  using (public.can_manage_meeting(meeting_id));

-- Infrastructure events (meeting_id IS NULL, e.g. heartbeats) are backend-only:
-- no authenticated policy covers them, so only the service role reads/writes them.
create policy "system_events_select" on public.system_events
  for select to authenticated
  using (meeting_id is not null and public.can_access_meeting(meeting_id));
create policy "system_events_insert" on public.system_events
  for insert to authenticated
  with check (meeting_id is not null and public.can_manage_meeting(meeting_id));
create policy "system_events_update" on public.system_events
  for update to authenticated
  using (meeting_id is not null and public.can_manage_meeting(meeting_id))
  with check (meeting_id is not null and public.can_manage_meeting(meeting_id));
create policy "system_events_delete" on public.system_events
  for delete to authenticated
  using (meeting_id is not null and public.can_manage_meeting(meeting_id));

-- ============================================================
-- public."User" profile table: strictly self-only.
-- ============================================================
create policy "user_select_self" on public."User"
  for select to authenticated
  using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

create policy "user_insert_self" on public."User"
  for insert to authenticated
  with check (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

create policy "user_update_self" on public."User"
  for update to authenticated
  using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')))
  with check (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

commit;
