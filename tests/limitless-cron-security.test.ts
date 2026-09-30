import assert from "node:assert/strict";
import test from "node:test";
import { GET as syncPokemon } from "@/app/api/cron/sync-pokemon-catalog/route";
import { isAuthorizedLimitlessSync, parseLimitlessRefreshMode } from "@/lib/tournaments/limitless-sync-auth";

test("the scheduled Limitless credential cannot authorize other cron routes", async () => {
  const previousCronSecret = process.env.CRON_SECRET;
  const previousLimitlessSecret = process.env.LIMITLESS_SYNC_SECRET;
  process.env.CRON_SECRET = "catalog-secret-for-test";
  process.env.LIMITLESS_SYNC_SECRET = "limitless-secret-for-test";

  try {
    assert.equal(isAuthorizedLimitlessSync(null, process.env.CRON_SECRET, process.env.LIMITLESS_SYNC_SECRET), false);
    assert.equal(isAuthorizedLimitlessSync("Bearer limitless-secret-for-test", process.env.CRON_SECRET, process.env.LIMITLESS_SYNC_SECRET), true);
    assert.equal(isAuthorizedLimitlessSync("Bearer catalog-secret-for-test", process.env.CRON_SECRET, process.env.LIMITLESS_SYNC_SECRET), true);
    assert.equal(isAuthorizedLimitlessSync("Bearer wrong", process.env.CRON_SECRET, process.env.LIMITLESS_SYNC_SECRET), false);

    const catalogResponse = await syncPokemon(new Request("http://localhost/api/cron/sync-pokemon-catalog", {
      headers: { authorization: "Bearer limitless-secret-for-test" }
    }));
    assert.equal(catalogResponse.status, 401);

    assert.equal(parseLimitlessRefreshMode("http://localhost/api/cron/sync-limitless-events"), "manual");
    assert.equal(parseLimitlessRefreshMode("http://localhost/api/cron/sync-limitless-events?mode=primary"), "primary");
    assert.equal(parseLimitlessRefreshMode("http://localhost/api/cron/sync-limitless-events?mode=fallback"), "fallback");
    assert.equal(parseLimitlessRefreshMode("http://localhost/api/cron/sync-limitless-events?mode=unexpected"), null);
  } finally {
    if (previousCronSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previousCronSecret;
    if (previousLimitlessSecret === undefined) delete process.env.LIMITLESS_SYNC_SECRET;
    else process.env.LIMITLESS_SYNC_SECRET = previousLimitlessSecret;
  }
});
