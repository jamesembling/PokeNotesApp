import assert from "node:assert/strict";
import test from "node:test";
import { normalizeMatchNotes } from "@/lib/battle-log/match-notes";
import {
  MatchNotesWriteConflictError,
  persistOwnerMatchNotes
} from "@/lib/db/log-match-notes";

type MatchNotesQueryOp = {
  args: unknown[];
  method: string;
};

function createMatchNotesClient({
  error = null,
  initialValue = null,
  logId = "log-1",
  ownerUserId = "owner-1"
}: {
  error?: unknown;
  initialValue?: string | null;
  logId?: string;
  ownerUserId?: string;
} = {}) {
  const operations: MatchNotesQueryOp[] = [];
  let updatedValue: string | null | undefined;

  const chain = {
    eq(...args: unknown[]) {
      operations.push({ args, method: "eq" });
      return chain;
    },
    is(...args: unknown[]) {
      operations.push({ args, method: "is" });
      return chain;
    },
    select(...args: unknown[]) {
      operations.push({ args, method: "select" });
      const hasOwner = operations.some(
        (operation) =>
          operation.method === "eq" &&
          operation.args[0] === "user_id" &&
          operation.args[1] === ownerUserId
      );
      const hasLog = operations.some(
        (operation) =>
          operation.method === "eq" &&
          operation.args[0] === "id" &&
          operation.args[1] === logId
      );
      const requiresEmptyNote = operations.some(
        (operation) =>
          operation.method === "is" &&
          operation.args[0] === "match_notes" &&
          operation.args[1] === null
      );

      return Promise.resolve({
        data:
          !error && hasOwner && hasLog && (!requiresEmptyNote || initialValue === null)
            ? [{ id: logId, match_notes: updatedValue ?? null }]
            : [],
        error
      });
    },
    update(value: { match_notes: string | null }) {
      operations.push({ args: [value], method: "update" });
      updatedValue = value.match_notes;
      return chain;
    }
  };

  return {
    client: {
      from(table: string) {
        assert.equal(table, "logs");
        operations.push({ args: [table], method: "from" });
        return chain;
      }
    },
    operations,
    get updatedValue() {
      return updatedValue;
    }
  };
}

test("match notes trim outer whitespace, preserve line breaks, and normalize empty input", () => {
  assert.equal(
    normalizeMatchNotes(" \n  Kept the active safe.\nReview turn four. \n "),
    "Kept the active safe.\nReview turn four."
  );
  assert.equal(normalizeMatchNotes(" \n\t\r "), null);
  assert.equal(normalizeMatchNotes(null), null);
});

test("owner-scoped persistence trims and replaces the exact owned log", async () => {
  const harness = createMatchNotesClient({ initialValue: "Original note" });

  const saved = await persistOwnerMatchNotes(harness.client as never, {
    logId: "log-1",
    userId: "owner-1",
    value: "  Updated note after reviewing the match.  "
  });

  assert.equal(saved, "Updated note after reviewing the match.");
  assert.equal(harness.updatedValue, "Updated note after reviewing the match.");
  assert.deepEqual(harness.operations, [
    { args: ["logs"], method: "from" },
    {
      args: [{ match_notes: "Updated note after reviewing the match." }],
      method: "update"
    },
    { args: ["user_id", "owner-1"], method: "eq" },
    { args: ["id", "log-1"], method: "eq" },
    { args: ["id,match_notes"], method: "select" }
  ]);
});

test("owner-scoped persistence normalizes empty input to null", async () => {
  const harness = createMatchNotesClient();

  const saved = await persistOwnerMatchNotes(harness.client as never, {
    logId: "log-1",
    userId: "owner-1",
    value: " \n\t "
  });

  assert.equal(saved, null);
  assert.equal(harness.updatedValue, null);
});

test("owner-scoped persistence rejects another owner", async () => {
  const harness = createMatchNotesClient();

  await assert.rejects(
    persistOwnerMatchNotes(harness.client as never, {
      logId: "log-1",
      userId: "owner-2",
      value: "Private note"
    }),
    MatchNotesWriteConflictError
  );
});

test("owner-scoped persistence propagates database failures for action feedback", async () => {
  const databaseError = new Error("database unavailable");
  const harness = createMatchNotesClient({ error: databaseError });

  await assert.rejects(
    persistOwnerMatchNotes(harness.client as never, {
      logId: "log-1",
      userId: "owner-1",
      value: "Private note"
    }),
    databaseError
  );
});
