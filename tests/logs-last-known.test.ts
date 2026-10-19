import assert from "node:assert/strict";
import test from "node:test";
import {
  clearLastKnownLogsSnapshot,
  createLastKnownLogsSnapshot,
  parseLastKnownLogsSnapshot,
  readLastKnownLogsSnapshot,
  readSessionUserId,
  writeLastKnownLogsSnapshot
} from "@/lib/client/logs-last-known";
import type { BattleLogSummary } from "@/types/index";

const now = Date.UTC(2026, 7, 23, 22, 30);

function battleLog(overrides: Partial<BattleLogSummary> = {}): BattleLogSummary {
  return {
    date: "2026-08-23",
    format: "SVI-ASC",
    goOrder: "First",
    id: "private-log-id",
    importedAt: "2026-08-23T22:00:00.000Z",
    linkedDeckId: "private-deck-id",
    linkedDeckListId: "private-list-id",
    linkedDeckListName: "Private list name",
    opponentDeckName: "Gardevoir",
    opponentDeckSprites: ["gardevoir", "munkidori", "extra"],
    opponentPlayerName: "Private opponent",
    result: "Win",
    selfDeckName: "Dragapult",
    selfDeckSprites: ["dragapult", "pidgeot", "extra"],
    selfPlayerName: "Private player",
    totalTurns: 10,
    ...overrides
  };
}

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    values
  };
}

test("last-known logs retain only bounded read-only presentation data", () => {
  const snapshot = createLastKnownLogsSnapshot(
    {
      logs: Array.from({ length: 10 }, (_, index) => battleLog({ id: `private-${index}` })),
      stats: { losses: 4, total: 10, wins: 6 },
      userId: "user-a"
    },
    now
  );
  const serialized = JSON.stringify(snapshot);

  assert.equal(snapshot.logs.length, 8);
  assert.deepEqual(snapshot.logs[0].selfDeckSprites, ["dragapult", "pidgeot"]);
  assert.deepEqual(snapshot.logs[0].opponentDeckSprites, ["gardevoir", "munkidori"]);
  for (const privateValue of [
    "private-log-id",
    "private-deck-id",
    "private-list-id",
    "Private list name",
    "Private opponent",
    "Private player"
  ]) {
    assert.equal(serialized.includes(privateValue), false);
  }
});

test("last-known logs reject expired, malformed, inconsistent, or other users' snapshots", () => {
  const valid = createLastKnownLogsSnapshot(
    { logs: [battleLog()], stats: { losses: 1, total: 3, wins: 2 }, userId: "user-a" },
    now
  );

  assert.deepEqual(parseLastKnownLogsSnapshot(JSON.stringify(valid), "user-a", now), valid);
  assert.equal(parseLastKnownLogsSnapshot(JSON.stringify(valid), "user-b", now), null);
  assert.equal(parseLastKnownLogsSnapshot(JSON.stringify(valid), null, now), null);
  assert.equal(
    parseLastKnownLogsSnapshot(JSON.stringify(valid), "user-a", now + 8 * 24 * 60 * 60 * 1000),
    null
  );
  assert.equal(parseLastKnownLogsSnapshot("not json", "user-a", now), null);
  assert.equal(
    parseLastKnownLogsSnapshot(
      JSON.stringify({ ...valid, stats: { losses: 2, total: 1, wins: 1 } }),
      "user-a",
      now
    ),
    null
  );
});

test("last-known logs are bound to the session cookie's user and cleared without browser globals", (t) => {
  const session = Buffer.from(JSON.stringify({ user: { id: "user-a" } })).toString("base64url");
  const cookie = `theme=dark; sb-ref-auth-token=base64-${session}`;
  const chunkedCookie = `sb-ref-auth-token.1=${session.slice(20)}; sb-ref-auth-token.0=base64-${session.slice(0, 20)}`;
  assert.equal(readSessionUserId(cookie), "user-a");
  assert.equal(readSessionUserId(chunkedCookie), "user-a");
  assert.equal(readSessionUserId("theme=dark"), null);
  assert.equal(readSessionUserId("sb-ref-auth-token=base64-not-json"), null);

  const storage = memoryStorage();
  const input = {
    logs: [battleLog()],
    stats: { losses: 1, total: 3, wins: 2 }
  };

  writeLastKnownLogsSnapshot(input, storage, null);
  assert.equal(storage.values.size, 0);
  writeLastKnownLogsSnapshot(input, storage, readSessionUserId(cookie));
  const snapshot = readLastKnownLogsSnapshot(storage, "user-a");
  assert.equal(snapshot?.logs.length, 1);
  assert.deepEqual(snapshot?.stats, input.stats);
  assert.equal(readLastKnownLogsSnapshot(storage, "user-b"), null);
  assert.equal(storage.values.size, 0);

  writeLastKnownLogsSnapshot(input, storage, "user-a");
  clearLastKnownLogsSnapshot(storage);
  assert.equal(readLastKnownLogsSnapshot(storage, "user-a"), null);

  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  t.after(() => {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      get localStorage() {
        throw new Error("Storage denied");
      }
    }
  });
  assert.equal(readLastKnownLogsSnapshot(), null);
  assert.doesNotThrow(() => writeLastKnownLogsSnapshot(input));
  assert.doesNotThrow(() => clearLastKnownLogsSnapshot());
});
