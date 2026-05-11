-- Harden profile updates: authenticated PostgREST PATCH cannot change billing/plan/usage columns.
-- Service_role (Stripe sync, server refinements) passes through. Trusted RPCs set a transaction-local flag.

create or replace function public.profiles_before_update_normalize()
returns trigger
language plpgsql
set search_path = public, auth
as $$
declare
  jwt_role text;
  privileged_ctx text;
begin
  begin
    jwt_role := auth.jwt() ->> 'role';
  exception
    when others then
      jwt_role := null;
  end;

  if jwt_role = 'service_role' then
    return new;
  end if;

  begin
    privileged_ctx := current_setting('app.profile_privileged_mutation', true);
  exception
    when others then
      privileged_ctx := null;
  end;

  if privileged_ctx = '1' then
    return new;
  end if;

  new.is_pro := old.is_pro;
  new.plan := old.plan;
  new.plan_tier := old.plan_tier;
  new.usage_count := old.usage_count;
  new.bonus_ai_generations := old.bonus_ai_generations;
  new.refinement_count := old.refinement_count;
  new.refinement_month := old.refinement_month;
  new.stripe_customer_id := old.stripe_customer_id;
  new.stripe_subscription_id := old.stripe_subscription_id;
  new.subscription_status := old.subscription_status;
  new.current_period_end := old.current_period_end;
  new.created_at := old.created_at;
  new.tutorial_welcome_bonus_granted := old.tutorial_welcome_bonus_granted;

  return new;
end;
$$;

comment on function public.profiles_before_update_normalize() is
  'Before UPDATE on profiles: reverts privileged columns to OLD for non-service_role unless app.profile_privileged_mutation=1 (trusted RPCs).';

drop trigger if exists profiles_before_update_normalize on public.profiles;

create trigger profiles_before_update_normalize
  before update on public.profiles
  for each row
  execute function public.profiles_before_update_normalize();

-- mark_tutorial_seen: touches bonus + welcome flag; must bypass trigger for those columns.
create or replace function public.mark_tutorial_seen()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform set_config('app.profile_privileged_mutation', '1', true);
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

-- increment_ai_usage: touches usage + bonus; must bypass trigger.
create or replace function public.increment_ai_usage()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform set_config('app.profile_privileged_mutation', '1', true);
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
