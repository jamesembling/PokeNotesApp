# Isolated Migration Release

Use this path for every change under `supabase/migrations/`. It separates source authorship,
disposable-branch rehearsal, and production authority. A green source review is not proof that a
migration ran; a successful remote command is not authority to change production.

## Roles and authority

| Role | May do | Must not do |
| --- | --- | --- |
| Migration worker | Author migration and tests in an isolated Git worktree; gather source and local evidence | Link the worktree, create a paid branch, use production credentials, run remote SQL, or deploy |
| Release owner | After recorded approval, create and remove one disposable branch, inject its database URL through the approved secret path, and gather rehearsal evidence | Clone production data, exceed the approved cost, treat the disposable branch as production proof, or deploy the app |
| Independent reviewer | Compare the exact commit, migration plan, security evidence, fault tests, and cleanup proof against this gate | Reuse the author's unsupported conclusions as review evidence |
| Production operator | After a separate explicit production approval, apply the reviewed migrations and verify the intended project | Deploy application code before its required migration or repair migration history without separate approval |
| Application release owner | Promote the exact reviewed app commit only after the production operator records a green database gate | Infer database readiness from CI, a preview deployment, or a disposable branch |

One person may hold multiple roles, but each authority transition and its evidence must still be
recorded. Ordinary workers hand off an unlinked commit; credentials and external mutations do not
move back into their worktree.

## Stage 1: source and local evidence

For an existing environment, `supabase/migrations/` is the release authority and migration history
is the apply ledger. `schema.sql` is the fresh-project snapshot; keep it consistent when the changed
contract belongs in a new installation. The older `sql/` directory remains a legacy tracked-hook
surface, not a place for new migration releases. Do not copy one change into both histories or use
the legacy pre-push deployment as migration evidence.

The migration worker records the base commit, head commit, migration filenames, checksums, intended
order, forward-compatibility window, and rollback or forward-fix plan. Create new files with
`supabase migration new <name>`; do not rename or edit an already-applied migration.

Review the executable SQL for tenant predicates, object ownership, explicit grants, RLS on exposed
tables, `USING` plus `WITH CHECK` on owner updates, invoker/definer behavior, fixed `search_path`,
locks, timeouts, and data volume. Add focused regression tests for every changed contract.

`supabase db reset` is destructive. Run it only after explicit reset approval names a confirmed
disposable local instance containing synthetic data. Record the target proof and approval before
resetting. When those conditions and an approved local Supabase configuration exist, capture:

```sh
supabase db reset
supabase migration list --local
supabase db advisors --local --type security --fail-on error
npm run schema:health -- --db-url-env POKENOTES_LOCAL_DATABASE_URL
```

Inject `POKENOTES_LOCAL_DATABASE_URL` through the approved secret path; never paste a credential into
the command, evidence, commit, or PR. If local Supabase is not configured, record the local gate as
`unavailable` with the exact reason. If reset approval or disposable-target proof is absent, stop and
record the gate as `not authorized`. Do not substitute a linked or production database.

For writes with contention or partial-failure risk, capture a deterministic concurrent-write test
and a deliberate fault after the first write. Prove the expected winner/conflict behavior and that
the failed transaction leaves no partial rows. For ACL, RLS, or ownership changes, test at least the
anonymous role, an owning user, a different authenticated user, and the privileged path that is
intended to remain. Use synthetic disposable data only.

## Stage 2: unlinked handoff and disposable rehearsal

The migration worker hands the release owner the evidence record below and an immutable commit.
The release owner first confirms the worktree is unlinked and the target is not production. Before
creating a branch, record James's approval for the named branch, expected lifetime, and maximum
cost. No approval means stop. The programme-wide ceiling is **US$1 total**, not US$1 per branch.

Create the branch without production data, using the current CLI help as the command authority:

```sh
supabase branches create "$POKENOTES_BRANCH_NAME" --project-ref "$POKENOTES_PARENT_PROJECT_REF"
supabase branches get "$POKENOTES_BRANCH_NAME" --project-ref "$POKENOTES_PARENT_PROJECT_REF" -o json
```

Set `POKENOTES_BRANCH_NAME` to the approved `pokenotes-migration-...` name and
`POKENOTES_PARENT_PROJECT_REF` to the separately verified parent reference. Reject empty or
unexpected values before running either command. Freeze the returned immutable branch ID as
`POKENOTES_BRANCH_ID` and its returned `project_ref` as `POKENOTES_BRANCH_REF` in the evidence record;
cleanup must use the ID, not the mutable name. Do not use `--with-data`. Obtain the branch database
URL through the approved secret channel and inject it as `POKENOTES_DISPOSABLE_DATABASE_URL`.

A database URL is not target proof by itself. From a clean checkout of the handed-off commit, use the
rehearsal wrapper as the only disposable `db push` path:

```sh
npm run migration:rehearse
npm run migration:rehearse -- --apply
supabase migration list --db-url "$POKENOTES_DISPOSABLE_DATABASE_URL"
npm run schema:health -- --db-url-env POKENOTES_DISPOSABLE_DATABASE_URL
supabase db advisors --db-url "$POKENOTES_DISPOSABLE_DATABASE_URL" --type security --fail-on error
supabase db advisors --db-url "$POKENOTES_DISPOSABLE_DATABASE_URL" --type performance --fail-on error
```

