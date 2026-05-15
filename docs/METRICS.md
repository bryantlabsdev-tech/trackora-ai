# Product metrics (first-party, server-side)

Trackora logs **funnel events** to `public.product_events` from the API only. There are no third-party analytics SDKs in the client.

Apply migration `017_product_events.sql` in Supabase.

## Event names

| Event | When |
|-------|------|
| `coaching_log_generated` | Successful AI or deterministic coaching form generation |
| `section_refined` | Successful section refinement |
| `checkout_session_started` | Stripe Checkout session created |
| `elite_upgrade_started` | Elite upgrade path initiated |

## Example queries (SQL editor)

**Signups last 7 days**

```sql
select count(*) from auth.users where created_at > now() - interval '7 days';
```

**Generations per day**

```sql
select date_trunc('day', created_at) as day, count(*)
from public.product_events
where event_name = 'coaching_log_generated'
  and created_at > now() - interval '30 days'
group by 1
order by 1;
```

**Checkout starts vs generations (conversion proxy)**

```sql
select
  count(*) filter (where event_name = 'coaching_log_generated') as generations,
  count(*) filter (where event_name = 'checkout_session_started') as checkouts
from public.product_events
where created_at > now() - interval '7 days';
```

## CLI summary

```bash
# Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env
npm run metrics:summary
```
