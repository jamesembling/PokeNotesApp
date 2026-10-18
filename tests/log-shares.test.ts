import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSupabaseLogShareStore,
  getOrCreateLogShareSnapshot,
  getSharedLogSnapshot,
  isLogShare24HourLimitError,
  isLogSharePayloadTooLargeError,
  isLogShareSourceNotFoundError,
  revokeLogShare,
  type LogShareRow,
  type LogShareStore
} from "@/lib/db/log-shares";
import { requireSharedLogSnapshot } from "@/lib/shared-log-routing";
import { projectPublicBattleLogDetail } from "@/lib/battle-log/detail-projection";
import type { BattleLog } from "@/types/index";

test("share revocation runs only the atomic RPC and surfaces its failure without a direct delete", async () => {
  const rpcCalls: Array<[string, unknown]> = [];
  const rpcFailure = { code: "P0001", message: "revocation failed" };
  const client = {
    async rpc(name: string, args: unknown) {
      rpcCalls.push([name, args]);
      return rpcCalls.length === 1 ? { data: true, error: null } : { data: null, error: rpcFailure };
    },
    from(table: string) {
      throw new Error(`Unexpected direct table access: ${table}`);
    }
  };
  const store = buildSupabaseLogShareStore({
    publicSupabase: client,
    supabase: client
  } as unknown as Parameters<typeof buildSupabaseLogShareStore>[0]);

  assert.equal(await store.revokeOwnedShare("share-1", "user-1"), true);
  await assert.rejects(store.revokeOwnedShare("share-2", "user-1"), (error) => error === rpcFailure);
  assert.deepEqual(rpcCalls, [
    ["revoke_log_share", { p_share_id: "share-1" }],
    ["revoke_log_share", { p_share_id: "share-2" }]
  ]);
});

function buildBattleLog(id = "log-1"): BattleLog {
  return {
    id,
    userId: "user-1",
    date: "2026-04-15",
    result: "Win",
    format: "SVI-TEF",
    goOrder: "First",
    selfPlayerName: "Self",
    selfDeckName: "Dragapult ex",
    selfDeckSlug: "dragapult-ex",
    selfDeckSprites: ["dragapult"],
    opponentPlayerName: "Opponent",
    opponentDeckName: "Gardevoir ex",
    opponentDeckSlug: "gardevoir-ex",
    opponentDeckSprites: ["gardevoir"],
    totalTurns: 7,
    coinTossWon: true,
    selfPrizesTaken: 6,
    opponentPrizesTaken: 4,
    selfAttackDamage: 240,
    opponentAttackDamage: 160,
    selfMulligans: 0,
    opponentMulligans: 1,
    linkedDeckId: undefined,
    linkedDeckListId: undefined,
    matchNotes: "  Keep the active safe.\nReview turn four.  ",
    reason: "Prizes",
    rawLog: "battle log",
    sections: [],
    importedAt: "2026-04-15T10:00:00.000Z",
    createdAt: "2026-04-15T10:00:00.000Z",
    updatedAt: "2026-04-15T10:00:00.000Z"
  };
}

function createStoreStub(initialRows: LogShareRow[] = []) {
  const rows = [...initialRows];
  const unexpectedCall = async () => {
    throw new Error("Unexpected share store operation");
  };
  const store: LogShareStore = {
    async getOrCreate(row) {
      const created = { ...row, created_at: "2026-04-15T10:00:00.000Z" };
      rows.push(created);
      return created;
    },
    revokeOwnedShare: unexpectedCall,
    async findByToken(token) {
      return rows.find((row) => row.id === token) ?? null;
    },
    listActiveByOwnerLog: unexpectedCall
  };

  return { rows, store };
}

test("share creation forwards ownership, maps the store result and propagates failure", async () => {
  const { store } = createStoreStub();
  const input = {
    ownerUserId: "user-1",
    sourceLogId: "log-1",
    log: buildBattleLog(),
    linkedStrategyLabel: "Dragapult ex"
  };
  const now = new Date("2026-04-15T10:00:00.000Z");
  store.getOrCreate = async (row) => {
    assert.equal(row.owner_user_id, "user-1");
    assert.equal(row.source_log_id, "log-1");
    return {
      id: "store-returned-token",
      source_log_id: "log-1",
      created_at: "2026-04-14T10:00:00.000Z",
      expires_at: "2026-04-21T10:00:00.000Z"
    };
  };

  assert.deepEqual(await getOrCreateLogShareSnapshot(input, { now, store }), {
    id: "store-returned-token",
    sourceLogId: "log-1",
    createdAt: "2026-04-14T10:00:00.000Z",
    expiresAt: "2026-04-21T10:00:00.000Z"
  });

  const failure = new Error("connection lost after commit");
  store.getOrCreate = async () => {
    throw failure;
  };
  await assert.rejects(
    getOrCreateLogShareSnapshot(input, { now, store }),
    (error) => error === failure
  );
});

