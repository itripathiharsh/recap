-- Workspace helper functions and RPCs.
-- All functions are SECURITY DEFINER: they bypass RLS by design and therefore
-- re-check authorization internally. They never trust caller-supplied identity.

begin;

-- ============================================================
-- Role helpers (definer => no RLS recursion on organisation_members)
-- ============================================================
create or replace function public.org_role_of(p_organisation_id uuid, p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select m.role
  from public.organisation_members m
  where m.organisation_id = p_organisation_id
    and m.user_id = p_user_id
    and m.status = 'active';
$$;

create or replace function public.is_org_member(p_organisation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organisation_members m
    where m.organisation_id = p_organisation_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

create or replace function public.is_org_admin(p_organisation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organisation_members m
    where m.organisation_id = p_organisation_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role in ('owner', 'admin')
  );
$$;

create or replace function public.is_org_owner(p_organisation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organisation_members m
    where m.organisation_id = p_organisation_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role = 'owner'
  );
$$;

-- ============================================================
-- Meeting access helpers (single source of truth for RLS)
--
-- Visibility semantics (spec):
--   private       -> owner + explicitly shared users
--   participants  -> owner + meeting_participants rows
--   organisation  -> active members of the meeting's organisation
--   admin         -> owner/admin of the meeting's organisation
-- A meeting_participants row (explicit share) always grants access.
-- ============================================================
create or replace function public.can_access_meeting(p_meeting_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.meetings m
    where m.id = p_meeting_id
      and (
        -- Owner always sees their meeting
        m.owner_id = auth.uid()
        -- Explicit share / participant access (any visibility level)
        or exists (
          select 1
          from public.meeting_participants mp
          where mp.meeting_id = m.id
            and mp.user_id = auth.uid()
        )
        -- Organisation visibility levels
        or (
          m.organisation_id is not null
          and (
            (m.visibility = 'organisation' and public.is_org_member(m.organisation_id))
            or (m.visibility = 'admin' and public.is_org_admin(m.organisation_id))
          )
        )
      )
  );
$$;

-- Management mirrors read access plus organisation admins, except that
-- organisation admins never manage private meetings (owner-only).
create or replace function public.can_manage_meeting(p_meeting_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.meetings m
    where m.id = p_meeting_id
      and (
        m.owner_id = auth.uid()
        or (
          m.organisation_id is not null
          and m.visibility <> 'private'
          and public.is_org_admin(m.organisation_id)
        )
      )
  );
$$;

-- ============================================================
-- RPC: create an organisation (caller becomes OWNER)
-- ============================================================
create or replace function public.create_organisation(p_name text)
returns public.organisations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_org  public.organisations;
  v_name text := trim(coalesce(p_name, ''));
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if length(v_name) = 0 then
    raise exception 'Organisation name is required';
  end if;

  insert into public.organisations (name, owner_id)
  values (v_name, v_uid)
  returning * into v_org;

  insert into public.organisation_members
    (organisation_id, user_id, role, status, email, display_name)
  values (
    v_org.id, v_uid, 'owner', 'active',
    lower(coalesce(auth.jwt() ->> 'email', '')),
    coalesce(
      nullif(auth.jwt() -> 'user_metadata' ->> 'name', ''),
      (select u.name from public."User" u
        where lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', '')) limit 1),
      split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 1)
    )
  );

  return v_org;
end;
$$;

-- ============================================================
-- RPC: invite a member (admin/owner only). Does NOT create fake users.
-- ============================================================
create or replace function public.invite_member(
  p_organisation_id uuid,
  p_email text,
  p_role text default 'member'
)
returns public.organisation_invitations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text := lower(trim(coalesce(p_email, '')));
  v_inv   public.organisation_invitations;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_role not in ('admin', 'member') then
    raise exception 'Invalid role';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Invalid email address';
  end if;

  -- Authorization: caller must be an active owner/admin of this organisation.
  if not exists (
    select 1 from public.organisation_members m
    where m.organisation_id = p_organisation_id
      and m.user_id = v_uid
      and m.status = 'active'
      and m.role in ('owner', 'admin')
  ) then
    raise exception 'Only organisation admins can invite members';
  end if;

  -- Already a member?
  if exists (
    select 1
    from public.organisation_members m
    join auth.users u on u.id = m.user_id
    where m.organisation_id = p_organisation_id
      and lower(u.email) = v_email
  ) then
    raise exception 'This person is already a member';
  end if;

  -- Duplicate pending invitation?
  if exists (
    select 1 from public.organisation_invitations i
    where i.organisation_id = p_organisation_id
      and lower(i.email) = v_email
      and i.status = 'pending'
      and i.expires_at > now()
  ) then
    raise exception 'An invitation is already pending for this email';
  end if;

  -- Expire stale pending invitations for this email.
  update public.organisation_invitations
     set status = 'expired'
   where organisation_id = p_organisation_id
     and lower(email) = v_email
     and status = 'pending'
     and expires_at <= now();

  -- Reuse the most recent non-pending row (revoked/expired/accepted) instead
  -- of accumulating duplicates for the same email.
  with target as (
    select id
    from public.organisation_invitations
    where organisation_id = p_organisation_id
      and lower(email) = v_email
      and status <> 'pending'
    order by created_at desc
    limit 1
  )
  update public.organisation_invitations i
     set role = p_role,
         invited_by = v_uid,
         status = 'pending',
         expires_at = now() + interval '7 days'
  from target t
  where i.id = t.id
  returning i.* into v_inv;
  if found then
    return v_inv;
  end if;

  insert into public.organisation_invitations (organisation_id, email, role, invited_by)
  values (p_organisation_id, v_email, p_role, v_uid)
  returning * into v_inv;

  return v_inv;
end;
$$;

-- ============================================================
-- RPC: accept an invitation (only the invitee, by JWT email)
-- ============================================================
create or replace function public.accept_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_inv   public.organisation_invitations;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if v_email = '' then
    raise exception 'Session has no email claim';
  end if;

  select * into v_inv
  from public.organisation_invitations
  where id = p_invitation_id
  for update;

  if not found then
    raise exception 'Invitation not found';
  end if;

  if lower(v_inv.email) <> v_email then
    raise exception 'This invitation was sent to a different email address';
  end if;

  if v_inv.status = 'accepted' then
    return; -- idempotent
  end if;

  if v_inv.status <> 'pending' then
    raise exception 'Invitation is no longer valid';
  end if;

  if v_inv.expires_at <= now() then
    update public.organisation_invitations set status = 'expired' where id = v_inv.id;
    raise exception 'Invitation has expired';
  end if;

  insert into public.organisation_members
    (organisation_id, user_id, role, status, email, display_name)
  values (
    v_inv.organisation_id, v_uid, v_inv.role, 'active',
    v_email,
    coalesce(
      nullif(auth.jwt() -> 'user_metadata' ->> 'name', ''),
      (select u.name from public."User" u where lower(u.email) = v_email limit 1),
      split_part(v_email, '@', 1)
    )
  )
  on conflict (organisation_id, user_id) do nothing;

  update public.organisation_invitations set status = 'accepted' where id = v_inv.id;
end;
$$;

-- ============================================================
-- RPC: change a member's role (OWNER only).
-- The owner row can never be changed; only owner/admin/member are valid.
-- ============================================================
create or replace function public.update_member_role(
  p_organisation_id uuid,
  p_target_user_id uuid,
  p_role text
)
returns public.organisation_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_member public.organisation_members;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_role not in ('admin', 'member') then
    raise exception 'Invalid role';
  end if;

  select * into v_member
  from public.organisation_members
  where organisation_id = p_organisation_id and user_id = p_target_user_id;
  if not found then
    raise exception 'Member not found';
  end if;
  if v_member.role = 'owner' then
    raise exception 'The owner role cannot be changed';
  end if;

  if public.org_role_of(p_organisation_id, v_uid) <> 'owner' then
    raise exception 'Only the organisation owner can change member roles';
  end if;

  update public.organisation_members
     set role = p_role
   where organisation_id = p_organisation_id and user_id = p_target_user_id
  returning * into v_member;

  return v_member;
end;
$$;

-- ============================================================
-- RPC: remove a member from an organisation.
-- Owner removes anyone (except themselves / the owner row);
-- admins can remove plain members only. Access is lost immediately
-- because all RLS checks read organisation_members.
-- ============================================================
create or replace function public.remove_member(
  p_organisation_id uuid,
  p_target_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_caller     text;
  v_target     public.organisation_members;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  v_caller := public.org_role_of(p_organisation_id, v_uid);
  if v_caller is null then
    raise exception 'Not authorised';
  end if;
  if v_caller not in ('owner', 'admin') then
    raise exception 'Only organisation owners and admins can remove members';
  end if;
  if p_target_user_id = v_uid then
    raise exception 'You cannot remove yourself';
  end if;

  select * into v_target
  from public.organisation_members
  where organisation_id = p_organisation_id and user_id = p_target_user_id;
  if not found then
    raise exception 'Member not found';
  end if;
  if v_target.role = 'owner' then
    raise exception 'The owner cannot be removed';
  end if;
  if v_caller = 'admin' and v_target.role <> 'member' then
    raise exception 'Only the owner can remove admins';
  end if;

  delete from public.organisation_members
   where organisation_id = p_organisation_id and user_id = p_target_user_id;
end;
$$;

-- ============================================================
-- RPC: revoke a pending invitation (owner/admin of that organisation).
-- ============================================================
create or replace function public.revoke_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_inv public.organisation_invitations;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_inv
  from public.organisation_invitations
  where id = p_invitation_id
  for update;
  if not found then
    raise exception 'Invitation not found';
  end if;

  if not (
    exists (
      select 1 from public.organisation_members m
      where m.organisation_id = v_inv.organisation_id
        and m.user_id = v_uid
        and m.status = 'active'
        and m.role in ('owner', 'admin')
    )
  ) then
    raise exception 'Only organisation admins can revoke invitations';
  end if;

  if v_inv.status <> 'pending' then
    raise exception 'Only pending invitations can be revoked';
  end if;

  update public.organisation_invitations set status = 'revoked' where id = v_inv.id;
end;
$$;

-- ============================================================
-- RPC: ensure a public."User" profile row exists for the caller
-- ============================================================
create or replace function public.ensure_my_profile(p_name text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_name  text := nullif(trim(coalesce(p_name, '')), '');
begin
  if v_email = '' then
    return;
  end if;

  if exists (select 1 from public."User" u where lower(u.email) = v_email) then
    if v_name is not null then
      update public."User" set name = v_name where lower(email) = v_email and (name is null or name = '');
    end if;
    return;
  end if;

  insert into public."User" (email, name)
  values (v_email, coalesce(v_name, v_email))
  on conflict do nothing;
end;
$$;

-- ============================================================
-- RPC: backfill ownership of legacy meetings (SERVICE ROLE ONLY).
-- Used once by scripts/backfill_meeting_ownership.py.
-- ============================================================
create or replace function public.assign_orphan_meetings(p_owner_email text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role may run ownership backfill';
  end if;

  select id into v_owner
  from auth.users
  where lower(email) = lower(trim(coalesce(p_owner_email, '')))
  limit 1;

  if v_owner is null then
    raise exception 'No auth user found for email %', p_owner_email;
  end if;

  update public.meetings
     set owner_id = v_owner,
         user_id = v_owner,
         organisation_id = null,
         workspace_type = 'individual'
   where owner_id is null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ============================================================
-- RPC: resolve an auth user id by email (SERVICE ROLE ONLY).
-- Used by the backend to stamp meeting ownership.
-- ============================================================
create or replace function public.get_auth_user_id(p_email text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case
    when coalesce(auth.role(), '') <> 'service_role' then null
    else (
      select u.id
      from auth.users u
      where lower(u.email) = lower(trim(coalesce(p_email, '')))
      limit 1
    )
  end;
$$;

grant execute on function public.create_organisation(text) to authenticated;
grant execute on function public.invite_member(uuid, text, text) to authenticated;
grant execute on function public.accept_invitation(uuid) to authenticated;
grant execute on function public.update_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.remove_member(uuid, uuid) to authenticated;
grant execute on function public.revoke_invitation(uuid) to authenticated;
grant execute on function public.ensure_my_profile(text) to authenticated;
grant execute on function public.org_role_of(uuid, uuid) to authenticated;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.is_org_admin(uuid) to authenticated;
grant execute on function public.is_org_owner(uuid) to authenticated;
grant execute on function public.can_access_meeting(uuid) to authenticated;
grant execute on function public.can_manage_meeting(uuid) to authenticated;
grant execute on function public.assign_orphan_meetings(text) to service_role;
grant execute on function public.get_auth_user_id(text) to service_role;

commit;
