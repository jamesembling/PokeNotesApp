# Local Browser-Test Database

Use the dedicated local Supabase stack for authenticated, state-changing browser journeys. It is resettable, isolated from every hosted Supabase project, and populated only with synthetic records.

This is the default environment for the Battle Logs, Deck Strategies, Tournaments, Stats, Probability Calculator, and Profile browser flows. It can also host the synthetic migration rehearsal in `docs/migration-release.md`. Browser journeys and resets from the final schema do not replace applying the actual migration to the pre-change schema or running focused module tests.

## Safety boundary

- Run the committed `e2e:local:*` commands. They always pass the fixed `tests/e2e` workdir and never use `--linked`.
- The seed refuses to run unless `POKENOTES_E2E_LOCAL=1` and the API URL is exactly localhost or `127.0.0.1` on port `54321`.
- Do not point `.env.e2e.local`, the seed script, or the local commands at a hosted project.
- Do not copy production users, profiles, logs, notes, tournaments, decks, or auth records into test fixtures.
- Prefer synthetic catalogue rows. If a production-only catalogue edge case is required, recreate the smallest non-personal row by hand and document its public provenance; never import a production dump.

## First setup

Prerequisites are Docker Desktop running and repository dependencies installed with `npm ci`.

```bash
npm run e2e:local:setup
npm run dev:e2e
```

In another terminal, save an authenticated agent-browser state:

```bash
npm run auth:e2e:save
```

The isolated app runs at `http://localhost:3010`, alongside the normal watchdog-managed app on port `3000`. It uses the ignored `.next-e2e` build directory so the two development servers do not share a Next.js lock or cache. Supabase Studio is available at `http://127.0.0.1:54323`. The browser state is saved to `.agent-browser/pokenotes-e2e-auth.json` and is valid only for localhost port `3010`.

The setup command writes ignored, mode-`0600` credentials to `.env.e2e.local`. Do not print, copy into documentation, or commit that file.

## Routine use

Reset before a full browser run or whenever a previous run mutated fixture state:

```bash
npm run e2e:local:reset
```

A reset replaces the auth user and invalidates the previous browser session, but preserves the local password and pairing code so a running E2E app remains usable. Run `npm run auth:e2e:save` again after every reset.

Other lifecycle commands are:

```bash
npm run e2e:local:start
npm run e2e:local:status
npm run e2e:local:stop
```

`start` refreshes the generated local baseline from the committed `schema.sql`. The generated migration and Supabase runtime state live below `tests/e2e/supabase/` and are ignored. The production migration ledger in `supabase/migrations/` is not changed or replayed by this workflow.

## Fixture contract

Each reset creates one confirmed synthetic account, `e2e@pokenotes.local`, with stable application IDs:

| Area | Stable fixtures |
| --- | --- |
| Profile | E2E Trainer, PTCGL username `E2ETrainer`, known activity metadata |
| Deck Strategies | `e2e-deck-dragapult`, `e2e-deck-spare` |
| Deck Lists | attached `e2e-list-attached`, standalone `e2e-list-standalone` |
| Matchups | `e2e-matchup-charizard` |
| Tournament | `e2e-tournament-local-cup` with round `e2e-round-1` |
| Battle Logs | two wins and one loss across Charizard and Gardevoir matchups |
| Stats | trigger-built overview, deck, and matchup aggregates from the three logs |
| Catalogue | minimal Dragapult, Munkidori, Charizard, and Gardevoir evolution lines |

Reusable import inputs live in `tests/e2e/fixtures/`: a valid deck list, a valid battle log, and a deliberately invalid battle log. The data is intentionally small but varied enough for selectors, list/tile views, linked-log filtering, bulk edits, match notes, stats tabs, and destructive flows.

## Adding fixture data

Add a fixture only when a browser journey needs a distinct state that cannot be created cheaply inside the journey. Prefer a second value inside an existing record family over a new fixture family. Keep IDs stable, names visibly synthetic, timestamps fixed, and the seed assertions aggregate-level.

Do not turn the seed into a replica of production. The reset should stay fast, readable, and punchy.

## Completion evidence

Before reporting this environment as healthy:

1. Run `npm run e2e:local:reset` successfully.
2. Confirm the seed reports 2 decks, 2 lists, 1 matchup, 1 tournament, 1 round, and 3 logs.
3. Start with `npm run dev:e2e` and save auth with `npm run auth:e2e:save`.
4. Open an authenticated page on port `3010` using the saved state and confirm it does not redirect to `/login`.
5. Run the normal lint, typecheck, and test gates for repository changes.

If fresh setup exposes a difference between `schema.sql`, generated types, and the migration ledger, stop and reconcile the drift. Do not patch around it only in the seed.
