# Atomic battle-log sharing rollout

This change has a mandatory compatibility window. Do not apply both migrations
before the RPC application cutover is deployed and verified.

## Required staging fixtures

Use a non-production Supabase project with two authenticated test users. Each
user must own one disposable battle log. Keep the project URL, anon key, access
tokens and log IDs in environment variables; never commit or print them.

The rehearsal requires an exact staging-host confirmation and supports two
phases:

```bash
POKENOTES_SHARE_REHEARSAL_PHASE=rpc-cutover npm run verify:log-share-atomicity
POKENOTES_SHARE_REHEARSAL_PHASE=post-hardening npm run verify:log-share-atomicity
```

Required variables are listed by `scripts/rehearse-log-share-atomicity.mjs`.
The harness refuses to run unless `POKENOTES_SHARE_REHEARSAL_EXPECTED_HOST`
matches the URL and `POKENOTES_SHARE_REHEARSAL_CONFIRM` is exactly
`staging:<expected-host>`.

The rehearsal creates and removes only shares for the two supplied disposable
logs. It verifies concurrent calls across two authenticated clients, one active
token, cross-tenant create/revoke denial, anonymous revoke denial, public access
before revoke, public invalidation after revoke, tenant isolation, and retry
after an injected lost response.

Cleanup is part of the gate, not best effort. Whether the rehearsal passes or
fails, it re-queries both supplied fixture logs, revokes every active or observed
token, verifies that both logs have zero active shares, and verifies every
observed token through the public reader. Cleanup failures produce a failing
exit and are reported alongside the original rehearsal failure; PASS is printed
only after this verification succeeds.

## Disposable rehearsal

Use a clean, independently reviewed integration checkout for the entire release.
It must combine current `origin/main`, the reviewed PR #18 sharing commits, and
the reviewed PR #19 tournament migration. It is not the standalone PR #18 head,
because phase one requires both migrations. Every share lifecycle rehearsal
must run from that integration checkout at a head containing the fail-closed
cleanup harness. The target-bound migration wrapper creates its own temporary
phase-specific Supabase workdir; never hand-stage another tree, run raw
disposable `db push`, or deploy the application from the temporary workdir.

The compatibility migration was reviewed at
`1427cf9bc94b7d2d4e392b9cb014b6a9da530dc9`; the post-cutover hardening
migration was reviewed at `9b8ca902368f0c36486ad33ba7637edbe2c68c15`.
Never run the generic migration wrapper or a raw `supabase db push` from the
final integrated head before the application cutover. Its timestamp ordering
could include the post-cutover hardening migration in the first push and break
the previously deployed application's direct revocation path. The final
`schema.sql` snapshot is post-hardening and must not be applied as a shortcut
around this compatibility window.

1. From the clean integration checkout, inject the approved disposable branch
   ID, ref, parent ref and database URL, then run:

   ```sh
   npm run migration:rehearse -- --phase share-phase-one
   ```

   The wrapper re-verifies the live branch binding, builds a temporary Supabase
   workdir containing the historical baseline plus only the reviewed phase-one
   candidates, and runs the dry run without `--include-all`. It must report
   exactly these two pending migrations, in this order:

   - `20260804210800_make_log_share_lifecycle_atomic.sql`
   - `20260804210932_make_tournament_writes_atomic.sql`

   The staged workdir excludes
   `20260804212228_harden_log_share_writes_after_atomic_cutover.sql`,
   `20260804224244_add_coin_toss_losses_to_stats.sql`, and later or unexpected
   candidates. The wrapper rejects missing, additional, duplicated, or
   reordered dry-run entries. Source history now includes the ledger-aligned
   `20260725224841_optimize_route_read_models.sql` baseline; any other
   local/remote history divergence must stop the CLI and remain an explicit
   ledger blocker. Do not repair, ignore, or mask it.
2. After reviewing that exact dry run, apply the same phase-one plan through the
   wrapper, never raw Supabase CLI:

   ```sh
   npm run migration:rehearse -- --phase share-phase-one --apply
   ```

   The wrapper repeats the live target binding immediately before applying.
   Verify both migration ledger entries and the new share RPC definitions and grants.
   Direct authenticated `DELETE` on `public.log_shares` must still be available
   to the previously deployed application. Do not use this checkout for any
   later step. The disposable rehearsal must prove this exact apply mechanism
   before production. If the wrapper refuses because either allowlisted
   migration is older than an already-recorded migration such as
   `20260804224244`, stop and design and review an exact-file, ledger-safe
   reconciliation. Do not relax the allowlist, repair history inside this
   release, or fall back to a generic push.
3. From the integration checkout, run the staging rehearsal with
   `POKENOTES_SHARE_REHEARSAL_PHASE=rpc-cutover`.
4. Run the compatible application candidate from that same latest independently
   reviewed integration head against the disposable environment. Verify the
   authenticated create/reuse/revoke journey and public
   invalidation in the supported browser surface.
5. After the application deployment, re-run the `rpc-cutover` staging rehearsal
   against the deployed application
   database boundary. Stop on any failure; do not apply hardening.
