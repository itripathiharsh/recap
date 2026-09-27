-- Permissions Hardening: Enforce read-only restriction for 'viewer' role on meetings

create or replace function public.is_org_contributor(p_organisation_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.organisation_members m
    where m.organisation_id = p_organisation_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role in ('owner', 'admin', 'member')
  );
$$;

grant execute on function public.is_org_contributor(uuid) to anon, authenticated, service_role;

drop policy if exists "meetings_insert" on public.meetings;
create policy "meetings_insert" on public.meetings
for insert to authenticated
with check (
  (coalesce(owner_id, user_id) is null or coalesce(owner_id, user_id) = auth.uid())
  and
  (organisation_id is null or is_org_contributor(organisation_id))
);
