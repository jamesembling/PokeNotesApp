# Atomic battle-log sharing rollout

The atomic sharing RPC is an expand-only database change. The migration keeps
the existing authenticated table `DELETE` grant, so the currently deployed
application remains compatible while the new application is released.

## Release gates

1. Rehearse the exact reviewed `main` commit against a disposable Supabase
   target using `npm run migration:rehearse`. The dry run must contain exactly
   `20260821000033_make_log_share_lifecycle_atomic.sql`; no generic history
   repair or `--include-all` fallback is permitted.
2. Apply that migration only through the manually dispatched **Deploy
   production database** workflow from `main`, after its dry run and target
   identity checks pass. Do not run remote SQL from a worktree, hook, preview,
   or Vercel deployment.
3. Verify the migration ledger, RPC definitions and grants, owner/RLS
   isolation, concurrent create/reuse, duplicate revocation, and the existing
   owner-scoped direct `DELETE` path.
4. Deploy the exact application commit and verify authenticated create/reuse,
   revoke, public invalidation, and the lost-response retry path. The app has a
   narrowly classified fallback to the existing owner-scoped `DELETE` only
   when the new revocation RPC is genuinely missing, so deployment order is
   safe without weakening other database errors.

The migration is intentionally not a hardening cutover. Removing direct table
writes is a separate, future migration after the application journey is live
and independently verified.

## Evidence boundary

Tests and a disposable rehearsal are evidence only. Production is complete
only after the controlled GitHub workflow records the intended migration
ledger entry, schema health and security checks, followed by authenticated
application smoke evidence.
