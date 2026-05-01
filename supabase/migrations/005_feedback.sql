-- User feedback (in-app). RLS: users insert only their own rows.

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  user_email text,
  message text not null,
  follow_up_email text,
  created_at timestamptz not null default now()
);

create index if not exists feedback_user_id_created_at_idx on public.feedback (user_id, created_at desc);

alter table public.feedback enable row level security;

create policy "feedback_insert_own"
  on public.feedback for insert
  with check (auth.uid() = user_id);

-- Optional: allow users to read only their own rows (not required by the app UI).
create policy "feedback_select_own"
  on public.feedback for select
  using (auth.uid() = user_id);
