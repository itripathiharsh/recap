-- =============================================================================
-- Organisation settings + profile fields
--
-- Adds the columns and tables the Organisation Settings screen persists to.
-- The screen degrades gracefully without this migration: it reads the base
-- organisation row (which always exists) and treats these extended fields as
-- optional, so applying this is a separate, safe step.
--
-- REVIEW BEFORE APPLYING. Not exercised against a live database yet.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Organisation profile fields
-- -----------------------------------------------------------------------------
alter table public.organisations
  add column if not exists description text,
  add column if not exists website text,
  add column if not exists logo_url text,
  add column if not exists industry text,
  add column if not exists org_size text,
  add column if not exists timezone text,
  add column if not exists address text,
  add column if not exists contact_email text,
  add column if not exists contact_phone text;

comment on column public.organisations.description is 'Free-text summary shown on the organisation profile.';
comment on column public.organisations.website is 'Public website URL for the organisation.';
comment on column public.organisations.logo_url is 'Public URL of the uploaded organisation logo.';
comment on column public.organisations.industry is 'Selected industry label, e.g. Healthcare & Wellness.';
comment on column public.organisations.org_size is 'Selected headcount band, e.g. 1-10.';
comment on column public.organisations.timezone is 'IANA timezone with label, e.g. Asia/Kolkata (IST).';
comment on column public.organisations.address is 'Postal address shown on the organisation profile.';
comment on column public.organisations.contact_email is 'Public contact address for the organisation.';
comment on column public.organisations.contact_phone is 'Public contact phone for the organisation.';

-- -----------------------------------------------------------------------------
-- 2. Organisation-wide defaults + subscription snapshot
-- -----------------------------------------------------------------------------
-- `plan`, `member_limit`, `storage_*` are the fields a billing webhook would
-- write. They start null so the UI can show "unknown" rather than inventing a
-- tier or a byte count.
create table if not exists public.organisation_settings (
  organisation_id      uuid primary key references public.organisations (id) on delete cascade,
  auto_record_meetings boolean not null default true,
  auto_summaries       boolean not null default true,
  default_language     text not null default 'English',
  default_privacy      text not null default 'Team (Workspace)',
  meeting_data_access  text not null default 'All members',
  export_downloads     text not null default 'Admins only',
  org_settings_access  text not null default 'Admins only',
  plan                 text,
  member_limit         integer,
  storage_quota_bytes  bigint,
  storage_used_bytes   bigint,
  updated_at           timestamptz not null default now()
);

comment on table public.organisation_settings is
  'Per-organisation defaults that apply to every member, access-control policy, and a read-model of the subscription.';

comment on column public.organisation_settings.meeting_data_access is
  'Who may open meeting transcripts and summaries: All members | Own meetings | Admins only.';
comment on column public.organisation_settings.export_downloads is
  'Who may export or download transcripts: All members | Admins only.';
comment on column public.organisation_settings.org_settings_access is
  'Who may change organisation settings: All members | Admins only.';

alter table public.organisation_settings enable row level security;

-- Any active member may read the settings (the profile screen shows them).
create policy "organisation_settings_select" on public.organisation_settings
  for select to authenticated
  using (public.is_org_member(organisation_id));

-- Only owners/admins may change them.
create policy "organisation_settings_update" on public.organisation_settings
  for update to authenticated
  using (public.is_org_admin(organisation_id))
  with check (public.is_org_admin(organisation_id));

-- INSERT has no policy on purpose: the row is created by the trigger below so
-- the table can never be used to escalate anything.
create policy "organisation_settings_insert" on public.organisation_settings
  for insert to authenticated
  with check (public.is_org_admin(organisation_id));

-- Keep exactly one settings row per organisation, created with the org.
create or replace function public.touch_organisation_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.ensure_organisation_settings_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.organisation_settings (organisation_id)
  values (new.id)
  on conflict (organisation_id) do nothing;
  return new;
