# Poke Notes V2

Poke Notes is a Next.js App Router app for tracking Pokemon TCG battle logs, deck lists, tournaments, and related stats.

## Requirements

- Node.js 20 or newer
- npm
- A Supabase project with Auth enabled
- A Google OAuth provider configured in Supabase Auth

## Setup

1. Install dependencies:

```bash
npm ci
```

2. Create your local env file from the example:

```bash
cp .env.example .env
```

3. Fill in the values in `.env`.

4. Configure Supabase Auth redirect URLs for the environments you plan to use:

- `http://localhost:3000/auth/callback`
- `https://<your-production-domain>/auth/callback`

5. Start the app:

```bash
npm run dev
```

6. Open `http://localhost:3000`.

If the dev server starts showing missing chunk errors or half-rendered pages, reset the Next.js cache and restart:

```bash
npm run dev:reset
```

## Environment Variables

The app reads the following variables:

- `NEXT_PUBLIC_APP_URL` for same-origin checks and redirects
- `NEXT_PUBLIC_SUPABASE_URL` for browser and server Supabase clients
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` for browser and server Supabase clients
- `SUPABASE_SERVICE_ROLE_KEY` for admin/server-side Supabase actions
- `NEW_SUPABASE_URL` and `NEW_SUPABASE_SERVICE_KEY` for migration and seed scripts
- `OLD_SUPABASE_URL` and `OLD_SUPABASE_SERVICE_KEY` only when running `migrate.mjs` against an older project
- `POKE_NOTES_DEBUG_AUTH` and `POKE_NOTES_DEBUG_PERF` for local debugging

For local development, the Supabase URL and anon key must point at the project that backs this app. The service role key is needed for admin flows and any server-side updates that bypass the public client.

## Common Commands

- `npm run dev` starts the app locally
- `npm run dev:reset` clears `./.next` and starts the dev server again
- `npm run clean` removes the local Next.js build output
- `npm run lint` runs ESLint
- `npm run typecheck` runs Next type generation and TypeScript checks
- `npm run test` runs the test suite
- `npm run build` creates a production build

## Data Scripts

These scripts use the Supabase environment variables above:

- `node migrate.mjs`
- `node seed-pokemon.mjs`
- `node seed-archetypes.mjs`
- `node backfill-deck-lists.mjs`
- `node sync-mega-pokemon-forms.mjs`
- `node audit-pokemon-options.mjs`

## Notes

- Do not run `npm run build` at the same time as `npm run dev`; both write to `./.next`.
- The app uses Google OAuth through Supabase, so login will not work until the redirect URLs and provider settings are configured.