Immediately before each dry run or apply, the wrapper re-fetches `POKENOTES_BRANCH_ID` through the
authenticated branch API scoped to `POKENOTES_PARENT_PROJECT_REF`. It fails closed unless the live
ID and project ref match the frozen approved record and the database URL encodes that exact project
ref in a supported Supabase direct host or pooler username. It then runs the dry run; `--apply` runs
the reviewed dry run, repeats the live identity lookup and full binding check, then applies. Never
bypass it with a raw disposable `db push`.

Capture the verified ID/ref binding and dry-run migration list before applying it. After applying,
capture exact local/remote alignment, the schema-health totals, advisor output, targeted read-only
ACL/RLS/ownership queries, and the Stage 1 concurrency and fault-injection scenarios against the
disposable branch. Advisor findings are not waived silently: fix them or record a reviewer-approved
disposition.

Cleanup is a separate destructive action. After explicit cleanup approval, the release owner records
the branch name and ref, deletes that exact disposable branch, then lists branches and proves that
the ref is absent:

```sh
supabase branches delete "$POKENOTES_BRANCH_ID" --project-ref "$POKENOTES_PARENT_PROJECT_REF"
supabase branches list --project-ref "$POKENOTES_PARENT_PROJECT_REF" -o json
```

Immediately before deletion, reject an empty ID and confirm it exactly matches the frozen approved
record. Record deletion time, command exit status, and proof that the same ID and ref are absent from
the post-delete list. A submitted delete is not cleanup proof. If deletion fails or the branch
remains listed, keep the gate open and escalate.

## Stage 3: production migration before application

Disposable rehearsal does not authorize production. The production operator needs a new explicit
approval naming the project, migration versions, exact commit, maintenance/rollback plan, and data
impact. Reconfirm the target, take the approved backup or recovery checkpoint, and capture a
production dry run before mutation. Obtain the production URL through the approved secret channel,
inject it as `POKENOTES_PRODUCTION_DATABASE_URL`, and run from the reviewed commit:

```sh
supabase db push --db-url "$POKENOTES_PRODUCTION_DATABASE_URL" --dry-run
supabase db push --db-url "$POKENOTES_PRODUCTION_DATABASE_URL"
supabase migration list --db-url "$POKENOTES_PRODUCTION_DATABASE_URL"
npm run schema:health -- --db-url-env POKENOTES_PRODUCTION_DATABASE_URL
supabase db advisors --db-url "$POKENOTES_PRODUCTION_DATABASE_URL" --type security --fail-on error
supabase db advisors --db-url "$POKENOTES_PRODUCTION_DATABASE_URL" --type performance --fail-on error
```

Apply migrations from the reviewed commit, then capture migration alignment, targeted read-only
queries, schema health, both advisor classes, and any approved production smoke. Stop on any
mismatch; do not repair history, run `migration down`, or deploy the app speculatively. Prefer a
reviewed forward fix when rollback would destroy data.

Only after the database gate is green may the application release owner promote the exact compatible
app commit. Record the database completion time before the application deployment time, deployment
identity, smoke result, and monitoring/rollback owner.

## Evidence record and resolution gate

Store the following in the PR or approved release record. Redact credentials and user data; retain
command, target class, UTC timestamp, exit status, and concise output or artifact link.

```text
Issue / PR:
Base commit / head commit:
Migration files and SHA-256:
Author / release owner / independent reviewer / production operator / app release owner:

Source review: PASS | FAIL — evidence
Local reset approval and disposable target proof: approver, UTC time, target evidence
Local migration list: PASS | FAIL | UNAVAILABLE | NOT AUTHORIZED — evidence and reason
Focused tests: PASS | FAIL — commands and totals
Concurrency test: PASS | FAIL | NOT APPLICABLE — scenario and proof
Fault-injection rollback: PASS | FAIL | NOT APPLICABLE — injection point and residual-row proof
ACL / RLS / ownership matrix: PASS | FAIL | NOT APPLICABLE — role-by-role proof

Disposable approval: approver, UTC time, branch, lifetime, maximum cost, programme spend before/after
Disposable ID/ref/URL binding: PASS | FAIL — live lookup and wrapper evidence
Disposable dry run / apply / migration alignment: PASS | FAIL — wrapper evidence
Schema health / security advisors / performance advisors: PASS | FAIL — evidence and dispositions
Disposable targeted checks: PASS | FAIL — evidence
Cleanup approval and result: branch name/ref, delete status, UTC time, post-delete absence proof

Production approval: approver, UTC time, project identity, versions, exact commit, recovery plan
Production dry run / apply / alignment / health / advisors: PASS | FAIL — evidence
Migration completed UTC / application deployed UTC:
Application deployment and smoke: PASS | FAIL — identity and evidence
Independent review: PASS | FAIL — reviewer and UTC time
Residual risks / follow-up owner and date:
```

The issue is resolved only when source and applicable local evidence are green, disposable rehearsal
and verified cleanup are complete, the independent reviewer accepts the evidence, and any approved
production release proves migration-before-application order. If production release is not part of
the change, mark that stage `NOT AUTHORIZED / NOT RUN`; never present rehearsal as production proof.
