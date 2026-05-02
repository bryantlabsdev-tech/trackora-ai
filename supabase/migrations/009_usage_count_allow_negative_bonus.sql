-- Allow negative usage_count so operators can grant extra free generations manually
-- (e.g. usage_count = -7 gives 3 - (-7) = 10 generations before hitting the free cap).
-- Server and client treat blocking as usage_count >= FREE_LIMIT (default 3).

alter table public.profiles drop constraint if exists usage_count_non_negative;
