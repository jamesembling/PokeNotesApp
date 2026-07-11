import assert from "node:assert/strict";
import test from "node:test";
import { GET as syncCardEffects } from "@/app/api/cron/sync-card-effect-catalog/route";
import { GET as syncPokemon } from "@/app/api/cron/sync-pokemon-catalog/route";

test("catalog cron failures do not expose configuration errors and are never cached", async () => {
  const previousSecret = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  const reports: unknown[][] = [];
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => reports.push(args);

  try {
    for (const handler of [syncPokemon, syncCardEffects]) {
      const response = await handler(new Request("http://localhost/api/cron/test"));
      const body = (await response.json()) as { error?: string; ok?: boolean };

      assert.equal(response.status, 500);
      assert.match(response.headers.get("cache-control") ?? "", /private.*no-store/);
      assert.equal(body.ok, false);
      assert.match(body.error ?? "", /catalog sync failed/i);
      assert.doesNotMatch(body.error ?? "", /CRON_SECRET|Missing/i);
    }

    assert.equal(reports.length, 2);
  } finally {
    console.error = originalConsoleError;
    if (previousSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = previousSecret;
    }
  }
});

test("unauthorized catalog cron responses are never cached", async () => {
  const previousSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "configured-for-test";

  try {
    for (const handler of [syncPokemon, syncCardEffects]) {
      const response = await handler(new Request("http://localhost/api/cron/test"));
      assert.equal(response.status, 401);
      assert.match(response.headers.get("cache-control") ?? "", /private.*no-store/);
    }
  } finally {
    if (previousSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = previousSecret;
    }
  }
});
