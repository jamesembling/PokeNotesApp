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

## Ordered release

Use two separate clean checkouts for the entire release. Every rehearsal must
run from the safe-harness checkout pinned to
`e663da31f9a77407ab74d6c74038eccb7936dba1` or a later independently reviewed
head that contains the fail-closed cleanup harness. Never run a rehearsal or
deploy the application from either staged migration checkout. Those staged
trees are used only to dry-run and apply their phase-specific migration set;
return to the safe-harness checkout before every rehearsal and after every
migration or application deployment boundary.

The compatibility migration was reviewed at
`1427cf9bc94b7d2d4e392b9cb014b6a9da530dc9`; the post-cutover hardening
migration was reviewed at `9b8ca902368f0c36486ad33ba7637edbe2c68c15`.
Never apply a generic `supabase db push --include-all` from the final integrated
head before the application cutover. Its timestamp ordering could include the
post-cutover hardening migration in the first push and break the previously
deployed application's direct revocation path. The final `schema.sql` snapshot
is post-hardening and must not be applied as a shortcut around this compatibility
window.

1. Create a dedicated phase-one migration checkout whose tree combines current
   `origin/main`, the reviewed share compatibility migration, and the reviewed
   tournament migration, but explicitly excludes
   `20260804212228_harden_log_share_writes_after_atomic_cutover.sql`. Relative
   to the production migration ledger, run
   `supabase db push --linked --dry-run --include-all` as an inspection only.
   It must report exactly these two pending migrations, in this order:

   - `20260804210800_make_log_share_lifecycle_atomic.sql`
   - `20260804210932_make_tournament_writes_atomic.sql`

   Stop if the dry-run contains the hardening migration, omits one of these
   migrations, or reports any additional pending migration. In particular,
   `20260804224244_add_coin_toss_losses_to_stats.sql` is unrelated work: if it
   appears, stop and reconcile the linked migration state rather than deploying
   it as part of this remediation.
2. After the dry-run reports exactly the two allowlisted migrations, apply that
   phase-one set without `--include-all`. Verify both migration ledger entries
   and the new share RPC definitions and grants.
   Direct authenticated `DELETE` on `public.log_shares` must still be available
   to the previously deployed application. Do not use this checkout for any
   later step. The disposable rehearsal must prove this exact apply mechanism
   before production. If the no-include push refuses because either allowlisted
   migration is older than an already-recorded migration such as
   `20260804224244`, stop and design and review an exact-file, ledger-safe
   mechanism. Do not relax the allowlist or fall back to a generic
   `--include-all` push.
3. Return to the separate safe-harness checkout at the latest independently
   reviewed head. Run the staging rehearsal with
   `POKENOTES_SHARE_REHEARSAL_PHASE=rpc-cutover`.
4. Deploy the application from that same latest independently reviewed safe
   head. Verify the authenticated create/reuse/revoke journey and public
   invalidation in the supported browser surface.
5. After the application deployment, return to the safe-harness checkout and
   re-run the `rpc-cutover` staging rehearsal against the deployed application
   database boundary. Stop on any failure; do not apply hardening.
6. In a separate phase-two migration checkout containing the hardening
   migration reviewed at `9b8ca902368f0c36486ad33ba7637edbe2c68c15`
   or a later reviewed commit that leaves it unchanged, run
   `supabase db push --linked --dry-run`. With the phase-one ledger entries
   already present, it must report exactly one pending migration:
   `20260804212228_harden_log_share_writes_after_atomic_cutover.sql`.
   Stop if any other migration is listed.
7. Apply only that hardening migration, without `--include-all`, then verify its
   migration ledger entry and leave the migration checkout.
   Return to the safe-harness checkout and run linked migration alignment and
   full schema health; direct authenticated DML must now be absent while both
   authenticated RPCs and token-only public reads retain their intended grants.
8. From the safe-harness checkout, run the staging rehearsal with
   `POKENOTES_SHARE_REHEARSAL_PHASE=post-hardening`, then repeat the authenticated
   production create/reuse/revoke/public-invalidation smoke with disposable
   data.

Do not mark the defect resolved until both migration ledger entries, final
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