test("creates compact URL-safe share tokens", async () => {
  const { rows, store } = createStoreStub();
  const share = await getOrCreateLogShareSnapshot(
    {
      ownerUserId: "user-1",
      sourceLogId: "log-1",
      log: buildBattleLog(),
      linkedStrategyLabel: "Dragapult ex",
      linkedDeckListName: "League list",
      linkedDeckListRawList: "Pokemon: 1\n1 Dragapult ex TWM 130"
    },
    { now: new Date("2026-04-15T10:00:00.000Z"), store }
  );

  assert.match(share.id, /^[A-Za-z0-9_-]{16}$/);
  assert.equal(share.expiresAt, "2026-04-22T10:00:00.000Z");
  const payload = rows[0]?.payload as { log?: Record<string, unknown> };
  assert.equal(
    Object.hasOwn(payload.log ?? {}, "matchNotes"),
    false,
    "owner match notes must never enter a public share snapshot"
  );
  const projection = projectPublicBattleLogDetail(
    rows[0]?.payload as Parameters<typeof projectPublicBattleLogDetail>[0]
  );
  assert.equal(projection.privacy, "public");
  assert.equal(projection.log.matchNotes, null);
  assert.equal(projection.linkedDeckList.name, "League list");
  assert.equal(projection.linkedDeckList.sortedCards.length, 1);
});

test("recognizes only the typed database share errors", () => {
  assert.equal(
    isLogShare24HourLimitError({
      code: "P0001",
      message: "LOG_SHARE_24_HOUR_LIMIT_REACHED"
    }),
    true
  );
  assert.equal(
    isLogSharePayloadTooLargeError({
      code: "P0001",
      message: "LOG_SHARE_PAYLOAD_TOO_LARGE"
    }),
    true
  );
  assert.equal(
    isLogShareSourceNotFoundError({ code: "P0001", message: "LOG_SHARE_SOURCE_NOT_FOUND" }),
    true
  );
  assert.equal(
    isLogShare24HourLimitError({ code: "P0001", message: "LOG_SHARE_SOURCE_NOT_FOUND" }),
    false
  );
  assert.equal(
    isLogSharePayloadTooLargeError({
      code: "23514",
      message: "LOG_SHARE_PAYLOAD_TOO_LARGE"
    }),
    false
  );
  assert.equal(
    isLogShare24HourLimitError({ code: "23505", message: "LOG_SHARE_24_HOUR_LIMIT_REACHED" }),
    false
  );
});

test("expired shares resolve to null", async () => {
  const { store } = createStoreStub([
    {
      id: "share-1",
      owner_user_id: "user-1",
      source_log_id: "log-1",
      payload: {
        version: "v1",
        log: buildBattleLog(),
        linkedStrategyLabel: "Dragapult ex"
      },
      expires_at: "2026-04-14T09:00:00.000Z",
      created_at: "2026-04-14T08:00:00.000Z"
    }
  ]);

  const sharedLog = await getSharedLogSnapshot("share-1", {
    now: new Date("2026-04-15T10:00:00.000Z"),
    store
  });

  assert.equal(sharedLog, null);
});

test("legacy rows without source_log_id still load shared snapshots", async () => {
  const { store } = createStoreStub([
    {
      id: "legacy-share",
      owner_user_id: "user-1",
      source_log_id: null,
      payload: {
        version: "v1",
        log: buildBattleLog("legacy-log"),
        linkedStrategyLabel: "Legacy share"
      },
      expires_at: "2026-05-15T10:00:00.000Z",
      created_at: "2026-04-15T10:00:00.000Z"
    }
  ]);

  const sharedLog = await getSharedLogSnapshot("legacy-share", {
    now: new Date("2026-04-15T10:00:00.000Z"),
    store
  });

  assert.equal(sharedLog?.id, "legacy-share");
  assert.equal(sharedLog?.sourceLogId, undefined);
  assert.equal(sharedLog?.payload.log.id, "legacy-log");
});

test("malformed nested share payloads fail closed", async () => {
  const malformedLog = {
    ...buildBattleLog("malformed-log"),
    sections: [{ title: "Setup", player: "", actions: "not-an-array", prizesAfterTurn: {} }]
  };
  const { store } = createStoreStub([
    {
      id: "malformed-share",
      owner_user_id: "user-1",
      source_log_id: "malformed-log",
      payload: {
        version: "v1",
        log: malformedLog as unknown as BattleLog,
        linkedStrategyLabel: "Malformed share"
      },
      expires_at: "2026-05-15T10:00:00.000Z",
      created_at: "2026-04-15T10:00:00.000Z"
    }
  ]);

  const sharedLog = await getSharedLogSnapshot("malformed-share", {
    now: new Date("2026-04-15T10:00:00.000Z"),
    store
  });

  assert.equal(sharedLog, null);
});

test("requireSharedLogSnapshot uses the missing-share path when no snapshot exists", () => {
  let missingCalls = 0;

  const result = requireSharedLogSnapshot(null, () => {
    missingCalls += 1;
    return "missing";
  });

  assert.equal(result, "missing");
  assert.equal(missingCalls, 1);
});
