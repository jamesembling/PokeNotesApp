import assert from "node:assert/strict";
import test from "node:test";
import {
  getInitialLogsCacheTag,
  invalidateInitialLogsCache,
  logsInitialCacheTestHooks
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
