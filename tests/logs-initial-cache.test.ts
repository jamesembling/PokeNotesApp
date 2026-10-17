import assert from "node:assert/strict";
import test from "node:test";
import { completeBulkLogMutation } from "@/lib/battle-log/bulk-mutation";
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

  // The first selected row vanished in another session. The second committed.
  const partial = completeBulkLogMutation(["gone", "saved"], [{ id: "saved" }], () =>
    invalidateInitialLogsCache("user-a")
  );
  assert.deepEqual(partial, { affectedIds: ["saved"], missingIds: ["gone"] });
  assert.deepEqual(invalidatedTags, [
    getInitialLogsCacheTag("user-a"),
    getInitialLogsCacheTag("user-a")
  ]);
  const retry = completeBulkLogMutation(["gone", "saved"], [], () =>
    invalidateInitialLogsCache("user-a")
  );
  assert.deepEqual(retry, { affectedIds: [], missingIds: ["gone", "saved"] });
  assert.equal(invalidatedTags.length, 3);
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
          name: "PostgrestError",
          toJSON() {
            return {
              code: "TEST_RPC_ERROR",
              details: "",
              hint: "",
              message: "RPC unavailable",
              name: "PostgrestError"
            };
          }
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
