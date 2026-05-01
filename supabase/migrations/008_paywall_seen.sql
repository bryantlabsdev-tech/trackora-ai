-- One-time paywall flag for free-limit modal.
alter table public.profiles
  add column if not exists has_seen_paywall boolean not null default false;

create or replace function public.mark_paywall_seen()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set has_seen_paywall = true
  where id = auth.uid();
end;
$$;

grant execute on function public.mark_paywall_seen() to authenticated;