end;
$$;

drop trigger if exists organisations_ensure_settings on public.organisations;
create trigger organisations_ensure_settings
  after insert on public.organisations
  for each row execute function public.ensure_organisation_settings_row();

drop trigger if exists organisation_settings_touch on public.organisation_settings;
create trigger organisation_settings_touch
  before update on public.organisation_settings
  for each row execute function public.touch_organisation_settings_updated_at();

-- Backfill a row for every organisation that predates this migration.
insert into public.organisation_settings (organisation_id)
select id from public.organisations
on conflict (organisation_id) do nothing;

-- -----------------------------------------------------------------------------
-- 3. Teams
-- -----------------------------------------------------------------------------
-- Until this migration is applied the UI infers a team from meeting-title
-- keywords (see dashboard/src/lib/teams.mjs). These tables make teams real,
-- first-class records that members can be assigned to.
create table if not exists public.teams (
  id                    uuid primary key default gen_random_uuid(),
  organisation_id       uuid not null references public.organisations (id) on delete cascade,
  name                  text not null check (length(trim(name)) > 0),
  description           text,
  color                 text not null default '#0066FF',
  meeting_data_access   text not null default 'All members',
  library_access        text not null default 'All members',
  export_downloads      text not null default 'All members',
  created_at            timestamptz not null default now(),
  unique (organisation_id, name)
);

comment on table public.teams is
  'First-class teams within an organisation. Meetings may point at a team via meetings.team_id; when null the UI falls back to title-keyword inference.';

create table if not exists public.team_members (
  team_id        uuid not null references public.teams (id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (team_id, user_id)
);

create index if not exists team_members_org_idx on public.team_members (organisation_id);
create index if not exists teams_org_idx on public.teams (organisation_id);

-- Explicit meeting -> team link. Nullable on purpose: existing meetings stay
-- unassigned and keep using title inference until someone assigns them.
alter table public.meetings
  add column if not exists team_id uuid references public.teams (id) on delete set null;

create index if not exists meetings_team_idx on public.meetings (team_id);

alter table public.teams enable row level security;
alter table public.team_members enable row level security;

-- Any active member can read the team list and rosters (needed by pickers).
create policy "teams_select" on public.teams
  for select to authenticated
  using (public.is_org_member(organisation_id));

create policy "team_members_select" on public.team_members
  for select to authenticated
  using (public.is_org_member(organisation_id));

-- Admins/owners manage teams and their membership. Guard against escalation by
-- requiring the caller to already be an admin of the same organisation.
create policy "teams_insert" on public.teams
  for insert to authenticated
  with check (public.is_org_admin(organisation_id));

create policy "teams_update" on public.teams
  for update to authenticated
  using (public.is_org_admin(organisation_id))
  with check (public.is_org_admin(organisation_id));

create policy "teams_delete" on public.teams
  for delete to authenticated
  using (public.is_org_admin(organisation_id));

create policy "team_members_insert" on public.team_members
  for insert to authenticated
  with check (public.is_org_admin(organisation_id));

create policy "team_members_delete" on public.team_members
  for delete to authenticated
  using (public.is_org_admin(organisation_id));

grant select, insert, update, delete on public.teams to authenticated;
grant select, insert, delete on public.team_members to authenticated;

-- -----------------------------------------------------------------------------
-- 3b. Meeting settings
-- -----------------------------------------------------------------------------
-- Split out from the organisation_settings CREATE TABLE above so this file can be
-- applied incrementally: re-running is a no-op thanks to IF NOT EXISTS.
alter table public.organisation_settings
  add column if not exists recording_notification boolean not null default true,
  add column if not exists recording_quality     text    not null default 'High (1080p)',
  add column if not exists bot_name              text    not null default 'Recap Notetaker',
  add column if not exists join_delay_seconds    integer not null default 60,
  add column if not exists generate_transcripts  boolean not null default true,
  add column if not exists extract_action_items  boolean not null default true,
  add column if not exists detect_speakers       boolean not null default true,
  add column if not exists default_meeting_message text,
  add column if not exists allowed_domains       text[]  not null default '{}',
  add column if not exists blocked_keywords      text[]  not null default '{}';

comment on column public.organisation_settings.bot_name is
  'Name the recorder announces itself as when it joins a meeting.';
comment on column public.organisation_settings.join_delay_seconds is
  'Seconds to wait after a meeting starts before the bot joins.';
comment on column public.organisation_settings.allowed_domains is
  'If non-empty, only meetings whose domain is listed here may be recorded.';
comment on column public.organisation_settings.blocked_keywords is
  'Meeting links or keywords that must never be recorded.';

-- -----------------------------------------------------------------------------
-- 3c. Integrations
-- -----------------------------------------------------------------------------
-- Connection status per provider. Tokens are never stored here: each provider
-- keeps its own OAuth credentials and this table only records the link.
create table if not exists public.integrations (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  provider        text not null,
  status          text not null default 'disconnected'
                    check (status in ('connected', 'disconnected', 'error')),
  account_email   text,
  account_name    text,
  connected_at    timestamptz,
  config          jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organisation_id, provider)
);

