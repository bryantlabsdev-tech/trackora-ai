-- Harden profile creation: authenticated clients cannot self-provision billing/plan fields on INSERT.
-- Stripe/webhook paths use service_role UPDATE (unchanged). Optional service_role INSERT stays unrestricted.

create or replace function public.profiles_before_insert_normalize()
returns trigger
language plpgsql
set search_path = public, auth
as $$
declare
  jwt_role text;
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

  new.is_pro := false;
  new.plan_tier := 'free';
  new.plan := 'free';
  new.usage_count := 0;
  new.bonus_ai_generations := 0;
  new.refinement_count := 0;
  new.refinement_month := null;
  new.stripe_customer_id := null;
  new.stripe_subscription_id := null;
  new.subscription_status := null;
  new.current_period_end := null;

  new.has_seen_tutorial := false;
  new.has_seen_paywall := false;
  new.tutorial_welcome_bonus_granted := false;

  new.needs_coaching_workspace_setup := true;

  if new.coaching_workspace is null or btrim(new.coaching_workspace::text) = '' then
    new.coaching_workspace := 'mobile_sales';
  elsif new.coaching_workspace not in ('mobile_sales', 'general_workplace') then
    new.coaching_workspace := 'mobile_sales';
  end if;

  return new;
end;
$$;

comment on function public.profiles_before_insert_normalize() is
  'Before INSERT on profiles: strips privileged billing/plan fields for non-service_role callers (JWT role). Service_role passes through for admin tooling.';

drop trigger if exists profiles_before_insert_normalize on public.profiles;

create trigger profiles_before_insert_normalize
  before insert on public.profiles
  for each row
  execute function public.profiles_before_insert_normalize();
