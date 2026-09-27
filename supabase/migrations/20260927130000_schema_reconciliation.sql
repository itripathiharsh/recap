-- ===========================================================================
-- 20260927130000_schema_reconciliation.sql
--
-- Reconciles live database schema with version-controlled migrations:
-- 1. Explicitly defines tables `profiles` and `system_events` (using IF NOT EXISTS).
-- 2. Ensures triggers, constraints, and RLS policies on profiles, system_events,
--    and meeting_participants are version-controlled.
-- 3. Guarantees anon grants remain fully revoked and authenticated access intact.
-- ===========================================================================

begin;

-- 1. profiles table
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  name       text,
  avatar_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;

-- Profiles policies
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (true);

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

-- 2. system_events table
create table if not exists public.system_events (
  id         uuid primary key default gen_random_uuid(),
  meeting_id uuid references public.meetings (id) on delete set null,
  level      text not null default 'info' check (level in ('debug', 'info', 'warning', 'error', 'critical')),
  event_type text not null,
  message    text not null,
  metadata   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.system_events enable row level security;

-- 3. meeting_participants table (ensure idempotence)
create table if not exists public.meeting_participants (
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (meeting_id, user_id)
);

alter table public.meeting_participants enable row level security;

-- 4. Text-searchable generated columns on mom for PostgREST ILIKE filtering
alter table public.mom add column if not exists decisions_text text generated always as (decisions::text) stored;
alter table public.mom add column if not exists action_items_text text generated always as (action_items::text) stored;

-- 4. Revoke anon access from all three tables
revoke all on public.profiles from anon;
revoke all on public.system_events from anon;
revoke all on public.meeting_participants from anon;

grant select, insert, update on public.profiles to authenticated;
grant select, delete on public.system_events to authenticated;
grant select, insert, delete on public.meeting_participants to authenticated;
grant all on public.profiles to service_role;
grant all on public.system_events to service_role;
grant all on public.meeting_participants to service_role;

commit;
