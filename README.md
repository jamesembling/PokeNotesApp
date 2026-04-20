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

5. Configure Supabase Auth redirect URLs for each environment:

- `http://localhost:3000/auth/callback`
- `https://<your-production-domain>/auth/callback`

6. Start the app:

```bash
npm run dev
```

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

## Commands

- `npm run dev` starts the app locally
- `npm run dev:reset` clears `.next` and starts the dev server again
- `npm run clean` removes local Next.js build output
- `npm run lint` runs ESLint
- `npm run typecheck` runs Next type generation and TypeScript checks
- `npm run test` runs the test suite
- `npm run build` creates a production build
- `npm run start` serves the production build locally
- `npm run sync:pokemon-catalog` runs the Pokemon catalog sync manually

## Deployment

Deployments are intended for Vercel.

1. Create a Vercel project from this repository.
2. Add the same runtime env vars used locally.
3. Set `NEXT_PUBLIC_APP_URL` to the deployed origin.
4. In Supabase Auth, add the deployed `/auth/callback` URL to the allow list.
5. Run [`schema.sql`](./schema.sql) for a fresh database or apply any required files in [`sql/`](./sql) before using the app in production.
6. Set `CRON_SECRET` in Vercel so the scheduled catalog sync route can authenticate requests.

`vercel.json` schedules `/api/cron/sync-pokemon-catalog` to run daily at `05:00` UTC. The job refreshes `pokemon_catalog` from the upstream sources, then invalidates the cached Pokemon options and identification catalog so UI menus and lookup paths see the new rows without a manual reseed.

Before shipping a change, the recommended checks are:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```
