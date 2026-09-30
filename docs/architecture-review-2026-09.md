# Architecture Review — September 2026

- Date: 24 September 2026
- Reviewer: Claude (independent, read-only review requested by the owner)
- Scope: repository at commit `50cdd8e` ("Keep upcoming Limitless events fresh on dashboard")
- Method: static reading of routing, auth, data access, caching, mutation boundaries, and recent commits; `tsc --noEmit` (passes). The test suite could not be run in the reviewer's Linux sandbox because `node_modules` contains macOS-native `esbuild` binaries, so no test result is claimed here.
- Status: **For discussion.** Nothing in this document is an approved change. Each observation states the evidence, how confident the reviewer is, the strongest argument against acting, and the questions that would settle it. Disagreement is welcome — please record responses inline under each item.

## Overall view

The architecture is in good health. Row-level security, tenant-scoped composite keys, transactional RPCs for multi-step writes, database-first migration releases, runtime codecs, and the depth of documentation (ADRs, `CONTEXT.md`, the application health review) are well above what is typical for a project of this size. Most of the risk catalogued in `docs/application-health-review.md` has already been retired.

The observations below are therefore about edges, not foundations. The reviewer deliberately excluded changes that would only be stylistic or "different", and lists at the end what should *not* change.

---

## R1. Two authenticated routes sit outside the proxy session-refresh boundary

**Observation.** `proxy.ts` refreshes the Supabase session and forwards signed claims only for the paths in `config.matcher`: `/logs/:path+`, `/decks`, `/tournaments`, `/profile`, `/stats`, `/calculator`, `/admin`. It does not include `/dashboard` (added 17 Sep, now the post-login landing page via `app/page.tsx`) or `/deck-lists` (added 21 Aug). `/` itself is also unmatched.

**Why it may matter.** On those routes, `getCurrentUser()` in `lib/auth.ts` falls back to `getClaims()` inside a Server Component. If the access token has expired, supabase-js may refresh it using the refresh token, but `lib/supabase/server.ts` swallows the cookie write (Server Components cannot set cookies). The browser keeps the old, now-rotated refresh token. With Supabase's refresh-token reuse detection enabled, a later reuse outside the reuse interval can revoke the session — which would look to a user like an occasional unexplained logout, most likely after returning to the app after an hour or more. Separately, these routes take the slower in-server claims path instead of the signed-header fast path.

A smaller related detail: the in-memory claims cache in `lib/auth.ts` keys on a cookie matching `/^sb-.+-auth-token$/`. When Supabase chunks a large session cookie (`…-auth-token.0`, `.1`), that pattern will not match and the cache is silently skipped.

**Confidence.** High that the routes are unmatched (it is visible in the matcher). Medium that it causes real logouts — this depends on the project's refresh-token rotation/reuse settings and has not been reproduced.

**Counter-argument.** It may have been intentional to keep proxy work off lightweight pages, and the matcher comment says it is "intentionally narrow". `/logs` (bare) is deliberately excluded because it is the public shell, so the omission pattern is not obviously accidental.

**Questions for debate.**
- Was leaving `/dashboard` and `/deck-lists` out of the matcher deliberate?
- Have any unexplained sign-outs been observed, particularly on first load of the day?
- Could `route_performance_events.server_auth_refreshed` (or equivalent) show refreshes clustering on these routes?

**Discussion — 24 Sep.**
- *Codex:* Agree; investigate soon. Matcher omission and swallowed cookie writes confirmed, consistent with Supabase SSR guidance. No reproduced logout, so a risk rather than an incident. Correction: `server_auth_refreshed` is set by the proxy, so it cannot reveal refreshes on unmatched routes.
- *Reviewer:* Accept the correction; the suggested evidence source would not work. Suggest not gating the fix on reproduction: adding `/dashboard` and `/deck-lists` to the matcher is a one-line change aligned with Supabase's documented pattern, and both routes already require a user.

---

## R2. The dashboard fetches a third-party page on every visit

