# Contributing

Thanks for helping improve Poke Notes.

## Before You Start

- Install Node.js 20.9 or newer.
- Run `npm ci`.
- Create a local env file with `cp .env.example .env`.
- Fill in the Supabase and app URL values described in the README.
- Start the app with `npm run dev`.

## Working in the Repo

- Keep changes small and focused.
- Do not commit secrets, `.next`, or other local build output.
- If you change auth, data, or migrations, call it out clearly in your PR.
- For UI changes, include a screenshot or a short note about the user-facing impact.

## Checks

Before opening a pull request, run the relevant checks:

- `npm run lint`
- `npm run typecheck`
- `npm run test`

If your change touches production behavior, also run `npm run build` when practical.

## Git Hooks

This repo uses tracked hooks under `.githooks/`. Install them for a checkout with:

- `npm run hooks:install`

The hooks run targeted regression checks for protected deck-list ordering paths,
read-model routes, and SQL/data changes. On push, changed `sql/*.sql` files are
deployed to the linked Supabase project before the push continues. Successful
deployments are tracked in `codex_private.sql_deployments` by file path and
SHA-256 hash, so unchanged SQL is not re-applied.

## Pull Requests

- Link the issue or context for the change when possible.
- Describe what changed and why.
- Mention any follow-up work, schema updates, or environment changes needed for review.
