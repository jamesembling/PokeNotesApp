# Poke Notes

Poke Notes is a Next.js App Router app for tracking Pokemon TCG battle logs, deck lists, tournaments, and related stats.

## Requirements

- Node.js 20.9 or newer (required by the installed Next.js version)
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

- For a new Supabase project, apply [`schema.sql`](./schema.sql). It is the complete schema snapshot; do not replay the historical incremental SQL over it.
- For an existing environment, inspect migration history and the target schema before applying anything. [`supabase/migrations`](./supabase/migrations) is the release authority. [`sql`](./sql) is historical reference material, not a fresh-install sequence or a destination for new migrations.
- Local Git hooks validate database changes without deploying them. Production migrations run only through the `Deploy production database` workflow, which the merging session dispatches after merge to `main`; see [`docs/migration-release.md`](./docs/migration-release.md).

5. Configure Supabase Auth redirect URLs for each environment:

- `http://localhost:3000/auth/callback`
- `https://<your-production-domain>/auth/callback`

6. Start the app:

```bash
npm run dev
```

### Authenticated local testing

For repeatable state-changing browser journeys, use the isolated local Supabase stack. It contains synthetic fixtures and cannot target a linked hosted project:

```bash
npm run e2e:local:setup
npm run dev:e2e
# In another terminal:
npm run auth:e2e:save
```

Reset with `npm run e2e:local:reset` before a full run, then save auth again because reset replaces the local user. To test on a phone, open the Wi-Fi address that `dev:e2e` prints and paste the code from `npm run auth:e2e:copy-code`. Claude has its own local account, which **Sign in as Claude** selects and `npm run auth:e2e:save:claude` saves. See [`docs/agents/local-e2e.md`](./docs/agents/local-e2e.md) for fixture IDs, safety rules, lifecycle commands, and verification.

The existing-account flow below remains available for non-destructive local checks against a configured development project. Do not use it for the resettable browser suite.

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

`auth:local:setup` and `dev:test-login` are safe to run repeatedly: when local credentials already
exist, setup preserves the existing password so active browser sessions remain valid. If the saved
agent-browser state redirects to `/login`, run `npm run auth:local:save` and retry with a fresh
agent-browser session. The in-app Browser and Chrome use separate cookie stores and do not consume
the saved agent-browser state.

Rotate the test-account password only when credentials may be compromised:

```bash
npm run auth:local:rotate
npm run auth:local:save
```

Rotation intentionally invalidates existing localhost sessions, including manually authenticated
browser sessions.

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

Copy the keys from `.env.example`. The running application needs:

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Seed and catalog utilities also use:

- `NEW_SUPABASE_URL`
- `NEW_SUPABASE_SERVICE_KEY`

Optional variables:

- `POKENOTES_AUTH_CLAIMS_SECRET` (dedicated HMAC key for forwarded auth claims; falls back to the Supabase service key)
- `CRON_SECRET`
- `LIMITLESS_SYNC_SECRET` (production hourly Limitless sync)
- `POKEMON_TCG_API_KEY` (optional upstream rate-limit allowance for card-effect sync)
- `POKE_NOTES_DEBUG_AUTH`
- `POKE_NOTES_DEBUG_PERF`
- `POKE_NOTES_AUTH_REDIRECT_ORIGINS`
- `POKE_NOTES_ENABLE_TEST_LOGIN`
- `POKE_NOTES_TEST_LOGIN_EMAIL`
- `POKE_NOTES_TEST_LOGIN_PASSWORD`
- `POKE_NOTES_LOCAL_LOGIN_CODE`
- `POKE_NOTES_LOCAL_LOGIN_HOSTS`

## Commands

Run `npm run` for the complete script list. Common commands are:

