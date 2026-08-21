import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanupFixtureShares,
  collectSettledShareResults,
  finalizeRehearsal
} from "../scripts/lib/log-share-rehearsal-safety.mjs";

function fixtureClient(activeReads, revokeResults = new Map()) {
  let activeReadIndex = 0;
  const revoked = [];

  return {
    revoked,
    from(table) {
      assert.equal(table, "log_shares");
      const builder = {
        select() {
          return builder;
        },
        eq() {
          return builder;
        },
        async gt() {
          const result = activeReads[Math.min(activeReadIndex, activeReads.length - 1)];
          activeReadIndex += 1;
          return result;
        }
      };
      return builder;
    },
    async rpc(name, args) {
      assert.equal(name, "revoke_log_share");
      revoked.push(args.p_share_id);
      return revokeResults.get(args.p_share_id) ?? { data: true, error: null };
    }
  };
}

function publicClient(results = new Map()) {
  return {
    checked: [],
    async rpc(name, args) {
      assert.equal(name, "get_active_log_share");
      this.checked.push(args.p_token);
      return results.get(args.p_token) ?? { data: [], error: null };
    }
  };
}

test("partial concurrent failure retains every successful and duplicate token for cleanup", async () => {
  const observedTokens = new Set();
  const outcome = collectSettledShareResults(
    [
      { status: "fulfilled", value: { data: [{ id: "duplicate-token" }], error: null } },
      { status: "rejected", reason: new Error("transport failed") },
      { status: "fulfilled", value: { data: null, error: { code: "P0001" } } },
      { status: "fulfilled", value: { data: [{ id: "duplicate-token" }], error: null } },
      {
        status: "fulfilled",
        value: { data: [{ id: "unexpected-second-token" }], error: null }
      }
    ],
    observedTokens,
    "concurrent create"
  );

  assert.equal(outcome.errors.length, 2);
  assert.deepEqual([...observedTokens].sort(), ["duplicate-token", "unexpected-second-token"]);

  const fixture = fixtureClient([
    {
      data: [{ id: "duplicate-token" }, { id: "unexpected-second-token" }],
      error: null
    },
    { data: [], error: null }
  ]);
  const publicReader = publicClient();
  const cleanupErrors = await cleanupFixtureShares({
    fixtures: [
      {
        client: fixture,
        label: "partial failure fixture",
        logId: "log-a",
        observedTokens
      }
    ],
    publicClient: publicReader,
    now: new Date("2026-08-04T21:00:00.000Z")
  });

  assert.deepEqual(cleanupErrors, []);
  assert.deepEqual(fixture.revoked.sort(), ["duplicate-token", "unexpected-second-token"]);
  assert.deepEqual(publicReader.checked.sort(), ["duplicate-token", "unexpected-second-token"]);
});

test("cleanup failures are surfaced with the primary failure and PASS is suppressed", async () => {
  const fixture = fixtureClient(
    [
      { data: [{ id: "stuck-token" }], error: null },
      { data: [{ id: "stuck-token" }], error: null }
    ],
    new Map([["stuck-token", { data: null, error: { code: "XX001" } }]])
  );
  const publicReader = publicClient(
    new Map([["stuck-token", { data: [{ id: "stuck-token" }], error: null }]])
  );
  const cleanupErrors = await cleanupFixtureShares({
    fixtures: [
      {
        client: fixture,
        label: "cleanup failure fixture",
        logId: "log-a",
        observedTokens: new Set(["stuck-token"])
      }
    ],
    publicClient: publicReader,
    now: new Date("2026-08-04T21:00:00.000Z")
  });
  const messages = [];

  assert.ok(cleanupErrors.length >= 3);
  assert.throws(
    () =>
      finalizeRehearsal({
        phase: "rpc-cutover",
        primaryError: new Error("primary rehearsal failure"),
        cleanupErrors,
        log: (message) => messages.push(message)
      }),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.match(error.message, /cleanup verification was incomplete/);
      assert.match(error.errors[0].message, /primary rehearsal failure/);
      return true;
    }
  );
  assert.deepEqual(messages, []);
});

test("PASS is emitted only after cleanup returns with no residual errors", () => {
  const messages = [];
  finalizeRehearsal({
    phase: "rpc-cutover",
    primaryError: undefined,
    cleanupErrors: [],
    log: (message) => messages.push(message)
  });

  assert.deepEqual(messages, [
    "Atomic share rehearsal passed for rpc-cutover on the confirmed staging host."
  ]);
});
