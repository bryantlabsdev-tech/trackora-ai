-- Adds Stripe subscription state columns used by webhook sync.
alter table public.profiles
  add column if not exists subscription_status text,
  add column if not exists current_period_end timestamptz,
  add column if not exists plan text;

create index if not exists profiles_stripe_customer_id_idx on public.profiles (stripe_customer_id);
create index if not exists profiles_stripe_subscription_id_idx on public.profiles (stripe_subscription_id);
create index if not exists profiles_current_period_end_idx on public.profiles (current_period_end);

-- Backfill plan for existing rows so UI/queries can rely on a value.
update public.profiles
set plan = case
  when coalesce(is_pro, false) then 'pro'
  else 'free'
end
where plan is null;
