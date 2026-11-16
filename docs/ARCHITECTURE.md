# JT-Code web architecture

## Boundary

This repository is only the React + TypeScript web client. It never holds Supabase database credentials,
the Supabase service-role key, Kafka or Redis credentials, Stripe secret keys or AI provider keys. The
only Supabase value it ships is the public anon key.

## Data modes

`VITE_DATA_MODE` (`src/lib/config.ts`) selects one of two modes:

* `api`: real Supabase Auth plus the Django API (`src/lib/data/api/repositories.ts`);
* `mock`: browser-only auth and IndexedDB data for design work (`src/lib/data/mock/`).

Everything above the repository interfaces (`src/lib/data/contracts.ts`) is identical in both modes.
Production images are always built in `api` mode.

## Authentication

* `SupabaseProvider` (`src/lib/supabase.tsx`) owns the browser session with supabase-js (PKCE). It
  covers sign-up (profile fields and consent flags sent as `user_metadata`), sign-in, OAuth, sign-out
  and the reset-code flow.
* The axios client (`src/lib/api/http.ts`) adds `Authorization: Bearer <access token>` to every Django
  call. Django verifies the JWT itself and checks that the session is still live (`auth.sessions`); the
  frontend session is never treated as authorization by itself.
* Django provisions the profile, a personal workspace and the recorded consents on the first
  authenticated request.

## Files

Uploads use a signed, two-step flow against **private Supabase Storage**:

1. Django issues a short-lived, single-object upload capability.
2. The browser uploads the bytes to Supabase Storage.
3. The browser calls Django's completion endpoint. Django verifies size, type and SHA-256 before
   registering the asset.

Downloads use short-lived signed URLs that Django issues after an authorization check.

## Deployment

`Dockerfile` builds the SPA in `api` mode. The build fails if `VITE_SUPABASE_URL` or
`VITE_SUPABASE_ANON_KEY` is missing, and `.env*` files are excluded from the build context. The image
serves it with unprivileged nginx on `:8080`:

* a strict CSP: scripts only from this origin and Stripe.js; `connect-src` limited to this origin, the
  Supabase origin (`JT_SUPABASE_ORIGIN`), Stripe and Sentry;
* only `/embed/*` may be framed;
* hashed `/assets/*` are cached immutably, and `index.html` is always revalidated.

The backend's `compose.yaml` builds this image as the `web` service. Its Caddy `edge` serves it at
`https://APP_DOMAIN`, with the API under `/api` on the same origin.

## Monitoring

Sentry is initialized before React renders. API failures are captured with the backend request id when
available. Never include prompt content, uploaded file contents, secrets or raw tokens in Sentry events.