- `npm run dev` starts the app locally
- `npm run dev:reset` clears `.next` and starts the dev server again
- `npm run clean` removes local Next.js build output
- `npm run lint` runs ESLint
- `npm run format -- path/to/file.ts` formats explicitly named authored files with pinned Prettier
- `npm run format:check -- path/to/file.ts` checks those files without writing; exits nonzero on drift
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
- `npm run e2e:local:setup` starts and resets isolated local Supabase, then loads synthetic browser fixtures
- `npm run dev:e2e` starts the app against the isolated local database
- `npm run auth:e2e:save` refreshes the localhost-only browser state for the synthetic account
- `npm run perf:probe` probes configured local page/API routes without making localhost the production benchmark
- `npm run perf:prod:auth` opens an attended Google login and saves host-filtered production auth state
- `npm run perf:prod` replays the authenticated production route journey
- `npm run sync:pokemon-catalog` runs the Pokemon catalog sync manually

Formatting accepts explicit repository-relative JS/JSX/MJS/CJS, TS/TSX, CSS, Markdown/MDX,
JSON and YAML file paths. Quote paths containing spaces or parentheses. Directories, globs,
outside/symlink paths, generated `types/supabase.ts`, SQL, lockfiles, ignored files and build
artifacts are rejected. The whole batch is validated and parsed before writing. Name only
files changed for the task; baseline formatting is a separate reviewed change. The command
never defaults to formatting the repository, and is not an automatic commit hook.

## Documentation Map

- [`CONTEXT.md`](./CONTEXT.md): product language and data invariants.
- [`PRODUCT.md`](./PRODUCT.md): users, product intent, brand, and accessibility direction.
- [`docs/design-system.md`](./docs/design-system.md): current UI tokens and shared-component contracts.
- [`docs/performance-targets.md`](./docs/performance-targets.md): dated production measurements and performance targets.
- [`known-edge-cases.md`](./known-edge-cases.md): current cross-feature behavior and compatibility contracts.
- [`docs/application-health-review.md`](./docs/application-health-review.md): the dated repository/production audit and remaining work.
- [`docs/adr`](./docs/adr): accepted architectural decisions.

Older local working copies may still contain ignored `HANDOVER.md`, `REBUILD_PLAN.md`, or `ARCHETYPE_CATALOG_STARTER.md` files. They are superseded migration-era artifacts, are not repository documentation, and are candidates for local deletion once no external reference depends on their filenames.

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
6. Apply [`schema.sql`](./schema.sql) for a fresh database. For an existing database, deploy only unapplied native migrations through the controlled production workflow.
7. Set `CRON_SECRET` in Vercel so the scheduled catalog sync route can authenticate requests.
8. `/auth/test-login` deliberately returns `404` outside development. Production browser checks use an attended Google login captured by `npm run perf:prod:auth`; local automated and phone checks use the development-only flow above.

Migration alignment, schema health, and application behavior are release evidence, not cached
repository facts. Capture them from the intended production target for each database deployment.

`vercel.json` schedules `/api/cron/sync-pokemon-catalog` to run daily at `05:00` UTC. The job refreshes `pokemon_catalog` from the upstream sources, then invalidates the cached Pokemon options and identification catalog so UI menus and lookup paths see the new rows without a manual reseed.

The upcoming-events dashboard reads the saved `limitless_event_feed` snapshot and shows its UTC sync time. It never fetches Limitless during a dashboard request. Supabase Cron requests the protected refresh endpoint at `:05` each hour when the snapshot is at least 55 minutes old. GitHub Actions checks at `:35` and refreshes only when the snapshot is at least 75 minutes old. Vercel also runs a daily sync during the `06:00` UTC hour. A database lease prevents concurrent refreshes; manual GitHub workflow dispatch bypasses the age check but still uses the lease. The `Production` environment secret `LIMITLESS_SYNC_SECRET` must match the Vercel Production variable; the controlled database deployment workflow copies it into Supabase Vault after migrations. The Cron job is inert until that Vault secret exists. An app deployment that precedes the migration temporarily uses the original unleased refresh path and reports `compatibilityMode: true`; confirm that production syncs stop reporting this after the database workflow. Check the saved timestamp and Cron/GitHub run history after release, since a successful scheduler invocation alone does not prove a new snapshot was saved.

Before shipping a change, the recommended checks are:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```
