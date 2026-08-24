import assert from "node:assert/strict";
import test from "node:test";
import {
  getOrCreateLogShareSnapshot,
  getSharedLogSnapshot,
  isLogShare24HourLimitError,
  isMissingLogShareRevokerError,
  isLogSharePayloadTooLargeError,
  isLogShareSourceNotFoundError,
  revokeLogShare,
  type LogShareRow,
  type LogShareStore
} from "@/lib/db/log-shares";
import { requireSharedLogSnapshot } from "@/lib/shared-log-routing";
import type { BattleLog } from "@/types/index";

test("revocation fallback is limited to a missing revoke RPC", () => {
  assert.equal(
    isMissingLogShareRevokerError({
      code: "PGRST202",
      message: "Could not find the function public.revoke_log_share(text)"
    }),
    true
  );
  assert.equal(
    isMissingLogShareRevokerError({ code: "42501", message: "permission denied" }),
    false
  );
  assert.equal(
    isMissingLogShareRevokerError({ code: "PGRST202", message: "Could not find another function" }),
    false
  );
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

function createMemoryStore(
  initialRows: LogShareRow[] = [],
  options: { failAfterFirstCommit?: boolean } = {}
) {
  const rows = [...initialRows];
  let insertCount = 0;
  let didInjectFailure = false;

  const store: LogShareStore = {
    async getOrCreate(row) {
      const existing = rows
        .filter(
          (candidate) =>
            candidate.owner_user_id === row.owner_user_id &&
            candidate.source_log_id === row.source_log_id &&
            Date.parse(candidate.expires_at) > Date.parse("2026-04-15T10:00:00.000Z")
        )
        .sort((left, right) => right.created_at.localeCompare(left.created_at))[0];

      if (existing) {
        return existing;
      }

      if (rows.some((candidate) => candidate.id === row.id)) {
        const error = new Error("duplicate");
        Object.assign(error, { code: "23505" });
        throw error;
      }

      insertCount += 1;
      const created = {
        ...row,
        created_at: `2026-04-15T10:00:0${insertCount}.000Z`,
        updated_at: `2026-04-15T10:00:0${insertCount}.000Z`
      };
      rows.push(created);

      if (options.failAfterFirstCommit && !didInjectFailure) {
        didInjectFailure = true;
        throw new Error("connection lost after commit");
      }

      return created;
    },
    async revokeOwnedShare(shareId, ownerUserId) {
      const target = rows.find(
        (row) => row.id === shareId && row.owner_user_id === ownerUserId
      );
      if (!target) {
        return false;
      }

      for (let index = rows.length - 1; index >= 0; index -= 1) {
        const candidate = rows[index];
        const isOwnedTarget =
          candidate?.owner_user_id === ownerUserId &&
          (target.source_log_id === null
            ? candidate.id === shareId
            : candidate.source_log_id === target.source_log_id);
        if (isOwnedTarget) {
          rows.splice(index, 1);
        }
      }

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

test("a retry after a lost create response reuses the committed token", async () => {
  const { rows, store } = createMemoryStore([], { failAfterFirstCommit: true });
  const input = {
    ownerUserId: "user-1",
    sourceLogId: "log-1",
    log: buildBattleLog(),
    linkedStrategyLabel: "Dragapult ex"
  };
  const now = new Date("2026-04-15T10:00:00.000Z");

  await assert.rejects(
    getOrCreateLogShareSnapshot(input, { now, store }),
    /connection lost after commit/
  );
  const retried = await getOrCreateLogShareSnapshot(input, { now, store });

  assert.equal(retried.id, rows[0]?.id);
  assert.equal(rows.length, 1);
});

test("creates compact URL-safe share tokens", async () => {
  const { rows, store } = createMemoryStore();
  const share = await getOrCreateLogShareSnapshot(
    {
      ownerUserId: "user-1",
      sourceLogId: "log-1",
      log: buildBattleLog(),
      linkedStrategyLabel: "Dragapult ex"
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

test("revoking the visible share removes historical duplicate tokens for that owner and log", async () => {
  const row = {
    owner_user_id: "user-1",
    source_log_id: "log-1",
    payload: {
      version: "v1" as const,
      log: buildBattleLog(),
      linkedStrategyLabel: "Dragapult ex"
    },
    expires_at: "2026-05-15T10:00:00.000Z"
  };
  const { rows, store } = createMemoryStore([
    { ...row, id: "visible-share", created_at: "2026-04-15T10:00:02.000Z" },
    { ...row, id: "hidden-share", created_at: "2026-04-15T10:00:01.000Z" },
    {
      ...row,
      id: "other-owner-share",
      owner_user_id: "user-2",
      created_at: "2026-04-15T10:00:03.000Z"
    }
  ]);

  const didRevoke = await revokeLogShare("visible-share", "user-1", { store });

  assert.equal(didRevoke, true);
  assert.deepEqual(rows.map((candidate) => candidate.id), ["other-owner-share"]);
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

test("malformed nested share payloads fail closed", async () => {
  const malformedLog = {
    ...buildBattleLog("malformed-log"),
    sections: [{ title: "Setup", player: "", actions: "not-an-array", prizesAfterTurn: {} }]
  };
  const { store } = createMemoryStore([
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
