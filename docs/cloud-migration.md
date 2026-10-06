# PokeNotes cloud migration

Started 30 September 2026. James requested that Codex and Claude manage this migration together.

## Objective and ownership

Make the laptop optional for development and recurring maintenance while preserving browser, database and release verification. The production app stays on Vercel and Supabase.

Codex coordinates implementation, checks the actual cloud environment and GitHub evidence, and updates this plan. Claude independently reviews portability, coverage gaps and milestone boundaries in the private **PokeNotesV2 cloud migration review** session started 30 September 2026. James retains decisions about production access and merges; this kickoff does not authorize production settings changes or deployment.

## Verified starting point

- The local checkout is `main` at `4df5c90b1f5176c7ee577578a19ff4b966e6649f`, matching live GitHub `main` at kickoff. The working tree was clean.
- [CI on that commit](https://github.com/jamesembling/PokeNotesApp/actions/runs/36682893972) passed lint, design audit, typecheck, Node tests and build. Its Node result was **312 discovered, 311 passed, 1 skipped, 0 failed**. The skipped case was **Authenticated requests refresh sessions before reading account data**; cloud parity must match that identity as well as the counts.
- [Database behavior on that commit](https://github.com/jamesembling/PokeNotesApp/actions/runs/36682894064) passed. The committed workflow does not yet invoke the full Playwright import journey.
- [PR #69: Run local import journeys in CI](https://github.com/jamesembling/PokeNotesApp/pull/69) is open and draft, at `758c461258bc425db15616265f45f06c1a05e264`, with merge conflicts. Its historical green runs do not validate it against current main.
- The new Codex Cloud environment creation flow is available to James. GitHub is already connected and `jamesembling/PokeNotesApp` is selectable. A private setup task, **Set up PokeNotesApp**, has been started.
- Only `pokenotes-catalog-release` is tracked under `.agents/skills`. Other local skills, `.codex` hooks, saved browser authentication and the localhost watchdog are not part of a fresh repository clone.

These are dated observations, not promises about future account access, runs or repository state.

## Delivery milestones

| Milestone | Owner | Acceptance gate | Kickoff state |
| --- | --- | --- | --- |
| 1. Cloud development pilot | Codex; Claude reviews | Private, credential-free setup on current main; Node 22, fresh `npm ci`, ripgrep and zsh; lint, design audit, typecheck, tests and build pass; test counts and skipped-case identity match independent CI on the same commit; clean source tree; publish and prove a fresh task starts from the saved setup | Code/build validation passed; editor value-save failure blocks publication and fresh-task proof |
| 2. Browser regression gate | Codex; Claude reviews | Reconcile #69 with current main; cover shared app/component/library changes; preserve redacted failure diagnostics as downloadable artifacts; normal and expired-session journeys pass on the exact proposed head; reuse an observed failure or make a targeted negative control to prove sensitivity and artifact delivery; verify scheduled main execution and measured duration inside the job timeout | Conflict and diagnostic/trigger gaps identified |
| 3. Portable guidance and skills | Codex; Claude reviews | Document the actual cloud/CI split; remove laptop assumptions from the cloud route; decide which local skills should be tracked or installed; resolve dangling skill references; fresh cloud task follows the instructions | Inventory started |
| 4. Recurring maintenance | Codex; Claude reviews | Inventory each active local Codex-app schedule and launchd job, inputs, credentials, outputs and authority; select a supported cloud trigger/executor; verify an actual scheduled run and its saved result before disabling its local equivalent; retain existing cloud Limitless-refresh and database-check schedules | Local automations remain enabled |
| 5. Laptop becomes optional | Codex; James accepts | All migrated lanes have evidence; remaining attended visual, production-login and device checks are explicitly documented; retire local dependencies only after their replacements are proven | Not started |

Milestones 2 and 3 may proceed together after the pilot. Do not make Docker availability inside Codex Cloud a prerequisite for milestone 1: independent GitHub Actions can remain the database/browser executor.

## Testing contract

The independent CI runner checks the same commit produced by cloud development. Keep existing module tests, executable database checks and critical browser journeys. Changing the execution location does not justify dropping a checkpoint or replacing runtime evidence with source-text matching.

The existing `npm run e2e:local:import` journey uses headless Playwright and a disposable synthetic database, checks actual UI actions and persisted results, and requires exactly one saved Battle Log. Preserve those boundaries when moving its execution to GitHub Actions. The expired-session variant exists on #69, not current main.

Native agent browser/computer use and terminal-driven headless Chromium are different capabilities. Official cloud documentation currently lists native computer/browser use as unsupported; probe Chromium, operating-system dependencies, Docker and required image pulls separately before describing them as supported. A working browser process alone does not prove the authenticated journey.

Visual and exploratory review remains an explicit release activity. Import is the only existing full scripted browser journey identified in this kickoff; Deck Lists, Tournaments, sharing, Stats, Calculator and Profile retain coverage gaps. Synthetic sign-in does not prove hosted Google OAuth, deployment redirects or production rendering.

Retain redacted logs and useful screenshots for failures. The current runner writes raw `server.log`; redact it before upload. Trace capture can include pairing-code inputs and session cookies, so leave it disabled until a sanitization or synthetic-credential retention policy is deliberately implemented. Test credentials belong only to the disposable job stack; never include production data or hosted credentials. Prefer existing failure evidence over manufacturing redundant failures. Repeat a check only for a concrete failure, changed state, flake/isolation concern or a required independent gate. Follow `docs/agents/testing.md` when adding cases and report the exact executed-case delta.

## Pilot access and runtime boundary

- Private environment for `jamesembling/PokeNotesApp`; fresh Linux dependencies, not the Mac's `node_modules`.
- Only CI placeholder variables during the initial code/build pilot. No hosted Supabase values, production secrets, personal browser cookies, VPN or production operations.
- Restrict public dependency networking to the package-manager preset and exact additional official download/registry hosts evidenced by failed requests. Verify a denied pull is an allowlist problem before claiming Docker is unavailable.
- A successful image pull is only a dependency probe. Database capability requires the actual pinned Supabase containers, port binding and application-ready services; authenticated browser capability requires the complete synthetic journey.
- Production migrations remain in the controlled GitHub workflow. Read-only production evidence and production mutation are separate future access decisions.
- Publishing reusable setup, starting a fresh task, pushing a branch, passing CI, merging and deploying are separate completion states.

## Review findings and open questions

Claude's independent review agrees with GitHub Actions as the browser regression gate. Reconciled findings:

1. #69's hand-maintained trigger list can miss shared UI and parser changes. Widen its coverage or run the journey on every relevant PR; retain a scheduled main check.
2. Current browser failure diagnostics live in a temporary runner directory and are not uploaded. Make them available remotely before removing local inspection.
3. The local Docker-start instruction, watchdog and personal skill references need a cloud route. A Linux-capable script can still have Mac-specific error wording; assess runtime evidence rather than wording alone.
4. Test parity must include skips: missing zsh can silently skip shell-contract cases.
5. GitHub write/PR capabilities and actual service permissions remain to be proven separately from cloning the repository. Before enabling cloud writes, inspect the effective GitHub connection permissions and production workflow controls, including whether that connection can dispatch workflows. Report gaps without changing permissions or inventing new merge authority. Do not interpret an environment being published as production-release authority.
6. No generic three-run stability requirement: one cloud validation plus independent CI on the same commit is the initial pilot gate. Additional repetition needs evidence of a reliability concern.

## Evidence updates

### 30 September: code gate passed; publication blocked

The cloud setup task ran on the same `4df5c90b1f5176c7ee577578a19ff4b966e6649f` commit as the independent CI baseline. Node **22.23.3**, npm **11.9.0**, ripgrep and zsh were available. `npm ci`, lint, design audit, typecheck, Node tests and production build passed. The suite reported **312 discovered / 311 passed / 1 skipped / 0 failed**, with the same skipped case named above. Executed-case delta: **0**.

Both development and production servers rendered the unauthenticated login shell; the logs-bootstrap API rejected a request without cookies. These checks do not establish authenticated database behavior. Next.js's dashboard redirect appeared in the streamed response rather than an HTTP 3xx; the setup task corrected its initial smoke assertion after inspecting that response.

Docker engine **28.4.0** responded, but the pinned Supabase image request to `public.ecr.aws` remained forbidden after one explained retry. Playwright **1.63.0** Chromium retrieval was denied at `cdn.playwright.dev` and its `storage.googleapis.com` redirect, including the retry. No Supabase container or browser journey completed. Additional domains were removed from the code-only draft; it retains the package-manager preset.

The reviewed install script pins Node/npm outside the repository and runs `npm ci`. The start skill sets harmless CI values, activates the pinned tools, records the code gates and login/API smoke checks, and preserves pre-existing source changes. The editor initially contradicted the task's saved-draft claim; reconciliation populated the expected scripts and placeholders. Saving `NEXT_PUBLIC_APP_URL` then returned **Save unconfirmed**, including one manual retry after inspecting the error. The service says it did not confirm whether that value was stored. The task reported backend draft revision 4, but that readback does not override the editor failure. Publication and fresh-task reuse remain unproven. Keep the prepared private draft; retry or reconcile its value persistence before publication, then prove a fresh task without requiring production credentials. The laptop dependency has not been retired.

The cloud task's final Git checks reported an empty working tree and no staged or unstaged diff. Its three evidence files (`report.md`, `draft-readback.json`, `persistence-discrepancy.json`) and helper scripts are outside the checkout under `/workspace/pokenotes-onboarding`; the native changed-file badge includes those external artifacts. The local coordinating checkout contains only this new plan. Claude's review is complete and available for the browser-CI milestone.

## Sources

- [Official Codex Cloud environment guide](https://learn.chatgpt.com/docs/environments/cloud-environments), checked 30 September 2026.
- [Scheduled task execution boundaries](https://learn.chatgpt.com/docs/automations).
- [Playwright on CI](https://playwright.dev/docs/ci).
- Repository: `AGENTS.md`, `docs/agents/testing.md`, `docs/agents/local-e2e.md`, `.github/workflows/ci.yml`, `.github/workflows/database-behavior.yml`, `scripts/verify-local-import.mjs`, and `.gitignore`.
