-- Idempotent: ensure onboarding flag exists on profiles (source of truth for first-login tutorial).
-- Older installs may have applied 003_onboarding_tutorial.sql; this is safe to re-run.
alter table public.profiles
  add column if not exists has_seen_tutorial boolean not null default false;