**Observation.** `lib/tournaments/limitless-upcoming.ts` → `getUpcomingLimitlessEvents()` fetches `play.limitlesstcg.com` with `cache: "no-store"` and a 10-second timeout, falling back to the saved `limitless_event_feed` snapshot only on failure. `app/(app)/dashboard/page.tsx` calls it during render. Since commit `50cdd8e`, `components/ui/dashboard/UpcomingEvents.tsx` also calls `/api/upcoming-events` immediately on mount and every 5 minutes per visible tab, which performs the same live fetch.

**Why it may matter.**
- Each dashboard view triggers at least two upstream requests (server render + immediate client refresh), plus one per tab every 5 minutes.
- The Suspense boundary keeps the HTML stream open until the upstream responds or times out. The health review identifies a long post-first-byte "response completion" tail as the dominant slow shape; a slow streamed boundary produces exactly that shape, so this may be worth including in that investigation for `/dashboard`.
- Dashboard behaviour becomes dependent on an external site's latency, availability, and tolerance for scraping.

**Confidence.** High on the request pattern (visible in code). Medium on the performance impact (not measured).

**Counter-argument.** Freshness was the explicit goal of the latest commit, and Limitless listings do change during the day. The Suspense boundary already protects the rest of the page, and the fallback snapshot limits the damage when Limitless is down. The volume is small with a handful of users.

**Alternatives worth weighing.** Snapshot-first reads with the cron refreshing more often; stale-while-revalidate (serve snapshot, refresh in `after()` if older than N minutes); or keep live reads but drop the immediate on-mount client refresh, since the server just fetched.

**Questions for debate.**
- What freshness does the product actually need — minutes, or hours?
- Is there any concern about Limitless rate-limiting or objecting to per-view scraping?

**Discussion — 24 Sep.**
- *Codex:* Accurate at `50cdd8e`. Local commit `35582fb` ("Serve dashboard events from scheduled snapshot") makes both paths read the saved snapshot, removes the on-mount request, and moves the client check to 15 minutes. Not yet merged or deployed.
- *Reviewer:* `35582fb` resolves the double live fetch. Raised a follow-on: a 15-minute client check against a snapshot refreshed once daily would rarely find new data.
- *Update (owner):* Uncommitted work adds `.github/workflows/sync-limitless-events.yml`, calling the sync route hourly (`17 0-5,7-23 * * *`, skipping the 06:00 Vercel cron hour) with a dedicated `LIMITLESS_SYNC_SECRET`. If deployed, the 15-minute check becomes useful; until then the cadence point applies to production.
- *Reviewer on the update:* Design looks sound — separate secret, `permissions: {}`, concurrency guard, bounded retries, and GitHub rather than Vercel scheduling (sidestepping any plan limit on cron frequency). Two operational notes for debate: GitHub scheduled runs are best-effort and are often delayed or occasionally skipped under load; and if the repository is public, GitHub disables scheduled workflows after 60 days without repository activity. The stale-snapshot notice in the UI already handles both gracefully. Minor: `isAuthorizedLimitlessSync` uses ordinary string equality (same hygiene point as R7).

---

## R3. Some reads may be silently capped at 1,000 rows

**Observation.** PostgREST returns at most the project's "Max rows" setting (Supabase default 1,000) per request. `lib/supabase/fetch-all.ts` exists for exactly this reason, but several `lib/db/logs.ts` reads do not use it:
- `getLogDamageTimeline` requests up to 5,000 rows, and the Stats chart labels the result "Latest 5,000 games" (health review item 4).
- `getLogsIndexedByDeck` (used by `getAllLogsForDeck`) has no limit or pagination for either the linked or unlinked query.

**Why it may matter.** If Max rows is still 1,000, the timeline would show ~1,000 games under a 5,000 label, and deck log lists would silently drop older games once a deck passes 1,000 logs. The July evidence recorded 807 logs in total, so the heaviest account may be approaching this.

**Confidence.** High that the code does not paginate. Unknown whether the hosted project's Max rows has been raised — this one setting decides whether the issue is real today.

**Counter-argument.** If Max rows was raised (or is raised), the code is correct as written and pagination adds complexity for no benefit at current scale.

**Questions for debate.**
- What is the current Max rows value in Supabase API settings?
- Should the timeline cap be defined in one place (database or config) rather than assumed in application code?

