# Staging environment

Use a separate Supabase project and Stripe **test mode** keys so production data never mixes with experiments.

## Checklist

1. Copy `.env.staging.example` → `.env.staging` (local only; do not commit).
2. Create a Supabase staging project; run all migrations in `supabase/migrations/`.
3. Stripe Dashboard (test mode): products/prices for Pro and Elite; webhook endpoint → `https://staging-api.example.com/webhook/stripe`.
4. Set `APP_URL` to your staging web origin (no trailing slash).
5. Build with staging env baked in:
   ```bash
   export $(grep -v '^#' .env.staging | xargs)
   npm run build
   npm start
   ```
6. Optional E2E against staging:
   ```bash
   E2E_BASE_URL=https://staging.example.com \
   E2E_USER_EMAIL=... E2E_USER_PASSWORD=... \
   npm run test:e2e
   ```

## Health

```bash
curl -sS "$STAGING_API/api/health" | jq
```

See [RUNBOOK.md](./RUNBOOK.md) for incident response.
