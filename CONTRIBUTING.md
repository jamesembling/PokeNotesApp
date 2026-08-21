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

## Test Strategy

Tests protect durable behavior through the narrowest observable production seam. Add a case when it covers a distinct failure class, boundary, state transition, permission, or integration—not merely because a review comment or implementation branch exists.

- Extend the existing behavior-owned file when that seam already has coverage. Create a new file only for a genuinely new subsystem or test level.
- Name files and cases after product behavior or production seams. PR numbers, issue numbers, review rounds, fixes, corrections, and implementation phases belong in Git history rather than test names.
- Use source-text assertions only when text is the real contract, such as configuration, generated artifacts, migration ledgers, or workflow policy. UI behavior requires rendered interaction or browser evidence; database behavior requires an executable database boundary.
- Before opening a pull request, inspect the test delta for duplication, temporary review artifacts, superseded cases, and tests that can pass without the claimed behavior.

The complete admission, placement, evidence, and consolidation rules are in [the testing guide](./docs/agents/testing.md).

Authenticated, state-changing browser checks use the resettable synthetic Supabase environment, not a production-backed account. Follow [the local browser-test database guide](./docs/agents/local-e2e.md); `npm run e2e:local:reset` restores the known fixture state.

## Git Hooks

This repo uses tracked hooks under `.githooks/`. Install them for a checkout with:

- `npm run hooks:install`

The hooks run targeted regression checks for protected deck-list ordering paths,
read-model routes, and SQL/data changes. They do not connect to or mutate the
production database.

Create every new schema change under `supabase/migrations/` with the Supabase CLI.
The older `sql/` directory is historical and does not accept new migrations. Follow the
[migration release path](./docs/migration-release.md) for local or isolated rehearsal,
review, and the manually dispatched production workflow after merge to `main`.

## Pull Requests

- Link the issue or context for the change when possible.
- Describe what changed and why.
- Mention any follow-up work, schema updates, or environment changes needed for review.
