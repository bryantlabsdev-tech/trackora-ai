# Trackora operations runbook

## Health check

```bash
curl -sS "$API_ORIGIN/api/health" | jq
```

Expect `{ "ok": true, "service": "trackora-api" }`.

## User shows Free but paid for Pro

1. Stripe Dashboard → Customer → confirm subscription `active` or `trialing`.
2. Check webhook deliveries for `checkout.session.completed` / `customer.subscription.updated` (no 500s).
3. Run `npm run billing:resync` or `POST /api/billing/admin/resync-all` with `TRACKORA_BILLING_RESYNC_SECRET`.
4. Confirm `profiles.stripe_subscription_id` and `subscription_status` for the user in Supabase.

## OpenAI generations fail

1. Verify `OPENAI_API_KEY` on the server (never `VITE_` prefix).
2. Check logs for `[api/ai]` — deterministic fallback should still return a form.
3. Confirm client `VITE_API_BASE_URL` points at the live API (Capacitor builds bake this in).

## Stripe webhook retries

Successfully processed duplicate `event.id` values are ignored for 24h (in-memory on each instance). Failed deliveries are not marked processed and remain retryable. After deploy, Stripe may retry failed events automatically.

## Error monitoring

Set `SENTRY_DSN` (server) and `VITE_SENTRY_DSN` (frontend build) to enable Sentry. Optional: `SENTRY_ENVIRONMENT=production`.

## Repeated payment prompts or multiple charges

- Do not ask a paid subscriber to buy another subscription to restore access.
- Checkout now requires a verified bearer token and checks Stripe subscriptions by linked IDs, account metadata and matching billing email/Trackora price. Existing subscriptions (including those needing payment recovery) block another purchase.
- Repeat requests reuse an open Checkout session. New session creation uses Stripe idempotency keys. Pro and Elite share these protections.
- Login/profile refresh reconciles Stripe even if a previous failed webhook left billing IDs empty. Failed/canceled duplicate subscriptions cannot revoke a different active subscription.
- Deploy both the API and rebuilt frontend together; older clients without bearer headers will need to refresh. Rebuild Capacitor clients if used.
- For an affected customer, compare each successful payment's invoice, subscription ID, price, service period, customer ID and account metadata. Multiple successful payments alone do not distinguish duplicate subscriptions from prorations.
- Existing duplicate subscriptions and extra charges need separate review in Stripe. The code fix does not cancel subscriptions, expire old Checkout links, or issue refunds. Keep one intended subscription and reconcile the account after any approved cleanup.
- This checkout uses Stripe subscription search as a supplemental legacy-account lookup. Ensure the deployed Stripe key permits customer/subscription reads, subscription search and Checkout session reads/writes. A lookup failure blocks a new purchase safely.
