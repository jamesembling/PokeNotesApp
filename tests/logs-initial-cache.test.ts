import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import { mutateOwnedLogs } from "@/lib/db/log-bulk-mutations";
import type { Database } from "@/types/supabase";
import { completeBulkLogMutation } from "@/lib/battle-log/bulk-mutation";
import {
  getInitialLogsCacheTag,
  invalidateInitialLogsCache,
  logsInitialCacheTestHooks,
  requireCacheableInitialLogsData
} from "@/lib/server/logs-initial-cache";

test("initial logs cache keys and invalidation remain user scoped", async (t) => {
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

  const requests: Array<{ method: string; url: URL }> = [];
  let failure = false;
  const supabase = createClient<Database>("https://synthetic.supabase.co", "synthetic-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input, init) => {
        requests.push({ method: String(init?.method), url: new URL(String(input)) });
        return failure
          ? Response.json({ message: "write failed", code: "42501" }, { status: 403 })
          : Response.json([{ id: "saved" }]);
      }
    }
  });
  for (const mutation of [
    { kind: "delete" },
    { kind: "assign", deckId: null, deckListId: "list-1" }
  ] as const) {
    const mutate = (logIds: string[]) =>
      mutateOwnedLogs({
        supabase,
        userId: "user-a",
        logIds,
        mutation,
        invalidate: () => invalidateInitialLogsCache("user-a")
      });
    const requestCount = requests.length;
    for (const ids of [
      Array.from({ length: 101 }, (_, index) => `log-${index}`),
      ["x".repeat(6000)],
      Array.from({ length: 100 }, (_, index) => `${index}${"é".repeat(20)}`)
    ]) {
      await assert.rejects(mutate(ids), /select.*(?:fewer|100)/i);
    }
    assert.equal(requests.length, requestCount, "Oversized selections never reach PostgREST");
    assert.deepEqual(await mutate([" saved ", "gone", "saved", ""]), partial);
    const request = requests.at(-1)!;
    assert.equal(request.method, mutation.kind === "delete" ? "DELETE" : "PATCH");
    assert.equal(request.url.searchParams.get("user_id"), "eq.user-a");
    assert.equal(request.url.searchParams.get("id"), "in.(saved,gone)");
    const tagsBeforeFailure: number = invalidatedTags.length;
    failure = true;
    await assert.rejects(mutate(["saved"]));
    assert.equal(invalidatedTags.length, tagsBeforeFailure);
    failure = false;
  }
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
