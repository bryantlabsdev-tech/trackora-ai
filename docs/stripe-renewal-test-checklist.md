# Stripe subscription renewal — manual test checklist

Use **Stripe test mode** and the **Stripe CLI** (`stripe listen --forward-to …`) or Dashboard → Developers → Webhooks → event logs.

## Prerequisites

- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID` (or `STRIPE_PRO_PRICE_ID`), `SUPABASE_SERVICE_ROLE_KEY`, `APP_URL` set on the API server.
- Webhook endpoint registered for: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`.
- Supabase `profiles` row exists for the test user (app creates on first open).

## 1. New subscription

1. Sign in as a free user; confirm `is_pro` false in Supabase.
2. Click **Upgrade to Pro**; complete Checkout with test card `4242 4242 4242 4242`.
3. **Expect:** redirect to success URL; within seconds, webhook fires.
4. **Verify Supabase `profiles`:** `stripe_customer_id`, `stripe_subscription_id`, `subscription_status` (`active` or `trialing`), `is_pro` true, `current_period_end` future, `plan` `pro`.
5. Reload app; confirm unlimited generations and Pro UI.

## 2. Successful renewal

1. In Stripe Dashboard, open the test subscription; note `current_period_end`.
2. **Option A:** Advance test clock (if using Stripe test clocks) past period end and confirm payment succeeds.
3. **Option B:** Trigger `invoice.paid` with `billing_reason: subscription_cycle` (or wait for natural renewal in test).
4. **Expect:** `[webhook/stripe] RENEWAL invoice.paid (subscription_cycle)` in server logs (or equivalent `invoice.paid` log).
5. **Verify Supabase:** `current_period_end` advanced; `is_pro` still true; `subscription_status` still `active` (or `trialing` if still in trial).

## 3. Failed renewal (payment failure)

1. Attach a failing test card or use Stripe’s test helpers to fail the renewal invoice.
2. **Expect:** `invoice.payment_failed` webhook; logs show `invoice.payment_failed`.
3. **Verify:** After sync, `subscription_status` is Stripe’s current status (often `past_due`). **`is_pro` must be `false` immediately** — there is no grace period for `past_due`.

## 4. Canceled subscription (at period end)

1. Cancel subscription in Billing Portal or Dashboard with **cancel at period end**.
2. **Expect:** `customer.subscription.updated`; while period active, user may retain Pro until period end (per `evaluateSubscriptionAccess`).
3. After period ends / `customer.subscription.deleted`: `is_pro` false, `subscription_status` `canceled` (or ended).

## 5. Expired subscription

1. Let subscription end or delete subscription immediately (per Stripe behavior).
2. **Verify:** `is_pro` false; app shows free tier / paywall when limits apply.
3. Open app again (or pull to refresh profile): **billing reconcile** should sync from Stripe within cooldown rules.

## 6. Restored subscription

1. Resubscribe via Checkout or reactivate in Dashboard (same or new subscription).
2. **Expect:** `checkout.session.completed` and/or `invoice.paid` / `customer.subscription.updated`.
3. **Verify:** `is_pro` true; `current_period_end` updated.

## 7. Webhook failure / retry

1. Temporarily break Supabase update (wrong key) or return an error from a test stub.
2. **Expect:** Server returns **500** for sync failures so Stripe retries (signature errors still 400).
3. Restore service; confirm event eventually succeeds and profile matches Stripe.

## 8. Reconcile backup (no code deploy)

1. Manually set `profiles.is_pro` out of sync with Stripe (in a test project only).
2. Sign out and sign in, or reload app (Profile refresh runs reconcile when Stripe IDs exist).
3. **Expect:** POST `/api/billing/reconcile-subscription` (with Bearer token); profile corrected within **5 minutes** per-user cooldown unless `?force=1` on server (query supported in handler).

---

**Dashboard product checks (manual):** Confirm the Price used by `STRIPE_PRICE_ID` is **recurring**, **month** interval, and Checkout session `mode` is **subscription** (verified in code). Trial behavior is defined on the Stripe Price/Checkout—not changed by this app’s code path beyond `mode: 'subscription'`.
