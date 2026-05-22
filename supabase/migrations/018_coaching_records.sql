-- Coaching history + follow-up workflow records (server-managed).

create table if not exists public.coaching_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  employee_name text not null default '',
  role text not null default '',
  coaching_type text not null default '',
  coaching_workspace text not null default 'mobile_sales',
  mode text not null default 'coaching',
  coaching_reason text not null default '',
  notes text not null default '',
  generated_form text not null default '',
  metric_focus text,
  metric_snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'Draft',
  follow_up_due_at timestamptz,
  follow_up_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists coaching_records_user_created_at_idx
  on public.coaching_records (user_id, created_at desc);

create index if not exists coaching_records_user_status_idx
  on public.coaching_records (user_id, status);

create or replace function public.set_coaching_records_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists coaching_records_set_updated_at on public.coaching_records;
create trigger coaching_records_set_updated_at
before update on public.coaching_records
for each row execute function public.set_coaching_records_updated_at();

alter table public.coaching_records
  add constraint coaching_records_workspace_chk
  check (coaching_workspace in ('mobile_sales', 'general_workplace'));

alter table public.coaching_records
  add constraint coaching_records_mode_chk
  check (mode in ('coaching', 'recognition'));

alter table public.coaching_records
  add constraint coaching_records_status_chk
  check (status in ('Draft', 'Shared', 'Completed', 'Follow-up Needed'));

alter table public.coaching_records enable row level security;

-- No RLS policies: service-role API only.

comment on table public.coaching_records is 'Generated coaching history with follow-up workflow status.';
