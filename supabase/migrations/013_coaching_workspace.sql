-- Persist preferred coaching workspace (mobile retail vs general workplace). Default keeps existing behavior.
alter table public.profiles
  add column if not exists coaching_workspace text not null default 'mobile_sales';

do $$
begin
  alter table public.profiles
    add constraint profiles_coaching_workspace_check
    check (coaching_workspace in ('mobile_sales', 'general_workplace'));
exception
  when duplicate_object then null;
end $$;

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
  set coaching_workspace = v
  where id = auth.uid();
end;
$$;

grant execute on function public.set_coaching_workspace(text) to authenticated;
