-- First-login onboarding: persisted so the tour only runs once per account.
alter table public.profiles
  add column if not exists has_seen_tutorial boolean not null default false;

-- Existing rows at migration time have already used the app; skip the tour for them.
update public.profiles set has_seen_tutorial = true;

-- New signups after this migration keep default false until they complete the tour RPC.

create or replace function public.mark_tutorial_seen()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set has_seen_tutorial = true
  where id = auth.uid();
end;
$$;

grant execute on function public.mark_tutorial_seen() to authenticated;
