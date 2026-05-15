# Trackora

AI-assisted coaching and recognition forms for retail and workplace leaders. Describe an issue in plain language and get a structured, paste-ready document in seconds.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React 18, Vite, TypeScript |
| Backend | Express (`server/`), OpenAI |
| Auth & data | Supabase (profiles, usage, RLS) |
| Billing | Stripe (Pro / Elite subscriptions) |
| Mobile | Capacitor 7 (iOS & Android) |

Shared business rules live in `shared/` and are tested with Node’s built-in test runner.

## Quick start

```bash
cp .env.example .env
# Fill OPENAI_API_KEY, Supabase, Stripe (see .env.example comments)

npm install
npm run dev          # Vite :5173 + API :3001
```

Open [http://localhost:5173](http://localhost:5173). Sign-in requires `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.

Apply database migrations in order under `supabase/migrations/` (Supabase SQL editor or CLI).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Frontend + API concurrently |
| `npm run build` | Production Vite build → `dist/` |
| `npm start` | API only (serves `dist/` when built) |
| `npm test` | Unit + integration tests (`shared/`, `server/`) |
| `npm run test:e2e` | Playwright (API, landing, optional auth with env) |
| `npm run metrics:summary` | Funnel event counts (requires Supabase service role) |
| `npm run cap:sync` | Build web assets and sync to native projects |
| `npm run cap:android` / `cap:ios` | Sync + open Android Studio / Xcode |

See [MOBILE.md](./MOBILE.md) for Capacitor setup and `VITE_API_BASE_URL`.

## Project layout

```
src/                 React app (routing, coaching UI, auth)
server/              Express API (AI, Stripe webhooks, billing)
  config.mjs         Env, clients, constants
  prompts/           OpenAI system prompts
  billing/           Stripe ↔ Supabase sync
  ai/                Message builders + OpenAI client
  profile/           Usage & refinement quotas
shared/              Isomorphic plan/billing/coaching logic + tests
supabase/migrations/ Database schema and RPCs
```

## API (local)

- `POST /api/ai` — generate coaching log or refine a section (Bearer token)
- `POST /create-checkout-session` — Stripe Checkout
- `POST /webhook/stripe` — subscription sync (raw body)
- `POST /api/billing/start-elite` — Elite upgrade / proration

The OpenAI key and Stripe secret never ship to the client.

## Environment

Copy `.env.example` to `.env`. Server-only keys have no `VITE_` prefix. Frontend API origin: `VITE_API_BASE_URL` (optional in dev; defaults to `http://127.0.0.1:3001`).

## Tests & CI

```bash
npm test              # unit + integration (shared/, server/)
npm run test:e2e      # Playwright (builds app, starts API, runs e2e/)
npm run test:all      # both
npm run build
```

GitHub Actions runs unit tests, production build, and E2E on push/PR to `main`.

### Production checklist

- Apply all `supabase/migrations/` (including `017_product_events.sql`)
- Set `SENTRY_DSN` and `VITE_SENTRY_DSN` for error monitoring (optional)
- Stripe webhooks pointed at `/webhook/stripe` with signing secret
- `GET /api/health` for uptime checks
- Staging: [docs/STAGING.md](./docs/STAGING.md) · Metrics: [docs/METRICS.md](./docs/METRICS.md)
- Mobile release: [docs/RELEASE.md](./docs/RELEASE.md)
- See [docs/RUNBOOK.md](./docs/RUNBOOK.md) for billing and API troubleshooting

### E2E credentials (optional)

For authenticated Playwright tests, set in CI secrets or locally:

`E2E_USER_EMAIL`, `E2E_USER_PASSWORD`, plus real `VITE_SUPABASE_*` (staging user with tutorial completed).

## Deploy

1. `npm run build`
2. Run `node server/index.mjs` with env vars set (`PORT`, `APP_URL`, Supabase service role, Stripe secrets).
3. Point `FRONTEND_DIST` at `dist/` if the process cwd is not the repo root.

Native apps: set `VITE_API_BASE_URL` to your HTTPS API, then `npm run cap:sync`.