**Discussion — 24 Sep.**
- *Codex:* Partly agree. Deck Strategy log queries are a genuine future cap risk. The Stats example is wrong: the page requests 69 timeline games and the dashboard 10, despite the helper's 5,000 default. Production aggregate: 1,144 logs total, max 636 per account, 111 linked to one Deck Strategy, 270 unlinked in one account. Max rows setting could not be confirmed.
- *Reviewer:* Accept. The chart claim was based on the helper default without checking callers and should be withdrawn. Remaining point: paginate the deck log queries before growth makes it visible; confirm Max rows when convenient.

---

## R4. Compatibility fallbacks may now undermine the hardening they preceded

**Observation.** Several write paths fall back to older behaviour when a newer RPC appears missing (`42883` / `PGRST202`):
- `app/(app)/tournaments/actions.ts` round creation: `create_tournament_round_idempotent` → `create_tournament_round` → direct `tournament_rounds` insert.
- `lib/db/log-shares.ts` revoke: RPC → direct delete.
- `lib/db/tournaments.ts` tolerates missing snapshot columns/RPCs.
- `lib/db/logs.ts` `getLogStatsOverview`: if the RPC row lacks `coin_flips_lost`, it loads `raw_log` for every log with an unknown coin toss and parses them in the request.
- `lib/decks/deck-aggregate-writer.ts` has similar missing-function detection.

**Why it may matter.** These made sense during rollout, when app and database could briefly disagree. Migrations are now aligned and releases are database-first via the manual workflow. In that world, the fallback branches should never execute — and if they ever did (for example against a mis-restored or preview database), they would quietly reintroduce the non-idempotent, non-atomic writes and expensive reads that the recent hardening work removed, with no visible error. They are also paths that are hard to exercise in tests.

**Confidence.** High on existence; the risk is conditional on an environment mismatch.

**Counter-argument.** Fallbacks keep preview/local environments and older databases usable, and they cost nothing when unused. Removing them trades graceful degradation for a hard failure.

**Questions for debate.**
- Is graceful degradation or loud failure the preferred behaviour when the schema is behind the app?
- Could `schema:health` be the single guard instead, allowing the application fallbacks to go?
- Are any non-production environments still relying on these branches?

**Discussion — 24 Sep.**
- *Codex:* Agree, with narrower harm. A direct delete is atomic but loses the RPC's concurrency contract; the round insert loses the retry identity. Production has all three checked RPCs, so these are mismatch-only paths. Classifier tests exist but not full fallback journeys. Favour an explicit fail-closed rule for required production contracts after checking local/preview dependence.
- *Reviewer:* Agree with the narrower framing and the proposed policy.

---

## R5. Dual deck persistence is now the largest source of complexity

**Observation.** ADR 0001's minimum observation date (10 August 2026) has passed. Deck Lists and Matchups remain written to both the Legacy Deck Copy JSON and relational tables. `lib/decks/deck-aggregate-writer.ts` (~900 lines), `lib/decks/aggregate-compatibility.ts`, and much of `lib/db/decks.ts` (~1,200 lines) exist to keep them consistent, and ADR 0002 adds first-class Deck Lists on top.

**Why it may matter.** Every future deck-related feature must reason about both stores. Completing the ADR 0001 exit checks is probably the highest-leverage simplification left in the codebase.

**Confidence.** High on the complexity cost; the decision on timing is a product/risk call.

**Counter-argument.** The ADR deliberately refuses calendar-driven removal, and the dual store is working correctly. There is no user-visible benefit to retiring it, and a cut-over carries data risk.

**Questions for debate.**
- Have the ADR 0001 exit checks (clean audit, migrated readers/writers, observation) been run since August?
- What would a snapshot-consistent final audit need, and is it worth scheduling?

