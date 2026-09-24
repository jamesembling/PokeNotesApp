# First-class Deck List release order

This is the executable release contract for
`20260821003055_first_class_deck_lists.sql`. Run
`npm run verify:deck-list-release` from the reviewed commit before applying
SQL. The production workflow runs that check before its migration preview.

## Migration-first gates

Apply the migration first, then observe every database gate before serving
application code.

The database migration is applied and observed before the application is
deployed. The operator must capture a successful dry run, migration history,
schema-health result, and security-advisor result against the same production
database. A failed gate stops the release; the workflow does not deploy the
application.

The migration gate verifies account ownership and RLS for `deck_lists`, logs,
and tournaments; `(user_id, id)` identity; optional `(user_id, deck_id)`
ownership; the `can_use_deck_list_reference` helper; and the reviewed RPC
grants/revocations. Direct client DML remains revoked where the RPC boundary
is authoritative.

It also verifies relational/legacy parity: ADR 0001 JSON references remain
strategy-scoped and do not receive incompatible foreign keys, while
first-class list references are account-scoped and strategy-independent.
Creation-key idempotency, stale-write checks, deletion cleanup, and ambiguous
legacy-source fail-closed behavior must remain covered by focused tests.

## Ordering and rollback gates

The canonical visual ordering (`sorted_cards_version` plus transactional
`position`) is checked in both migration and fresh `schema.sql`, and the
ordering guidance in `docs/agents/deck-list-ordering.md` is part of review.

There is no destructive rollback that restores the old schema. If a migration
gate fails, stop before application rollout and use a separately reviewed
forward migration. Any rollback rehearsal must use a disposable database and
must not target linked or production Supabase. The production deployment is a
manual `DEPLOY` action from `main`; it is not run by this feature branch.
Do not deploy production from this task.

## Application-second and disposable-DB gate

After all database gates pass, deploy the application second and verify the
first-class reads, writes, references, and legacy-source adoption together. A
missing first-class write RPC is a schema/deployment mismatch and must fail the
save visibly; it must not route writes through the older aggregate RPC. The
first-class RPC remains responsible for adopting an exact legacy-only source.

Executable SQL behavior rehearsal belongs in CI or a disposable local
Supabase/Postgres instance. Do not claim that regex/schema checks replace that
rehearsal, and never run this release contract against linked or production
SQL without the explicit production workflow confirmation.
