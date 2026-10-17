# Preserved import and Tournament ordering assessment

The Festival Lead parser correction affects newly prepared Battle Log Import
Drafts. The Tournament migration changes new captures only. Neither rewrites
saved evidence. Existing version-2 ordering does not certify a historical list.

## Read-only assessment

Run `npx tsx scripts/audit-preserved-facts.ts` with the intended environment already
loaded. It paginates Festival Lead Battle Logs, first-class Deck Lists and
Tournament Snapshots. Damage derives from saved sections and player identity;
Trainer subgroup inversions derive from matching printings in the completed
active catalog. Default output contains aggregate counts. `--details` also prints
record/account IDs and before/after numbers for a private ledger. Raw logs and
player names are never printed. There is no apply mode.

Unparseable sections, missing sorted cards and missing/conflicting metadata are
unverifiable. This is a targeted assessment, not certification of every statistic,
Pokemon ordering, printing merge or historical catalog completeness. Reconcile
Legacy Deck Aggregate mirrors under ADR 0001 when a source repair is selected.

## Assessment on 17 October 2026

The read-only production assessment found 38 candidate Festival Lead Battle Logs;
all 38 had different recalculated damage. It inspected 53 first-class Deck Lists:
zero proven Trainer subgroup inversions and 20 unverifiable lists. There were zero
Tournament Snapshots. Unverifiable lists are not proof of correct ordering. No
production facts, reference catalog or historical snapshots were changed.

## Controlled damage correction

1. Review each candidate against raw recorded attacks, saved sections and canonical
   player identity. Capture a private ledger with IDs, old/new damage, row version
   and source/sections digests. Change no editable fields or raw evidence.
2. Release the application fix. Allow existing pending Import Drafts to expire, or
   explicitly expire reviewed unconsumed candidate drafts. Their immutable old
   damage facts are not reparsed by reopening review.
3. Author a separate reviewed forward data migration. Lock approved owner/ID rows,
   require expected old damage, `updated_at` and digests, and abort the transaction
   on mismatch. Update only both damage columns. Rehearse rollback and a concurrent
   edit against synthetic data before release.
4. Existing log UPDATE transition-table triggers update `user_log_stats` under its
   account advisory lock. Do not increment aggregates again. Compare full account
   totals afterward; any independent drift uses `refresh_user_log_stats` under its
   existing lock contract.
5. Deploy through reviewed-main **Deploy production database**. Invalidate affected
   account log/stat caches after commit and verify fresh reads. A repeated repair
   must produce no further delta.

## Source lists and historical snapshots

New capture resolves Trainer classification from the completed active immutable
reference generation. Missing/conflicting evidence fails with retry guidance;
caller subtype/order is not proof. Normal Deck List saves retain resolved Trainer
subtypes. Source-only capture and durable command replay remain compatible.

Assess source lists and snapshots separately. Never replace historical card content
with today's source. Source edits/deletion must not change event evidence.

For approved source-list repair, preserve raw text, counts, printing identities,
metadata and record identity. Apply complete trusted ordering with row-version
checks and update the Legacy Deck Aggregate mirror atomically. Verify the list,
linked Battle Logs, shared projection and separate Tournament source relationship.

For a historical Snapshot, compare its own raw text and card multiset first. Obtain
explicit approval of the proposed historical order correction. Use a dedicated
reviewed forward migration guarded by owner, ID and before-image digest. Change
only ordering/subtype metadata; retain source IDs, request/payload identity, capture
date, names, notes, raw text and counts. Retain its original before-image privately
and rehearse rollback. Do not capture a replacement from today's source. Without
approval or complete evidence, leave it unchanged and report it as outstanding.

Local checks do not imply a production assessment or repair. Production candidate
counts, snapshot approval, controlled deployment, cache invalidation and fresh
account-view verification are separate release steps.

## Read-only production assessment - 17 October 2026

The aggregate-only run found 38 saved Festival Lead Battle Logs with proposed
damage corrections (38 candidates checked, none unverifiable). Of 53 first-class
Deck Lists, none had a confirmed Trainer subgroup inversion and 20 could not be
verified from available metadata. There were no Tournament Snapshots. These are
candidate assessments, not approved repairs or full ordering certification. No
production data changed.

The run used the intended existing environment explicitly:

```sh
node --env-file=.env --env-file=.env.local --import tsx scripts/audit-preserved-facts.ts
```

## Festival Lead damage correction release - 18 October 2026

`20261017230637_festival_lead_damage_repair.sql` corrects the 38 reviewed Battle
Logs: 21 on James's account, 10 on Bex's and 7 performance-test copies of James's
games. It adds 10,050 recorded damage in total; three logs also gain Trifrost
bench damage copied through Seek Inspiration. New damage values come from the
released parser over each log's saved sections, and were cross-checked against
the raw recorded attacks.

Each row is guarded by owner, `updated_at`, both current damage values and SHA-256
digests of `raw_log` and `sections::text`. All candidate rows are locked first; a
missing or mismatched row aborts the whole repair. Only the two damage columns are
written (the `set_logs_updated_at` trigger advances `updated_at`). The existing
statement-level trigger applies the `user_log_stats` deltas, so aggregates are not
incremented separately. A database without the rows, or one already corrected, is
left unchanged with a notice.

Before release, a read-only production preflight of the committed rows reported 38
present, 38 matching and 10,050 damage to add, with each account's `user_log_stats`
equal to its log sums. No unconsumed Import Drafts were pending, and production
was already running the parser fix.

Rehearsal evidence:

- `node scripts/rehearse-festival-damage-repair.mjs` runs the committed migration
  text against the local E2E database, replacing only the rows block with synthetic
  rows. It proves the no-candidate no-op, all-or-nothing abort on a mismatched or
  missing row, abort on an edit committed while the repair waits on its row lock,
  exact statistics deltas with all other columns unchanged, no delta on repeat, and
  a swapped forward repair restoring the original values and statistics.
- `npm run migration:rehearse:local -- --from origin/main --through 20261017230637
--verify supabase/rehearsals/20261017230637_festival_lead_damage_repair.sql`
  applies the actual migration to the pre-change schema and runs security advisors.

Rollback is a new forward migration built from the same template with old and new
damage swapped and `expected_updated_at` set to each row's post-repair value. After
deployment, rerun the read-only assessment (expect zero changed Festival Lead logs),
compare each account's `user_log_stats` with its log sums, and allow the 30-second
initial logs cache to expire before checking fresh account views.