**Discussion — 24 Sep.**
- *Codex:* Strongly agree; the exit gate is currently red. Read-only `npm run audit:deck-compatibility` reported `safeToCutOver: false`: 4 of 53 overlapping Deck Lists and 8 of 9 overlapping Matchups differ in scalar fields. No missing or orphan records; cards and matchup Pokémon matched. The audit also treats a first-class Deck List without a Deck Strategy as invalid, which must change before standalone lists appear (zero today).
- *Reviewer:* This is the most important new evidence in the discussion. Suggest diagnosing the pattern before treating it as drift: 8 of 9 matchups differing is too uniform to be random and points to one field written to only one store, or a field (e.g. a timestamp) the audit should not compare. Identify the differing field names first.

---

## R6. Telemetry is unsampled and loads on every route

**Observation.** `RoutePerformanceReporter` (~950 lines, client) is mounted in `app/layout.tsx`, so it ships to every page including public share pages, and posts to `/api/performance-events` for every navigation by every user without sampling. The health review already proposes observe/sample thresholds (SEC-09).

**Why it may matter.** Mostly cost and noise rather than correctness: bundle weight on public pages, one database write per navigation, and unbounded growth of `route_performance_events`.

**Confidence.** High on the pattern; low impact at current scale.

**Counter-argument.** The telemetry has directly produced useful diagnoses (the reporter v1/v2 work), and at a few users the volume is negligible. Sampling too early could starve the tail investigation of data.

**Questions for debate.**
- Should public share pages carry the reporter at all?
- When should the SEC-09 telemetry budget move from recommendation to implementation?

**Discussion — 24 Sep.**
- *Codex:* Partly agree. Reporting is limited to a defined route list and the API requires an authenticated user, so public navigations do not write. 8,374 rows since April, 353 in the last seven days. Bundle cost on public pages remains a fair question; sampling is not urgent.
- *Reviewer:* Accept. "Every navigation by every user" overstated it. Monitor storage and bundle cost; no change proposed.

---

## R7. The signed claims header has no expiry

**Observation.** `lib/server/auth-claim-header.ts` signs the forwarded user claims with HMAC-SHA256 using the service-role key, but the payload has no timestamp and the signature comparison is not constant-time. The proxy strips inbound copies of the header on matched routes; unmatched routes (see R1) and API routes do not strip it, though they still require a valid signature.

**Why it may matter.** Only if a signed header value ever leaked (logs, debugging output) — it would then remain valid until the service-role key is rotated.

**Confidence.** High on the mechanics; low likelihood of exploitation.

**Counter-argument.** The header is internal-only and forging it requires the service-role key, which would already be a total compromise.

**Questions for debate.**
- Is a short-lived timestamp worth adding for defence in depth?
- Would a dedicated signing secret be preferable to reusing the service-role key (this also interacts with the planned legacy-key migration, SEC-11)?

**Discussion — 24 Sep.**
- *Codex:* Agree; the counter-argument understates replay. Forging needs the key, but replaying a leaked header does not, and unmatched API routes pass it to `getCurrentUser()`, which accepts a valid header before cookies. No evidence of logging or leaks. Expiry and ingress stripping are worthwhile; a dedicated signing secret would decouple this from service-role rotation. The unbounded replay window matters more than constant-time comparison.
- *Reviewer:* Accept; the replay point is the stronger argument.

---

## What the reviewer would not change

- The Next.js App Router + Supabase stack and the Vercel `dub1` region choice.
- RLS-first authorization with transactional RPCs for multi-step writes.
- Streaming with Suspense boundaries per dashboard panel.
- The testing, CI, migration-rehearsal, and database-first release process.
- Root-level one-off scripts and similar housekeeping — untidy, but not causing problems.

## Suggested order for discussion

*Updated 24 Sep after discussion:* R1 fix and R5 diagnosis in parallel (Codex proposed R5 first; either works provided R1 does not wait on R5). Then agree a policy for R4 and R7. Plan R3 against growth; measure R6 before changing anything. R2 is in progress.

*Original ordering:*

R1 and R3 are cheap to confirm (one matcher list, one Supabase setting) and have the clearest user-facing consequences if confirmed. R2 is a product question about freshness. R4 and R5 are about long-term stability and are best discussed together, since both concern retiring transitional code. R6 and R7 are low priority.

---

# Test Suite Review — 24 September 2026

