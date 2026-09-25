-- Workspace schema: organisations, members, invitations, meeting ownership.
-- Run this FIRST, then 20260925130002_workspace_functions.sql,
-- then 20260925130003_workspace_rls.sql.
-- All statements are idempotent (safe to re-run).

begin;

-- ============================================================
-- Organisations
-- ============================================================
create table if not exists public.organisations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(trim(name)) > 0),
  owner_id   uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- Organisation members
-- ============================================================
create table if not exists public.organisation_members (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  role            text not null default 'member' check (role in ('owner', 'admin', 'member')),
  status          text not null default 'active' check (status in ('active', 'suspended')),
  -- Denormalised profile so the roster is displayable without exposing auth.users.
  email           text,
  display_name    text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organisation_id, user_id)
);

-- ============================================================
-- Organisation invitations
-- ============================================================
create table if not exists public.organisation_invitations (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  email           text not null,
  role            text not null default 'member' check (role in ('admin', 'member')),
  invited_by      uuid references auth.users (id) on delete set null,
  status          text not null default 'pending'
                  check (status in ('pending', 'accepted', 'expired', 'revoked')),
  expires_at      timestamptz not null default now() + interval '7 days',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ============================================================
-- Meeting-level explicit participants (user-id based sharing)
-- ============================================================
create table if not exists public.meeting_participants (
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (meeting_id, user_id)
);

-- ============================================================
-- Meetings: ownership / workspace columns
-- (existing production rows are preserved; columns are additive)
-- ============================================================
alter table public.meetings
  add column if not exists owner_id uuid references auth.users (id) on delete set null;

alter table public.meetings
  add column if not exists organisation_id uuid references public.organisations (id) on delete set null;

alter table public.meetings
  add column if not exists workspace_type text not null default 'individual';

alter table public.meetings
  add column if not exists visibility text not null default 'private';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'meetings_workspace_type_check') then
    alter table public.meetings
      add constraint meetings_workspace_type_check
      check (workspace_type in ('individual', 'organisation'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'meetings_visibility_check') then
    alter table public.meetings
      add constraint meetings_visibility_check
      check (visibility in ('private', 'participants', 'organisation', 'admin'));
  end if;
end $$;

-- ============================================================
-- Normalisation trigger: keeps owner_id / user_id / workspace_type coherent.
-- Runs as SECURITY DEFINER so ownership is stamped even for backend inserts.
-- ============================================================
create or replace function public.meetings_normalize_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_id is null then
    new.owner_id := coalesce(auth.uid(), new.user_id);
  end if;
  if new.user_id is null and new.owner_id is not null then
    new.user_id := new.owner_id;
  end if;
  if new.organisation_id is not null then
    new.workspace_type := 'organisation';
  else
    new.organisation_id := null;
    new.workspace_type := 'individual';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_meetings_normalize_workspace on public.meetings;
create trigger trg_meetings_normalize_workspace
  before insert or update on public.meetings
  for each row execute function public.meetings_normalize_workspace();

-- ============================================================
-- updated_at maintenance for organisation tables
-- ============================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_organisations_updated_at on public.organisations;
create trigger trg_organisations_updated_at
  before update on public.organisations
  for each row execute function public.set_updated_at();

drop trigger if exists trg_organisation_members_updated_at on public.organisation_members;
create trigger trg_organisation_members_updated_at
  before update on public.organisation_members
  for each row execute function public.set_updated_at();

drop trigger if exists trg_organisation_invitations_updated_at on public.organisation_invitations;
create trigger trg_organisation_invitations_updated_at
  before update on public.organisation_invitations
  for each row execute function public.set_updated_at();

-- ============================================================
-- Indexes
-- ============================================================
create index if not exists idx_organisations_owner on public.organisations (owner_id);
create index if not exists idx_org_members_org on public.organisation_members (organisation_id);
create index if not exists idx_org_members_user on public.organisation_members (user_id);
create index if not exists idx_org_members_email on public.organisation_members (lower(email));
create index if not exists idx_org_invitations_email on public.organisation_invitations (lower(email), status);
create index if not exists idx_org_invitations_org on public.organisation_invitations (organisation_id, status);
create index if not exists idx_meeting_participants_user on public.meeting_participants (user_id);
create index if not exists idx_meetings_owner on public.meetings (owner_id);
create index if not exists idx_meetings_organisation on public.meetings (organisation_id);

commit;
