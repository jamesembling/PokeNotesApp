import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("public share reads use the token-only RPC instead of direct table access", () => {
  const logShares = source("lib/db/log-shares.ts");
  const readBlock = logShares.slice(
    logShares.indexOf("async findByToken"),
    logShares.indexOf("async listActiveByOwnerLog", logShares.indexOf("async findByToken"))
  );

  assert.match(logShares, /createPublicClient/);
  assert.match(readBlock, /publicSupabase\.rpc\("get_active_log_share"/);
  assert.doesNotMatch(readBlock, /\.from\("log_shares"\)/);
});

test("share creation uses the quota-enforcing database RPC", () => {
  const logShares = source("lib/db/log-shares.ts");
  const createBlock = logShares.slice(
    logShares.indexOf("async getOrCreate"),
    logShares.indexOf("async revokeOwnedShare", logShares.indexOf("async getOrCreate"))
  );
  const actions = source("app/(app)/logs/actions.ts");
  const apiRoute = source("app/api/log-shares/route.ts");

  assert.match(createBlock, /supabase\.rpc\("create_log_share"/);
  assert.doesNotMatch(createBlock, /\.from\("log_shares"\)\.insert/);
  assert.match(actions, /50 new share links in a rolling 24-hour period/);
  assert.match(actions, /isLogShare24HourLimitError/);
  assert.match(actions, /code: "LOG_SHARE_RATE_LIMIT", httpStatus: 429/);
  assert.match(actions, /isLogSharePayloadTooLargeError/);
  assert.match(actions, /code: "LOG_SHARE_PAYLOAD_TOO_LARGE", httpStatus: 413/);
  assert.match(apiRoute, /error\.httpStatus \?\? 400/);
  assert.doesNotMatch(apiRoute, /message\.includes/);
});

test("share revocation uses the owner-scoped atomic RPC", () => {
  const logShares = source("lib/db/log-shares.ts");
  const revokeBlock = logShares.slice(
    logShares.indexOf("async revokeOwnedShare"),
    logShares.indexOf("async findActiveByOwnerLog", logShares.indexOf("async revokeOwnedShare"))
  );

  assert.match(revokeBlock, /supabase\.rpc\("revoke_log_share"/);
  assert.doesNotMatch(revokeBlock, /\.from\("log_shares"\)\.delete/);
});
