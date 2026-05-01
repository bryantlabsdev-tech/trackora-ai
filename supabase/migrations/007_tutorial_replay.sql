-- One-time welcome bonus flag: replays reset has_seen_tutorial only; mark_tutorial_seen must not stack bonus.
alter table public.profiles
  add column if not exists tutorial_welcome_bonus_granted boolean not null default false;

update public.profiles
set tutorial_welcome_bonus_granted = true
where coalesce(has_seen_tutorial, false) = true;

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
    tutorial_welcome_bonus_granted = case
      when coalesce(has_seen_tutorial, false) = false and coalesce(tutorial_welcome_bonus_granted, false) = false
      then true
      else tutorial_welcome_bonus_granted
    end,
    bonus_ai_generations = bonus_ai_generations + case
      when coalesce(has_seen_tutorial, false) = false and coalesce(tutorial_welcome_bonus_granted, false) = false
      then 1
      else 0
    end
  where id = auth.uid();
end;
$$;

-- Replay onboarding from Settings: only clears has_seen_tutorial (usage_count / bonus unchanged).
create or replace function public.reset_tutorial_for_replay()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set has_seen_tutorial = false
  where id = auth.uid();
end;
$$;

grant execute on function public.reset_tutorial_for_replay() to authenticated;
