# Tournament database acceptance gate

Migration `20260804210932_make_tournament_writes_atomic.sql` must pass the real database harness before it is deployed to production.

The harness creates disposable users and records, exercises the RPCs through PostgREST in separate authenticated sessions, and cleans up afterward. It verifies a successful atomic deck/list/link commit across the relational and compatibility stores, exact canonical card order and sort version, idempotent retry without duplicate rows, transaction rollback after an injected aggregate failure, concurrent sequential round allocation, cross-tenant isolation, and anonymous/authenticated execute permissions.

Run it against a local Supabase database after migrations are applied:

```bash
POKENOTES_TOURNAMENT_DB_TEST_URL=http://127.0.0.1:54321 \
POKENOTES_TOURNAMENT_DB_TEST_ANON_KEY=<local-anon-key> \
POKENOTES_TOURNAMENT_DB_TEST_SERVICE_ROLE_KEY=<local-service-role-key> \
npm run test:tournament-db:required
```

For an explicitly disposable remote integration project, also set:

```bash
POKENOTES_TOURNAMENT_DB_TEST_CONFIRM=NON_PRODUCTION_DISPOSABLE
POKENOTES_PRODUCTION_SUPABASE_URL=https://<production-project-ref>.supabase.co
# Or: POKENOTES_PRODUCTION_SUPABASE_PROJECT_REF=<production-project-ref>
```

Every remote run requires both the exact disposable confirmation and a canonical production identity. The harness compares parsed URL origins and normalized Supabase project references, so case, trailing slashes, terminal DNS root dots, default ports, or URL paths cannot disguise the production target. If only a production project reference is supplied for a custom-domain target, also provide `POKENOTES_TOURNAMENT_DB_TEST_PROJECT_REF` so the identities are comparable. Missing or incomparable production identity fails closed.

The ordinary `test:tournament-db` command reports a clear skip when credentials are absent; the release command uses `test:tournament-db:required`, which fails instead. `--safety-check-only` validates target selection and exits before Supabase clients are created; it exists for behavioral safety tests, not database acceptance.

Required release sequence:

1. Apply all migrations through `20260804210932` to a disposable local or remote integration database.
2. Set the canonical production identity and, for a remote target, the exact disposable confirmation.
3. Run `npm run test:tournament-db:required` and retain its PASS output for successful deck/list/link commit and retry, exact deck ordering in both stores, both RPC ACLs, rollback, concurrency, and tenant isolation.
4. Independently inspect function ownership, `SECURITY INVOKER`, and execute grants on that target.
5. Only then deploy the migration to production, verify its schema and ACLs read-only, and deploy the application commit.
