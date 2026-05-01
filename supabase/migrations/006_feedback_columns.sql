-- Extend feedback for account email + optional follow-up (no Resend).
alter table public.feedback
  add column if not exists user_email text;

alter table public.feedback
  add column if not exists follow_up_email text;

-- Backfill is optional; new rows set user_email from the client.