6. Only after the application cutover is recorded and verified, run the
   separately confirmed phase-two wrapper:

   ```sh
   POKENOTES_SHARE_APP_CUTOVER_CONFIRM=verified-share-rpc-cutover \
     npm run migration:rehearse -- --phase share-phase-two
   ```

   With the phase-one ledger entries already present, it must report exactly one
   pending migration:
   `20260804212228_harden_log_share_writes_after_atomic_cutover.sql`.
   The wrapper rejects missing, duplicate, reordered, or additional entries and
   refuses phase two without the exact cutover confirmation.
7. After reviewing that exact dry run, apply only the hardening migration through
   the separately bound wrapper:

   ```sh
   POKENOTES_SHARE_APP_CUTOVER_CONFIRM=verified-share-rpc-cutover \
     npm run migration:rehearse -- --phase share-phase-two --apply
   ```

   Verify its migration ledger entry, linked migration alignment, and full
   schema health. Direct authenticated DML must now be absent while both
   authenticated RPCs and token-only public reads retain their intended grants.
8. Run the staging rehearsal with
   `POKENOTES_SHARE_REHEARSAL_PHASE=post-hardening`, then repeat the authenticated
   create/reuse/revoke/public-invalidation smoke with disposable data.
9. Before the separate coin-stats phase, run and record a new read-only source-
   versus-rollup data-impact recount. Count the literal named self-player and
   opponent-player `won the coin toss` sentences, ambiguous rows, missing-winner
   rows, and affected tenant rollups. After independent review of that current
   evidence, dry-run and apply only `20260804224244`:

   ```sh
   POKENOTES_COIN_STATS_DATA_IMPACT_CONFIRM=approved-current-recounted-coin-stats-impact \
     npm run migration:rehearse -- --phase coin-stats
   POKENOTES_COIN_STATS_DATA_IMPACT_CONFIRM=approved-current-recounted-coin-stats-impact \
     npm run migration:rehearse -- --phase coin-stats --apply
   ```

   Verify exact ledger alignment and the post-backfill source-versus-rollup
   totals. The wrapper repeats the disposable target binding before apply,
   redacts credentials, permits no other pending migration, and never uses
   `--include-all` or a raw fallback. Delete the approved disposable branch
   immediately after evidence capture and prove its ID and ref are absent from
   the post-delete branch list.

## Production release

Disposable success does not authorize production. After separate production
approval names the project, exact integration commit, recovery plan, all three
phase allowlists, application cutover owner and coin-stats data-impact reviewer,
inject the approved production URL and project ref through the secret-safe
release path. Do not set confirmation variables until their matching approvals
and gates are recorded.

1. Dry-run and apply only the compatibility migrations through the production-
   bound phase wrapper:

   ```sh
   POKENOTES_PRODUCTION_MIGRATION_CONFIRM="approved-production:share-phase-one:$POKENOTES_PRODUCTION_PROJECT_REF" \
     npm run migration:rehearse -- --target production --phase share-phase-one
   POKENOTES_PRODUCTION_MIGRATION_CONFIRM="approved-production:share-phase-one:$POKENOTES_PRODUCTION_PROJECT_REF" \
     npm run migration:rehearse -- --target production --phase share-phase-one --apply
   ```

   The wrapper must verify the approved project ref through the live project
   list before dry-run and again before apply. It permits exactly `20260804210800`
   followed by `20260804210932`; hardening, coin toss, additional, missing,
   duplicate, reordered, or ledger-divergent plans stop before mutation.
2. Verify the phase-one migration ledger, RPC definitions, owner/RLS/ACL matrix,
   concurrency and fault-injection gates. Direct authenticated owner-scoped
   `DELETE` must remain available to the currently deployed application.
3. Only after that database gate is green, deploy the exact reviewed compatible
   application commit. Record deployment identity and time, then verify the
   authenticated create/reuse/revoke journey and public invalidation.
4. Record the successful production RPC cutover. Then dry-run and apply only the
   hardening migration with both confirmations:

   ```sh
   POKENOTES_SHARE_APP_CUTOVER_CONFIRM=verified-share-rpc-cutover \
   POKENOTES_PRODUCTION_MIGRATION_CONFIRM="approved-production:share-phase-two:$POKENOTES_PRODUCTION_PROJECT_REF" \
     npm run migration:rehearse -- --target production --phase share-phase-two
   POKENOTES_SHARE_APP_CUTOVER_CONFIRM=verified-share-rpc-cutover \
   POKENOTES_PRODUCTION_MIGRATION_CONFIRM="approved-production:share-phase-two:$POKENOTES_PRODUCTION_PROJECT_REF" \
     npm run migration:rehearse -- --target production --phase share-phase-two --apply
   ```

   This phase permits only `20260804212228`; any other pending or divergent
   migration stops before mutation.
5. Verify share-phase-two ledger alignment, schema health, function ownership,
   `SECURITY INVOKER`, grants, RLS, security/performance advisors and the
   authenticated post-hardening smoke. Direct table mutation must be absent,
   while authenticated RPC mutation and token-only public reads remain.
