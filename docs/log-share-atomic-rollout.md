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

## Ordered release

1. From the compatibility commit—the parent of the post-cutover hardening
   commit—dry-run the linked migration push. It must contain only
   `20260804210800_make_log_share_lifecycle_atomic.sql`.
2. Apply that migration and verify the new RPC definitions and grants. Direct
   authenticated `DELETE` must still be available to the previously deployed
   application.
3. Run the staging rehearsal with `POKENOTES_SHARE_REHEARSAL_PHASE=rpc-cutover`.
4. Deploy the application commit that calls `revoke_log_share`. Verify the
   authenticated create/reuse/revoke journey and public invalidation in the
   supported browser surface.
5. Re-run the `rpc-cutover` staging rehearsal against the deployed application
   database boundary. Stop on any failure; do not apply hardening.
6. From the post-cutover hardening commit, dry-run the linked migration push. It
   must contain only
   `20260804212228_harden_log_share_writes_after_atomic_cutover.sql`.
7. Apply the hardening migration. Run linked migration alignment and full schema
   health; direct authenticated DML must now be absent while both authenticated
   RPCs and token-only public reads retain their intended grants.
8. Run the staging rehearsal with
   `POKENOTES_SHARE_REHEARSAL_PHASE=post-hardening`, then repeat the authenticated
   production create/reuse/revoke/public-invalidation smoke with disposable
   data.

Do not mark the defect resolved until both migration ledger entries, final
schema/ACL health, application deployment and authenticated production smoke
are recorded. The repository source tests do not substitute for this linked
two-client rehearsal.
