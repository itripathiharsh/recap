-- Forward migration: Add get_invitation_details and join_organisation_by_link RPCs for /join flow

create or replace function public.get_invitation_details(
  p_invitation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv public.organisation_invitations%rowtype;
  v_org_name text;
begin
  select * into v_inv from public.organisation_invitations where id = p_invitation_id;
  if not found then
    return jsonb_build_object('valid', false, 'error', 'Invitation not found');
  end if;

  if v_inv.status <> 'pending' then
    return jsonb_build_object('valid', false, 'error', 'Invitation is ' || v_inv.status);
  end if;

  if v_inv.expires_at is not null and v_inv.expires_at < now() then
    return jsonb_build_object('valid', false, 'error', 'Invitation has expired');
  end if;

  select name into v_org_name from public.organisations where id = v_inv.organisation_id;

  return jsonb_build_object(
    'valid', true,
    'id', v_inv.id,
    'organisation_id', v_inv.organisation_id,
    'organisation_name', coalesce(v_org_name, 'Unknown Organisation'),
    'email', v_inv.email,
    'role', v_inv.role,
    'expires_at', v_inv.expires_at
  );
end;
$$;

grant execute on function public.get_invitation_details(uuid) to anon, authenticated, service_role;

create or replace function public.join_organisation_by_link(
  p_organisation_id uuid,
  p_role text default 'member'
)
returns public.organisation_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org public.organisations%rowtype;
  v_membership public.organisation_members%rowtype;
  v_role text;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required to join an organisation';
  end if;

  select * into v_org from public.organisations where id = p_organisation_id;
  if not found then
    raise exception 'Organisation not found';
  end if;

  -- Prevent privilege escalation: cap to 'member' or 'viewer'
  if lower(coalesce(p_role, 'member')) in ('owner', 'admin') then
    v_role := 'member';
  elsif lower(p_role) in ('member', 'viewer') then
    v_role := lower(p_role);
  else
    v_role := 'member';
  end if;

  select lower(email) into v_email from auth.users where id = auth.uid();

  -- If user is already a member, return current membership
  select * into v_membership
  from public.organisation_members
  where organisation_id = p_organisation_id and user_id = auth.uid();

  if found then
    return v_membership;
  end if;

  insert into public.organisation_members (
    organisation_id,
    user_id,
    role,
    status,
    email,
    created_at,
    updated_at
  )
  values (
    p_organisation_id,
    auth.uid(),
    v_role,
    'active',
    v_email,
    now(),
    now()
  )
  returning * into v_membership;

  return v_membership;
end;
$$;

grant execute on function public.join_organisation_by_link(uuid, text) to authenticated, service_role;
