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

The isolated app runs at `http://localhost:3010`, alongside the normal watchdog-managed app on port `3000`. It uses the ignored `.next-e2e` build directory so the two development servers do not share a Next.js lock or cache. Supabase Studio is available at `http://127.0.0.1:54323`. Local Storage is enabled for avatar upload verification; image transformation remains disabled. The browser state is saved to `.agent-browser/pokenotes-e2e-auth.json` and is valid only for localhost port `3010`.

The setup command writes ignored, mode-`0600` credentials to `.env.e2e.local`. Do not print, copy into documentation, or commit that file.

## Routine use

For the complete Battle Log import check, run:

```bash
npm run e2e:local:import
npm run e2e:local:import -- --expired-session
```

Each command owns port `3010`, so stop `dev:e2e` first. Each resets the synthetic database, starts the isolated app, signs in through the local pairing form, and checks paste, review, deck correction, Save, reload, persisted match notes, catalogue learning, and recognition in the next review. It requires exactly one save request and one new Battle Log. The second review is abandoned and must not create another log. The expired-session variant keeps a valid refresh token, expires the browser's access token before opening the import dialog, proves the deck-options request refreshes the session and loads the synthetic Deck List, and saves a Battle Log linked to that list. The Database behavior CI job runs both variants after its local Supabase reset and database checks.

The same journey continues from the saved Battle Log into **Replay battle**, checks source-action fidelity, omitted unavailable counts, internal-only reconstruction diagnostics, Action/Turn controls, Play/Pause, scrubbing, reload position and return navigation. The authenticated variant also checks existing text-ID logs, the Beta menu label in expanded/collapsed/mobile navigation, desktop/panel/mobile light and dark layouts, card-preview and discard-dialog focus restoration, bounded picker pages, unsupported/empty states and unauthenticated/other-owner access. Its additional rows and account are synthetic, created only inside the fixed local database, and removed before the four-log persistence assertion. Review captures go to ignored `.impeccable/review/`; this extends the existing journey rather than introducing another executed browser case.

On a new machine, install the pinned Playwright browser once after `npm ci` with `npx playwright install chromium`. The runner uses a fresh browser session each time, so expired saved auth does not require manual repair. Playwright resolves the current controls and waits for visibility, position and navigation; no snapshot references, forced clicks or fixed click delays are used. The expired-session variant changes only the synthetic auth cookie, not application data. Each checkpoint has a bounded wait and the command exits nonzero on failure. Do not run builds or type generation against the same checkout while the browser journey is active.

The runner closes its browser and app afterward. It leaves the synthetic database available for inspection and prints a local server-log path on failure; the next run resets it again. It accepts no hosted target or credentials, changes no production application code, and adds no wait to user imports. Timings printed by the runner are local workflow diagnostics, not production performance evidence.

In GitHub Actions, **Database behavior** runs both import journeys for application,
shared UI, library, schema, fixture, and runtime configuration changes. The check
remains present on every PR; documentation-only changes can skip its expensive
steps. The weekly schedule and manual workflow dispatch run the full synthetic
gate without path filtering. Its read-only GitHub token and disposable local
database do not require production secrets. Each journey resets its fixtures.

On browser failure, the runner writes the failed checkpoint and sanitized server
log/ARIA snapshot to ignored `.agent-browser/import-check/<variant>/`. CI uploads
only those three diagnostic files for three days, including failures during
preflight when a browser cannot launch. Environment keys, pairing codes,
passwords, signing secrets, JWTs, and credential lines are redacted. Cookies,
storage-state files, raw traces, and network archives are not uploaded. Treat the
check as passed only when both journey commands and database checks complete;
an uploaded artifact or a skipped browser step is not browser execution evidence.

Reset before a full browser run or whenever a previous run mutated fixture state:

```bash
npm run e2e:local:reset
```

After the CLI reset completes, the local runner waits up to 45 seconds for a
read-only `profiles` request to confirm PostgREST has reloaded the schema before
seeding. Missing-schema/cache and temporary gateway failures are polled; permission
errors fail immediately. Fixture writes are never retried after a partial seed.

A reset replaces the auth user and invalidates the previous browser session, but preserves the local password and pairing code so a running E2E app remains usable. Run `npm run auth:e2e:save` again after every reset.

For the two-player profile and friendship journey, run `npm run e2e:local:social`.
It owns port `3010`, resets the synthetic database, and checks automatic profile discovery,
preset/custom avatar persistence and upload retry, three ordered favourite artworks,
requests, incoming request notifications, acceptance, shared Battle Log totals,
optional last login, and removal. It creates a second synthetic account and
deletes that account in cleanup. Artwork search and image checks use the public
Limitless provider, so that provider must be available. Desktop and mobile
review captures are written to the ignored `.impeccable/review/` directory.
Stop `dev:e2e` before running it; the runner closes its browser and app afterward.

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
