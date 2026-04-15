import assert from "node:assert/strict";
import test from "node:test";
import {
  getOrCreateLogShareSnapshot,
  getSharedLogSnapshot,
  revokeLogShare,
  type LogShareRow,
  type LogShareStore
} from "@/lib/db/log-shares";
import { requireSharedLogSnapshot } from "@/lib/shared-log-routing";
import type { BattleLog } from "@/types/index";

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
    reason: "Prizes",
    rawLog: "battle log",
    sections: [],
    importedAt: "2026-04-15T10:00:00.000Z",
    createdAt: "2026-04-15T10:00:00.000Z",
    updatedAt: "2026-04-15T10:00:00.000Z"
  };
}

function createMemoryStore(initialRows: LogShareRow[] = []) {
  const rows = [...initialRows];
  let insertCount = 0;

  const store: LogShareStore = {
    async deleteOwnedShare(shareId, ownerUserId) {
      const index = rows.findIndex(
        (row) => row.id === shareId && row.owner_user_id === ownerUserId
      );
      if (index === -1) {
        return false;
      }

      rows.splice(index, 1);
      return true;
    },
    async findActiveByOwnerLog(ownerUserId, sourceLogId, nowIso) {
      const now = Date.parse(nowIso);
      return (
        rows
          .filter(
            (row) =>
              row.owner_user_id === ownerUserId &&
              row.source_log_id === sourceLogId &&
              Date.parse(row.expires_at) > now
          )
          .sort((left, right) => right.created_at.localeCompare(left.created_at))[0] ?? null
      );
    },
    async findByToken(token) {
      return rows.find((row) => row.id === token) ?? null;
    },
    async insert(row) {
      if (rows.some((candidate) => candidate.id === row.id)) {
        const error = new Error("duplicate");
        Object.assign(error, { code: "23505" });
        throw error;
      }

      insertCount += 1;
      rows.push({
        ...row,
        created_at: `2026-04-15T10:00:0${insertCount}.000Z`,
        updated_at: `2026-04-15T10:00:0${insertCount}.000Z`
      });
    },
    async listActiveByOwnerLog(ownerUserId, sourceLogId, nowIso) {
      const now = Date.parse(nowIso);
      return rows
        .filter(
          (row) =>
            row.owner_user_id === ownerUserId &&
            row.source_log_id === sourceLogId &&
            Date.parse(row.expires_at) > now
        )
        .sort((left, right) => right.created_at.localeCompare(left.created_at));
    }
  };

  return {
    rows,
    store
  };
}

test("reuses an active share for the same owner and log", async () => {
  const { rows, store } = createMemoryStore();
  const input = {
    ownerUserId: "user-1",
    sourceLogId: "log-1",
    log: buildBattleLog(),
    linkedStrategyLabel: "Dragapult ex"
  };
  const now = new Date("2026-04-15T10:00:00.000Z");

  const firstShare = await getOrCreateLogShareSnapshot(input, { now, store });
  const secondShare = await getOrCreateLogShareSnapshot(input, { now, store });

  assert.equal(firstShare.id, secondShare.id);
  assert.equal(rows.length, 1);
});

test("expired shares resolve to null", async () => {
  const { store } = createMemoryStore([
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

test("revoking a share removes access immediately", async () => {
  const { store } = createMemoryStore([
    {
      id: "share-1",
      owner_user_id: "user-1",
      source_log_id: "log-1",
      payload: {
        version: "v1",
        log: buildBattleLog(),
        linkedStrategyLabel: "Dragapult ex"
      },
      expires_at: "2026-05-15T10:00:00.000Z",
      created_at: "2026-04-15T10:00:00.000Z"
    }
  ]);

  const didRevoke = await revokeLogShare("share-1", "user-1", { store });
  const sharedLog = await getSharedLogSnapshot("share-1", {
    now: new Date("2026-04-15T10:00:00.000Z"),
    store
  });

  assert.equal(didRevoke, true);
  assert.equal(sharedLog, null);
});

test("legacy rows without source_log_id still load shared snapshots", async () => {
  const { store } = createMemoryStore([
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

test("requireSharedLogSnapshot uses the missing-share path when no snapshot exists", () => {
  let missingCalls = 0;

  const result = requireSharedLogSnapshot(null, () => {
    missingCalls += 1;
    return "missing";
  });

  assert.equal(result, "missing");
  assert.equal(missingCalls, 1);
});