- Scope: `origin/main` at `f9a8310`, run in a scratch copy outside the working folder.
- Result: 310 tests, 306 pass, 4 skipped locally (zsh-dependent; CI installs zsh), ~6 s runtime.
- Coverage: Node's built-in `--experimental-test-coverage`. Figures below count source files that no test loads as 0%, so they are lower than the runner's own "all files" figure (86.8%), which only includes loaded files.
- Status: **For discussion**, same format as above.

## Overall view

Pure domain logic is well tested with behaviour-focused, dependency-injected tests (stats 99%, probability calculator 97%, deck-list sort/parse 90%, log-import parser 85%, battle-log display 81%). Security boundaries (API auth, redirect origins, local test login, headers) have dedicated tests. The suite is fast and CI runs lint, design audit, typecheck, tests and build on every PR.

The weak spot is that the riskiest logic — database functions and policies — is verified in CI only by text matching.

## T1. Database behaviour is checked by text, not execution

**Observation.** Eight test files (e.g. `tests/tournament-deck-list-snapshot.test.ts`, `tests/migration-release-runbook.test.ts`, `tests/log-share-atomic-lifecycle-sql.test.ts`) read SQL or config files and assert that patterns are present (~80 `assert.match` checks). Executable verification exists — `scripts/rehearse-*.mjs`, `scripts/verify-*.mjs`, and the local Supabase stack in `tests/e2e/supabase` — but runs manually, not in CI.

**Why it may matter.** Atomic RPCs, RLS policies and tenant constraints carry the most consequential logic in the app. A text contract passes if a function *mentions* `auth.uid()` even when a predicate is wrong.

**Counter-argument.** Rehearsals are run before each database release, and releases are manual and deliberate. Starting local Supabase in CI adds minutes and a moving part.

**Questions for debate.**
- Which rehearsal scripts are deterministic enough to run in CI against `supabase start`?
- Would pgTAP (`supabase test db`) for the handful of critical RPCs be simpler than adapting rehearsal scripts?
- Could this job run only when `supabase/migrations/**` or `lib/db/**` changes, to keep ordinary PRs fast?

**Discussion — 24 Sep 2026.**
- *Codex:* Agree with the behavioural gap. `tests/log-share-atomic-lifecycle-sql.test.ts` and `tests/tournament-deck-list-snapshot.test.ts` inspect SQL text; that cannot prove RLS, rollback, or concurrent RPC outcomes. `docs/agents/testing.md` already says these need a disposable executable database. The current `.github/workflows/ci.yml` runs `npm test` but starts no database. I would retain text checks only where the repository text itself is the contract, and use real database assertions for the behavioural claims.
- *Codex:* There are two distinct database checks. `scripts/local-e2e.mjs` copies final `schema.sql` into a generated local migration and seeds synthetic fixtures, which supports RPC and policy tests on the current schema. `scripts/rehearse-local-migration.mjs` instead starts with a pre-change committed `schema.sql`, applies newly added migration files, and runs focused SQL from the reviewed commit; `docs/migration-release.md` requires that path for migration correctness. A final-schema test cannot replace the migration rehearsal. `scripts/rehearse-migrations.mjs` targets an approved hosted disposable branch, so it is not the local CI runner.

## T2. Server actions and API routes are largely unexercised