6. Run a fresh read-only production data-impact recount for the literal named
   winner sentences and existing rollups described in the disposable gate.
   After separate review of those current counts, dry-run and apply the final
   protected phase with both exact confirmations:

   ```sh
   POKENOTES_COIN_STATS_DATA_IMPACT_CONFIRM=approved-current-recounted-coin-stats-impact \
   POKENOTES_PRODUCTION_MIGRATION_CONFIRM="approved-production:coin-stats:$POKENOTES_PRODUCTION_PROJECT_REF" \
     npm run migration:rehearse -- --target production --phase coin-stats
   POKENOTES_COIN_STATS_DATA_IMPACT_CONFIRM=approved-current-recounted-coin-stats-impact \
   POKENOTES_PRODUCTION_MIGRATION_CONFIRM="approved-production:coin-stats:$POKENOTES_PRODUCTION_PROJECT_REF" \
     npm run migration:rehearse -- --target production --phase coin-stats --apply
   ```

   It permits only `20260804224244`, repeats production project binding before
   apply, redacts credentials, and rejects missing, additional, duplicate,
   reordered, or divergent plans. Verify final ledger/schema/ACL/advisor gates,
   the post-backfill source-versus-rollup recount and authenticated Stats UI.
   Never use `--include-all` or raw `supabase db push` as a fallback.

Do not mark the defect resolved until the share migration ledger entries, final
schema/ACL health, application deployment and authenticated production smoke
are recorded. The repository source tests do not substitute for this linked
two-client rehearsal.

## Emergency application rollback after hardening

This is an emergency-only compatibility escape hatch. Use it only if migration
`20260804212228` has already removed direct writes and the application must be
rolled back to a previously deployed version that still revokes shares with an
owner-scoped table `DELETE`. Do not use it to avoid fixing or redeploying the
new RPC application.

Before promoting the old application, run this exact reviewed transaction from
a deliberately linked release checkout. It refuses to grant access unless RLS
is enabled and the existing authenticated owner-scoped delete policy is still
present. It restores only authenticated `DELETE`; it does not restore `INSERT`
or `UPDATE`, and it grants nothing to `anon`.

```sql
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $compatibility_precheck$
begin
  if not coalesce((
    select relation.relrowsecurity
    from pg_catalog.pg_class as relation
    where relation.oid = 'public.log_shares'::regclass
  ), false) then
    raise exception 'Emergency log-share DELETE requires RLS.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_policies as policy
    where policy.schemaname = 'public'
      and policy.tablename = 'log_shares'
      and policy.policyname = 'Owners can delete log shares'
      and policy.cmd = 'DELETE'
      and 'authenticated' = any(policy.roles)
      and position('auth.uid()' in coalesce(policy.qual, '')) > 0
      and position('owner_user_id' in coalesce(policy.qual, '')) > 0
  ) then
    raise exception 'Owner-scoped log-share DELETE policy is missing.';
  end if;
end
$compatibility_precheck$;

grant delete on table public.log_shares to authenticated;

do $compatibility_acl_check$
begin
  if not pg_catalog.has_table_privilege(
    'authenticated', 'public.log_shares', 'DELETE'
  ) or pg_catalog.has_table_privilege(
    'authenticated', 'public.log_shares', 'INSERT'
  ) or pg_catalog.has_table_privilege(
    'authenticated', 'public.log_shares', 'UPDATE'
  ) or pg_catalog.has_table_privilege(
    'anon', 'public.log_shares', 'DELETE'
  ) then
    raise exception 'Emergency log-share DELETE ACL is not narrowly scoped.';
  end if;
end
$compatibility_acl_check$;

commit;
```

After the grant, run the safe harness in `rpc-cutover` mode with the two
disposable tenants. Owner direct deletion must succeed, cross-tenant direct
deletion must affect zero rows, anonymous mutation must remain denied,
and public access must invalidate after owner revocation. Then verify the rolled
back application's authenticated create/reuse/revoke/public-invalidation path.
Stop and remove the grant immediately if any ownership or isolation gate fails.

The temporary grant must be removed before promoting the new RPC application or
declaring the database hardened again. Run this exact transaction, then run
linked schema health and the safe harness in `post-hardening` mode:

```sql
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

revoke delete on table public.log_shares from authenticated;

do $hardened_acl_check$
begin
  if pg_catalog.has_table_privilege(
    'authenticated', 'public.log_shares', 'INSERT'
  ) or pg_catalog.has_table_privilege(
    'authenticated', 'public.log_shares', 'UPDATE'
  ) or pg_catalog.has_table_privilege(
    'authenticated', 'public.log_shares', 'DELETE'
  ) or not pg_catalog.has_function_privilege(
    'authenticated', 'public.revoke_log_share(text)', 'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'anon', 'public.revoke_log_share(text)', 'EXECUTE'
  ) then
    raise exception 'Hardened log-share ACL was not restored.';
  end if;
end
$hardened_acl_check$;

commit;
```

Record the reason, grant and revoke timestamps, two-tenant evidence, schema
health, application versions, and final authenticated smoke. An emergency grant
that remains active is a blocker, not a completed rollback.
