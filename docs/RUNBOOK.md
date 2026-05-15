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

Duplicate `event.id` values are ignored for 24h (in-memory on each instance). After deploy, Stripe may retry failed events automatically.

## Error monitoring

Set `SENTRY_DSN` (server) and `VITE_SENTRY_DSN` (frontend build) to enable Sentry. Optional: `SENTRY_ENVIRONMENT=production`.
