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
| `npm test` | Unit tests in `shared/` |
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
npm test
npm run build
```

GitHub Actions runs both on push and pull requests to `main`.

## Deploy

1. `npm run build`
2. Run `node server/index.mjs` with env vars set (`PORT`, `APP_URL`, Supabase service role, Stripe secrets).
3. Point `FRONTEND_DIST` at `dist/` if the process cwd is not the repo root.

Native apps: set `VITE_API_BASE_URL` to your HTTPS API, then `npm run cap:sync`.
