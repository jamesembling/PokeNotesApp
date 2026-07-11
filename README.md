# Poke Notes

Poke Notes is a Next.js App Router app for tracking Pokemon TCG battle logs, deck lists, tournaments, and related stats.

## Requirements

- Node.js 20 or newer
- npm
- A Supabase project with Auth enabled
- A Google OAuth provider configured for Supabase Auth

## Local Setup

1. Install dependencies:

```bash
npm ci
```

2. Create a local env file:

```bash
cp .env.example .env
```

3. Fill in the values in `.env`.

4. Bootstrap the database:

- For a new Supabase project, run [`schema.sql`](./schema.sql) in the SQL editor.
- For an existing project that already has the base schema, apply any newer files in [`sql/`](./sql).
- Codex can apply a SQL file for you when a database connection string or linked Supabase CLI session is available locally. Ask it to run the specific migration, for example `sql/2026-05-14-data-api-grants.sql`.

5. Configure Supabase Auth redirect URLs for each environment:

- `http://localhost:3000/auth/callback`
- `https://<your-production-domain>/auth/callback`

6. Start the app:

```bash
npm run dev
```

### Authenticated local testing

The production app does not provide a test-login route. The development-only local login requires
the current pairing code on both localhost and a phone; there is no trusted-host shortcut.

For automated localhost browser checks, configure the existing test account, start the server, and
save a host-scoped browser state. The save command reads the pairing code from ignored local env and
submits it in the login form; it does not place the code in a URL:

```bash
npm run auth:local:setup
npm run dev:test-login
# In another terminal:
npm run auth:local:save
```

For authenticated testing on a phone connected to the same trusted Wi-Fi network:

1. Configure the existing local test account and start the LAN-accessible dev server:

```bash
npm run dev:test-login
```

2. In another terminal, copy the local pairing code to the macOS clipboard without printing it:

```bash
npm run auth:local:copy-code
```

3. On the phone, open the Mac's `.local` address on port 3000, choose **Sign in locally**, and
paste the pairing code. The setup command records the current private IP and macOS local hostname
as exact allowed hosts in the ignored, mode-`0600` `.env.local` file.

Use this only on a trusted private network. The local server uses HTTP, so it is not suitable for
public or shared Wi-Fi. A browser session is tied to the hostname used to create it; do not switch
between the `.local` name and numeric IP during the same session.

If the dev server starts showing stale chunk errors, clear the Next cache and restart:

```bash
npm run dev:reset
```

## Environment Variables

Copy the keys from `.env.example` and provide values for:

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEW_SUPABASE_URL`
- `NEW_SUPABASE_SERVICE_KEY`

Optional variables:

- `OLD_SUPABASE_URL`
- `OLD_SUPABASE_SERVICE_KEY`
- `CRON_SECRET`
- `POKE_NOTES_DEBUG_AUTH`
- `POKE_NOTES_DEBUG_PERF`
- `POKE_NOTES_AUTH_REDIRECT_ORIGINS`
- `POKE_NOTES_ENABLE_TEST_LOGIN`
- `POKE_NOTES_TEST_LOGIN_EMAIL`
- `POKE_NOTES_TEST_LOGIN_PASSWORD`
- `POKE_NOTES_LOCAL_LOGIN_CODE`
- `POKE_NOTES_LOCAL_LOGIN_HOSTS`

## Commands

- `npm run dev` starts the app locally
- `npm run dev:reset` clears `.next` and starts the dev server again
- `npm run clean` removes local Next.js build output
- `npm run lint` runs ESLint
- `npm run typecheck` runs Next type generation and TypeScript checks
- `npm run test` runs the test suite
- `npm run build` creates a production build
- `npm run design:audit` checks shared design-token and component conventions
- `npm run schema:health` verifies the linked schema, grants, exact tenant/link constraints, triggers, and security contracts read-only
- `npm run types:supabase` refreshes generated TypeScript definitions from the linked schema
- `npm run audit:deck-compatibility` compares legacy and relational deck aggregates with SELECT-only paginated reads and aggregate-only output; exit `2` means cut-over remains blocked
- `npm run start` serves the production build locally
- `npm run auth:local:setup` configures the existing local test account and allowed LAN hosts
- `npm run auth:local:copy-code` copies the local pairing code without printing it
- `npm run auth:local:save` submits that code in the localhost login form and refreshes the host-scoped agent-browser state
- `npm run perf:prod:auth` opens an attended Google login and saves host-filtered production auth state
- `npm run sync:pokemon-catalog` runs the Pokemon catalog sync manually

## Deployment

Deployments are intended for Vercel.

1. Create a Vercel project from this repository.
2. Add the same runtime env vars used locally.
3. Set `NEXT_PUBLIC_APP_URL` to the deployed origin.
4. If another non-Vercel origin must complete authentication, add its full origin to the
   comma-separated `POKE_NOTES_AUTH_REDIRECT_ORIGINS` allowlist. Vercel's server-provided current
   deployment and branch URLs are approved automatically, but every callback URL must also be
   allowed by Supabase Auth.
5. In Supabase Auth, add each approved deployed `/auth/callback` URL to the allow list.
6. Run [`schema.sql`](./schema.sql) for a fresh database or apply any required files in [`sql/`](./sql) before using the app in production. This can be done in the Supabase SQL editor, or by asking Codex to run the SQL when local Supabase/database credentials are configured.
7. Set `CRON_SECRET` in Vercel so the scheduled catalog sync route can authenticate requests.
8. `/auth/test-login` deliberately returns `404` in every environment. Production browser checks use an attended Google login captured by `npm run perf:prod:auth`; local automated and phone checks use the development-only flow above.

This revision used a database-first rollout. The following migrations are live in production and
must remain in this timestamp order when provisioning another environment:

1. `20260711195613_commit_deck_aggregate_children.sql` — required before the application revision
   that calls `commit_deck_aggregate_child`;
2. `20260711203447_harden_public_schema_default_privileges.sql` — changes no current grant when
   installed; later application-owned public object creation/replacement must grant intended roles
   explicitly; and
3. `20260711204150_enforce_log_share_payload_envelope.sql` — validates the established `v1` share
   wrapper;
4. `20260711224609_rekey_deck_aggregate_collisions.sql` — preserves both account-scoped copies,
   repairs only owner/deck-scoped links, and retains a private 30-day mapping ledger; and
5. `20260711224858_enforce_log_share_payload_size.sql` — enforces the approved 256 KiB snapshot cap
   and gives the application a stable oversized-payload response.

The production rollout completed on 11 July 2026 UTC. `supabase migration list --linked` aligns all
15 local/remote versions, `npm run schema:health` passes, and the compatibility audit reports 49/49
Deck List plus 2/2 Matchup Plan parity with no blocking issue. For later environments, run the same
two gates after migration and replay the documented auth/share/deck smoke tests before promotion.

`vercel.json` schedules `/api/cron/sync-pokemon-catalog` to run daily at `05:00` UTC. The job refreshes `pokemon_catalog` from the upstream sources, then invalidates the cached Pokemon options and identification catalog so UI menus and lookup paths see the new rows without a manual reseed.

Before shipping a change, the recommended checks are:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```