comment on table public.integrations is
  'Third-party integration links for an organisation. No OAuth secrets are stored; provider tokens live in their own credential store.';

create index if not exists integrations_org_idx on public.integrations (organisation_id);

alter table public.integrations enable row level security;

create policy "integrations_select" on public.integrations
  for select to authenticated
  using (public.is_org_member(organisation_id));

create policy "integrations_insert" on public.integrations
  for insert to authenticated
  with check (public.is_org_admin(organisation_id));

create policy "integrations_update" on public.integrations
  for update to authenticated
  using (public.is_org_admin(organisation_id))
  with check (public.is_org_admin(organisation_id));

create policy "integrations_delete" on public.integrations
  for delete to authenticated
  using (public.is_org_admin(organisation_id));

grant select, insert, update, delete on public.integrations to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Transfer ownership
-- -----------------------------------------------------------------------------
-- Owner-only. Promotes the target to owner and demotes the previous owner to
-- admin so the organisation can never end up ownerless.
create or replace function public.transfer_organisation_ownership(
  p_organisation_id uuid,
  p_new_owner_email text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_id uuid;
begin
  if not public.is_org_owner(p_organisation_id) then
    raise exception 'Only the organisation owner can transfer ownership';
  end if;

  select user_id into v_target_id
  from public.organisation_members
  where organisation_id = p_organisation_id
    and status = 'active'
    and lower(email) = lower(p_new_owner_email);

  if v_target_id is null then
    raise exception 'No active member with that email in this organisation';
  end if;

  if v_target_id = (select owner_id from public.organisations where id = p_organisation_id) then
    raise exception 'That member already owns this organisation';
  end if;

  -- previous owner steps down to admin
  update public.organisation_members
  set role = 'admin'
  where organisation_id = p_organisation_id
    and role = 'owner';

  -- new owner is promoted
  update public.organisation_members
  set role = 'owner'
  where organisation_id = p_organisation_id
    and user_id = v_target_id;

  update public.organisations
  set owner_id = v_target_id, updated_at = now()
  where id = p_organisation_id;
end;
$$;

revoke all on function public.transfer_organisation_ownership(uuid, text) from public;
grant execute on function public.transfer_organisation_ownership(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Grants
-- -----------------------------------------------------------------------------
-- organisation_settings is keyed by a uuid primary key (organisation_id), not a
-- serial column, so there is no sequence to grant. The previous line
--   grant usage, select on sequence public.organisation_settings_organisation_id_seq
-- referenced a sequence that cannot exist and aborted this entire migration when
-- replayed inside a transaction.
grant select, update on public.organisation_settings to authenticated;


