# Production Supabase environment — investigation report

## Symptom

Sign-in shows **Failed to fetch** with `net::ERR_NAME_NOT_RESOLVED` → the browser is calling a **hostname that does not exist** (wrong or placeholder `VITE_SUPABASE_URL` baked into the Vite build).

## Client initialization

| File | Role |
|------|------|
| `src/lib/supabase.ts` | Creates `@supabase/supabase-js` client from env |
| `shared/supabaseClientEnv.mjs` | Resolves + validates URL and anon key |
| `vite.config.ts` | Logs resolved hostname at **build** time; fails Vercel builds if invalid |

Server-side auth (API) uses **different** names in `server/config.mjs`:

- `SUPABASE_URL` (no `VITE_` prefix)
- `SUPABASE_SERVICE_ROLE_KEY`

Those do **not** fix the login page — only `VITE_*` vars are embedded in the frontend bundle.

## Expected environment variables (Vercel / frontend)

| Variable | Required | Example |
|----------|----------|---------|
| `VITE_SUPABASE_URL` | Yes | `https://YOUR_PROJECT_REF.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Yes | `eyJ…` (anon **public** key from Supabase → Settings → API) |

Optional alias (supported in code, not preferred in docs):

| Variable | Notes |
|----------|--------|
| `VITE_SUPABASE_ANON_KEY` | Treated as alias for `VITE_SUPABASE_PUBLISHABLE_KEY` |

## Variables referenced in code (client)

| Name in code | Used by |
|--------------|---------|
| `VITE_SUPABASE_URL` | `src/lib/supabase.ts`, `vite.config.ts`, E2E |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `src/lib/supabase.ts`, `vite.config.ts`, E2E |
| `VITE_SUPABASE_ANON_KEY` | alias in `supabaseClientEnv.mjs` |

## Common mismatches (do **not** work alone for login)

| Often set in Vercel | Problem |
|---------------------|---------|
| `SUPABASE_URL` | Server-only; **not** exposed to Vite client → login gets empty/wrong URL |
| `SUPABASE_ANON_KEY` | No `VITE_` prefix → not in bundle |
| `VITE_SUPABASE_ANON_KEY` only | Supported as alias, but docs/UI expect `VITE_SUPABASE_PUBLISHABLE_KEY` |
| `NEXT_PUBLIC_SUPABASE_URL` | Next.js convention; ignored unless copied to `VITE_SUPABASE_URL` |
| `https://placeholder.supabase.co` | CI placeholder → **ERR_NAME_NOT_RESOLVED** in production |
| `https://YOUR_PROJECT.supabase.co` | Template from `.env.example` → invalid DNS |

## Hardcoded Supabase URLs in repo

| Location | URL | Risk |
|----------|-----|------|
| `.github/workflows/ci.yml` | `https://placeholder.supabase.co` | CI only — must **not** be Production Vercel values |
| `.env.example` / `.env.staging.example` | `YOUR_*_PROJECT.supabase.co` | Documentation only |

**No production project URL is hardcoded in `src/`.**

## Vercel checklist

1. **Project → Settings → Environment Variables → Production**
2. Add or fix:
   - `VITE_SUPABASE_URL` = Project URL from Supabase (Settings → API)
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = `anon` `public` key (same page)
3. If you already have `SUPABASE_URL` / service role for API on Render, **keep those** — also add the two `VITE_*` vars for the frontend host.
4. **Redeploy** (env changes are applied at **build** time for Vite).
5. In the Vercel build log, confirm:
   ```
   [trackora] Supabase client env (build)
     VITE_SUPABASE_URL → https://xxxx.supabase.co (ok)
   ```
6. If build fails with `[trackora] Invalid Supabase client env`, fix the listed errors before shipping.

## Code changes (fix)

- Validate URL hostname (`*.supabase.co`), reject placeholders.
- Refuse to create a Supabase client when invalid → shows **Sign-in isn't configured** instead of **Failed to fetch**.
- Build fails on Vercel when URL/key missing or placeholder.
- Log resolved hostname during `npm run build`.

## Verify production login

After setting Vercel vars and redeploying:

1. Open `/login` → should **not** show config error.
2. DevTools → Network → sign-in request host should be `https://<project-ref>.supabase.co/auth/v1/...`
3. No requests to `placeholder.supabase.co` or `YOUR_*` hostnames.
