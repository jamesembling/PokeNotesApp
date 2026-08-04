# Tournament database acceptance gate

Migration `20260804210932_make_tournament_writes_atomic.sql` must pass the real database harness before it is deployed to production.

The harness creates disposable users and records, exercises the RPCs through PostgREST in separate authenticated sessions, and cleans up afterward. It verifies transaction rollback after an injected aggregate failure, concurrent sequential round allocation, cross-tenant isolation, and anonymous/authenticated execute permissions.

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
```

The harness always refuses a target matching `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_URL`, or `POKENOTES_PRODUCTION_SUPABASE_URL`. Remote targets are refused without the exact non-production confirmation. The ordinary `test:tournament-db` command reports a clear skip when credentials are absent; the release command uses `test:tournament-db:required`, which fails instead.

Required release sequence:

1. Apply all migrations through `20260804210932` to a disposable local or remote integration database.
2. Run `npm run test:tournament-db:required` and retain its PASS output.
3. Independently inspect function ownership, `SECURITY INVOKER`, and execute grants on that target.
4. Only then deploy the migration to production, verify its schema and ACLs read-only, and deploy the application commit.
