-- Paid tier: free | pro | elite (Stripe + owner override in app code).

alter table public.profiles
  add column if not exists plan_tier text not null default 'free';

alter table public.profiles drop constraint if exists profiles_plan_tier_check;

alter table public.profiles
  add constraint profiles_plan_tier_check
  check (plan_tier in ('free', 'pro', 'elite'));

comment on column public.profiles.plan_tier is 'Billing tier: free, pro ($8.99), elite ($11.99). Synced from Stripe price on subscription webhooks; owner allowlist resolves to elite in app.';

-- Existing subscribers: treat as Pro unless they already have elite.
update public.profiles
set plan_tier = 'pro'
where coalesce(is_pro, false) = true
  and coalesce(subscription_status, '') in ('active', 'trialing')
  and plan_tier = 'free';
