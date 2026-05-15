-- Server-side product funnel events (service role only; no client SDK).
-- Used for conversion and usage insights without third-party analytics.

create table if not exists public.product_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  event_name text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists product_events_name_created_at_idx
  on public.product_events (event_name, created_at desc);

create index if not exists product_events_user_id_created_at_idx
  on public.product_events (user_id, created_at desc);

alter table public.product_events enable row level security;

-- No policies: only service role (server) can read/write.

comment on table public.product_events is 'Append-only funnel events written by Trackora API (not exposed to clients).';
