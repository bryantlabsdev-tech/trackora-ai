-- Run in Supabase SQL Editor (full script) or via Supabase CLI.
-- Profiles: one row per auth user; usage_count tracks free-tier AI generations (increment via RPC only).
--
-- If creating a trigger on auth.users fails (permissions), skip the trigger block — the app still
-- creates a profile on first load via ensureProfileRow().

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null default '',
  is_pro boolean not null default false,
  usage_count integer not null default 0,
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz not null default now(),
  constraint usage_count_non_negative check (usage_count >= 0)
);

create index if not exists profiles_email_idx on public.profiles (email);

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

-- No general update policy: usage and pro flags are updated via SECURITY DEFINER RPC or service role.

-- After a successful OpenAI generation, free users get usage_count += 1; pro users unchanged.
create or replace function public.increment_ai_usage()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set usage_count = usage_count + 1
  where id = auth.uid()
    and coalesce(is_pro, false) = false;
end;
$$;

grant execute on function public.increment_ai_usage() to authenticated;

-- Optional: auto-create profile when a new auth user is created (client still upserts as fallback).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
