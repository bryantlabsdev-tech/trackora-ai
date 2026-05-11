-- First-launch workspace choice for new accounts. Existing rows skip the gate (tutorial unchanged).
alter table public.profiles
  add column if not exists needs_coaching_workspace_setup boolean not null default true;

update public.profiles
set needs_coaching_workspace_setup = false;

alter table public.profiles
  alter column needs_coaching_workspace_setup set default true;

create or replace function public.set_coaching_workspace(p_workspace text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v text;
begin
  v := lower(trim(coalesce(p_workspace, '')));
  if v not in ('mobile_sales', 'general_workplace') then
    raise exception 'invalid coaching_workspace';
  end if;
  update public.profiles
  set
    coaching_workspace = v,
    needs_coaching_workspace_setup = false
  where id = auth.uid();
end;
$$;
