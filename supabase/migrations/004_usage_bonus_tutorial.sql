-- Bonus AI generations consumed before usage_count increases (e.g. first run after onboarding).
alter table public.profiles
  add column if not exists bonus_ai_generations integer not null default 0;

alter table public.profiles
  drop constraint if exists bonus_ai_generations_non_negative;

alter table public.profiles
  add constraint bonus_ai_generations_non_negative check (bonus_ai_generations >= 0);

-- Completing the onboarding tutorial grants one bonus generation; idempotent on repeat RPC calls.
create or replace function public.mark_tutorial_seen()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set
    has_seen_tutorial = true,
    bonus_ai_generations = bonus_ai_generations + case when has_seen_tutorial = false then 1 else 0 end
  where id = auth.uid();
end;
$$;

-- Free tier: consume bonus_ai_generations first; only then increment usage_count. Pro: no-op (unchanged).
create or replace function public.increment_ai_usage()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles p
  set
    bonus_ai_generations = case
      when coalesce(p.bonus_ai_generations, 0) > 0 then p.bonus_ai_generations - 1
      else p.bonus_ai_generations
    end,
    usage_count = case
      when coalesce(p.bonus_ai_generations, 0) > 0 then p.usage_count
      else p.usage_count + 1
    end
  where p.id = auth.uid()
    and coalesce(p.is_pro, false) = false;
end;
$$;
