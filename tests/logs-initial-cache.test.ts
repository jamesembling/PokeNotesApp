import assert from "node:assert/strict";
import test from "node:test";
import {
  getInitialLogsCacheTag,
  invalidateInitialLogsCache,
  logsInitialCacheTestHooks,
  requireCacheableInitialLogsData
} from "@/lib/server/logs-initial-cache";

test("initial logs cache keys and invalidation remain user scoped", (t) => {
  const originalUpdateTag = logsInitialCacheTestHooks.updateTag;
  const invalidatedTags: string[] = [];

  logsInitialCacheTestHooks.updateTag = (tag) => {
    invalidatedTags.push(tag);
  };
  t.after(() => {
    logsInitialCacheTestHooks.updateTag = originalUpdateTag;
  });

  assert.notEqual(getInitialLogsCacheTag("user-a"), getInitialLogsCacheTag("user-b"));

  invalidateInitialLogsCache("user-a");

  assert.deepEqual(invalidatedTags, [getInitialLogsCacheTag("user-a")]);
});

test("failed initial read models cannot poison the shared logs cache", () => {
  assert.throws(
    () =>
      requireCacheableInitialLogsData({
        error: {
          code: "TEST_RPC_ERROR",
          details: "",
          hint: "",
          message: "RPC unavailable",
          name: "PostgrestError"
        },
        failureReason: "rpc-error",
        mappingMs: null,
        resultBytes: null,
        resultRows: null,
        supabaseMs: 120,
        value: null
      }),
    {
      message: "Initial logs cache fill failed: rpc-error.",
      name: "InitialLogsCacheFillError"
    }
  );
});

test("successful initial read models remain cacheable", () => {
  const value = {
    stats: { losses: 1, total: 2, wins: 1 },
    window: {
      hasMore: false,
      logs: [],
      nextWindowEndDate: "",
      windowEndDate: "2026-08-23",
      windowStartDate: "2026-08-17",
      windowDays: 7
    }
  };

  assert.equal(
    requireCacheableInitialLogsData({
      error: null,
      failureReason: null,
      mappingMs: 1,
      resultBytes: 100,
      resultRows: 0,
      supabaseMs: 20,
      value
    }),
    value
  );
});
