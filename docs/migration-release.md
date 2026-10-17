# Database Migration Release

Use this path for every Supabase schema change. `supabase/migrations/` and Supabase's migration history are the release authority. `schema.sql` is the fresh-project snapshot; `sql/` is historical reference material.

Local agents and Git hooks validate migrations. They have no production-deployment step. Production changes run only from the reviewed `main` commit through the manually dispatched **Deploy production database** GitHub workflow.

## 1. Author a native migration

Create a migration with the installed CLI rather than inventing a filename:

```sh
supabase migration new <descriptive_name>
```

Update `schema.sql` when the same contract belongs in a fresh installation. Add focused tests for each changed behavior and review every affected grant, RLS policy, ownership rule, function privilege, lock, timeout, and data rewrite.

Applied migrations are immutable. Add a forward migration for later corrections.

## 2. Validate before merge

Run the relevant repository checks. A local database reset is optional and requires a confirmed disposable local instance because it destroys local data.

```sh
npm run lint
npm run typecheck
npm run test
supabase migration list --local
supabase db advisors --local --type security --fail-on error
```

When local Supabase is unavailable, record that gate as unavailable rather than substituting the linked production database.

Schema-health checks resolve `node_modules/.bin/supabase` from this repository,
including direct `node scripts/schema-health.mjs` invocation. Run `npm ci` first;
missing project dependencies fail clearly rather than falling back to a global
CLI. The production workflow installs the pinned dependencies before checking
schema contracts.

For risky data, concurrency, privilege, or rollback behavior, rehearse the reviewed migration against a disposable local Supabase/PostgreSQL database containing synthetic data. Apply the actual migration to the pre-change schema; resetting from the final `schema.sql` alone does not verify the migration. Record the local target, migration list, focused verification, and cleanup. Use the fixed local environment in `docs/agents/local-e2e.md` where applicable. Isolated rehearsal is evidence; it does not authorize production.

Use the fixed local rehearsal command with a Git ref whose `schema.sql` represents the pre-change state and the final migration version to apply. A focused SQL file is loaded after the actual migration and should raise an exception when any required behavior, ownership, privilege, concurrency, or rollback check fails.

```sh
npm run migration:rehearse:local -- \
  --from <pre-change-git-ref> \
  --through <14-digit-migration-version> \
  --verify <repository-relative-focused-check.sql>
```

The command resolves the baseline and `HEAD` to immutable commits, reads the baseline schema, selected migrations, and focused verification SQL from those commits rather than the working tree, starts an isolated local Supabase stack, resets through those files, runs the focused SQL, prints the local migration list, runs security advisors, and removes the containers, volumes, and temporary workdir in a `finally` cleanup. Commit the migration and verification SQL before running it. The command refuses a target migration that was not added in the selected Git range and never accepts a hosted database URL.

**Standing decision — 19 September 2026:** James reaffirmed the [Keep Free decision in the migration specification](https://app.notion.com/p/3b3aee33e56181c59a97c43a9ed23dc2). Keep the Supabase organization on Free. Do not create paid hosted rehearsal branches, upgrade the plan, add billing, incur branch costs, or ask for this approval again unless James explicitly reopens the decision. This supersedes the former hosted-branch rehearsal requirement. If local verification is unavailable, report the evidence gap and continue independent work; do not substitute production or a paid hosted branch.

## 3. Review and merge

The pull request records:

- migration filenames and checksums;
- schema and data impact;
- backward-compatibility window for the current production application;
- local or isolated test evidence;
- rollback or forward-fix plan;
- any application deployment ordering constraint.

Merge only migrations that are safe while the previous and next application versions may both be live. A breaking change uses an expand-and-contract sequence or an explicitly coordinated application deployment.

The atomic log-sharing release is the compatibility phase only:
`20260821000033_make_log_share_lifecycle_atomic.sql`. It installs the RPCs but
retains the existing authenticated owner-scoped `DELETE` grant. Any later
direct-write hardening requires a separate reviewed forward migration after
the application cutover; it must not be included in this release.

## 4. Deploy through GitHub Actions

Configure the GitHub `Production` environment with the `SUPABASE_PRODUCTION_DB_URL` secret. Restrict that environment to `main` and add a required reviewer when the repository plan supports it.

From the merged `main` commit, manually run **Deploy production database** and enter `DEPLOY`. The workflow serializes production database runs, previews pending migrations with `supabase db push --dry-run`, applies them with `supabase db push`, then verifies migration history, repository schema contracts, and Supabase security advisors.

The workflow is the only production migration path. A local `git push`, agent command, Vercel build, or preview deployment never applies production SQL.

If the workflow reports history drift, stop. Inspect `supabase migration list` and the target schema before considering `migration repair`; repairing history requires a separate reviewed decision because it changes the ledger without applying SQL.

## 5. Verify the release

Database work is complete when all applicable evidence is green:

1. the production workflow ran from the intended merged commit;
2. local and remote migration history align;
3. `schema:health` and targeted read-only checks pass;
4. the compatible production application path behaves as intended;
5. monitoring and the rollback or forward-fix owner are recorded.

If production deployment was not requested or could not run, report it as outstanding and keep the database work incomplete.

## Import Draft retention release

`20261017174723_bound_import_draft_retention.sql` schedules hourly batches of at
most 500 expired previews and 500 consumed payloads. Abandoned drafts retain a
24-hour grace period after expiry. Consumed drafts retain parser payloads for
24 hours after save, then keep the existing fingerprint, save identity, Battle
Log reference and minimal `selfDeckSprites` compatibility metadata. Compact
receipts cascade when their saved Battle Log or account is deleted. Receipt
replay remains available after payload pruning and does not create another log.

The minimal compatibility field keeps the previous application release safe
during deployment overlap or rollback. The new application skips learning and
parser reads for a completed retry. Pruning uses row locks with `SKIP LOCKED`;
a racing save or cleanup cannot clear the payload of an unconsumed draft.

Use `sql/verification/import-draft-retention-and-grants.sql` on the disposable
stack after applying the actual migrations. The controlled production workflow
also checks the explicit catalogue/Matchup grants through `schema:health`.
After release, inspect aggregate counts of abandoned drafts older than the grace
period and consumed drafts with nonempty `immutable_facts` older than 24 hours,
plus the named `cron.job`/`cron.job_run_details` status. A single hourly run is
bounded; a backlog can require multiple runs. Do not print draft payloads.
