-- Monthly section-refinement quota for Pro (calendar month UTC).
-- Owner allowlist bypasses limits in application code (see shared/ownerFreePro.mjs).

alter table public.profiles
  add column if not exists refinement_count integer not null default 0;

alter table public.profiles
  add column if not exists refinement_month text;

comment on column public.profiles.refinement_count is 'Refinements used in refinement_month (UTC YYYY-MM); reset when month changes.';
comment on column public.profiles.refinement_month is 'UTC calendar month key YYYY-MM for refinement_count.';