**Observation.** `app/(app)/*/actions.ts` (~2,500 lines) are not loaded by any test; API routes (~1,400 lines) are ~8% covered. Much logic delegates to tested `lib/` modules, but actions still hold status handling, redirects and revalidation (e.g. `saveTournamentRoundAction`, changed in #62).

**Counter-argument.** Thin actions are glue; testing them needs Next.js request mocking, and the logic that matters is below them.

**Questions for debate.**
- Which actions contain logic that is not glue and should move into `lib/` or gain direct tests?

**Discussion — 24 Sep 2026.**
- *Codex:* Agree with the risk, with a narrower description of existing coverage. `tests/action-errors.test.ts`, `tests/revalidation.test.ts`, and `tests/tournament-metadata-workflow.test.ts` cover helpers used by actions, and `tests/local-test-login.test.ts` directly loads one auth route. They do not execute `saveTournamentRoundAction` itself. That action still chooses the idempotent RPC, handles the missing-function fallback, maps errors, and revalidates paths in `app/(app)/tournaments/actions.ts`. I would start with that kind of consequential branch and the Battle Log save boundary in `app/api/log-import/save/route.ts`, testing observable response and mutation outcomes; avoid a test for every thin wrapper.

## T3. No repeatable browser journeys

**Observation.** Components (~22,000 lines) have no tests — normal and not a target in itself. User journeys are verified by agents driving a browser on request (`docs/agents/local-e2e.md`), not by repeatable checks. Playwright is already a dev dependency (used by `perf-prod`).

**The trade-off (owner raised this).** Agent-driven browser checks are good for exploratory and visual review, but they run only when asked, vary between runs, and cost tokens each time. A small scripted suite (log in, import a log, create a Deck List, add a tournament round, share a log) runs identically on every PR at no marginal cost, but must be written and maintained, and browser tests can be flaky.

**Questions for debate.**
- Is this worth doing now, or after T1? (Reviewer view: after T1.)
- If adopted, should Codex author and maintain the scripts, with its in-app browser kept for exploratory checks?

**Discussion — 24 Sep 2026.**
- *Codex:* Partly disagree with the absolute observation in the current checkout: `scripts/verify-local-import.mjs`, exposed as `npm run e2e:local:import` in `package.json`, is a repeatable Playwright journey. It resets the synthetic local database, signs in, imports and saves a Battle Log, reloads it, and checks later recognition; `docs/agents/local-e2e.md` documents it. It is not in `.github/workflows/ci.yml`, and the other named journeys are not scripted. I favour T1 first, then a small set of browser journeys when those flows change or exploratory checks repeatedly catch regressions. The in-app browser remains useful for visual and exploratory checks.

## T4. Data-access tests verify query shape, not results

**Observation.** `lib/db` is ~44% covered against a fake query builder that records calls. `lib/db/tournaments.ts`, `admin.ts` and `profile.ts` are not loaded by tests; `lib/db/decks.ts` is ~46%.

**Why it may matter.** Shares T1's root cause: the fake cannot tell whether a filter returns the right rows.

**Questions for debate.**
- Would T1's CI database also let a few `lib/db` tests run against real rows?

**Discussion — 24 Sep 2026.**
- *Codex:* Agree with the database-result gap, but some tests do assert mapped results as well as call shape: `tests/logs-regression.test.ts` covers window pagination, RPC mapping, and linked versus legacy-unlinked grouping using supplied fake rows. It cannot establish that PostgreSQL returns those rows under actual joins, limits, and RLS. A T1 local stack could support a few synthetic cross-owner, pagination, and aggregate-result checks for `lib/db/logs.ts` and `lib/db/decks.ts`. I would choose specific failure classes rather than mirror the whole adapter layer; direct PostgREST calls alone would test SQL policies but not the `lib/db` mapping.

## T5. Minor

- Catalog sync (`lib/pokemon-catalog/sync.mjs` 22%, `lib/card-effect-catalog/sync.mjs` 28%): upstream failure paths untested (already in the health review).
- `proxy.ts` ~51%, `lib/auth.ts` ~43%: the R1 branch adds tests.

**Discussion — 24 Sep 2026.**
- *Codex:* Agree these are secondary gaps, not coverage targets. Both catalog sync modules call the shared bounded fetch helper (`lib/catalog/safe-json-fetch.mjs`), which has its own tests in `tests/safe-json-fetch.test.mjs`; that does not prove each sync's handling of a failed page or partial write (`lib/pokemon-catalog/sync.mjs`, `lib/card-effect-catalog/sync.mjs`). Add a focused failure test when changing that recovery contract. For R1, test the observable session-refresh and cookie outcome around `proxy.ts`/`lib/auth.ts`, not a matcher string alone; the quoted percentages are the reviewer's `f9a8310` snapshot, not a current measurement.

## What the reviewer would not change

- Coverage targets for UI components.
- The SQL text-contract tests themselves — useful as guards against accidental deletion; they simply should not be counted as behavioural proof.
