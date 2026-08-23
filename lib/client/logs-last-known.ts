import type { BattleLogSummary, GoOrder, Result } from "@/types/index";

const LAST_KNOWN_LOGS_KEY = "poke-notes:logs:last-known:v1";
const LAST_KNOWN_LOGS_VERSION = 1;
const LAST_KNOWN_LOGS_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const LAST_KNOWN_LOGS_LIMIT = 8;

type StorageLike = Pick<Storage, "getItem" | "removeItem" | "setItem">;

export type LastKnownLog = {
  date: string;
  goOrder: GoOrder;
  opponentDeckName: string;
  opponentDeckSprites: string[];
  result: Result;
  selfDeckSprites: string[];
};

export type LastKnownLogsSnapshot = {
  logs: LastKnownLog[];
  savedAt: number;
  stats: {
    losses: number;
    total: number;
    wins: number;
  };
  version: typeof LAST_KNOWN_LOGS_VERSION;
};

type CreateLastKnownLogsSnapshotInput = {
  logs: BattleLogSummary[];
  stats: LastKnownLogsSnapshot["stats"];
};

export function createLastKnownLogsSnapshot(
  input: CreateLastKnownLogsSnapshotInput,
  savedAt = Date.now()
): LastKnownLogsSnapshot {
  return {
    logs: input.logs.slice(0, LAST_KNOWN_LOGS_LIMIT).map((log) => ({
      date: log.date,
      goOrder: log.goOrder,
      opponentDeckName: log.opponentDeckName,
      opponentDeckSprites: log.opponentDeckSprites.slice(0, 2),
      result: log.result,
      selfDeckSprites: log.selfDeckSprites.slice(0, 2)
    })),
    savedAt,
    stats: {
      losses: input.stats.losses,
      total: input.stats.total,
      wins: input.stats.wins
    },
    version: LAST_KNOWN_LOGS_VERSION
  };
}

export function parseLastKnownLogsSnapshot(
  value: string | null,
  now = Date.now()
): LastKnownLogsSnapshot | null {
  if (!value) {
    return null;
  }

  try {
    const candidate = JSON.parse(value) as unknown;
    if (!isRecord(candidate) || candidate.version !== LAST_KNOWN_LOGS_VERSION) {
      return null;
    }

    if (
      !isFiniteNumber(candidate.savedAt) ||
      candidate.savedAt > now + 60_000 ||
      now - candidate.savedAt > LAST_KNOWN_LOGS_MAX_AGE_MS ||
      !isStats(candidate.stats) ||
      !Array.isArray(candidate.logs) ||
      candidate.logs.length > LAST_KNOWN_LOGS_LIMIT
    ) {
      return null;
    }

    const logs = candidate.logs.map(parseLog);
    if (logs.some((log) => log === null)) {
      return null;
    }

    return {
      logs: logs as LastKnownLog[],
      savedAt: candidate.savedAt,
      stats: candidate.stats,
      version: LAST_KNOWN_LOGS_VERSION
    };
  } catch {
    return null;
  }
}

export function readLastKnownLogsSnapshot(
  storage: StorageLike | null = getBrowserStorage(),
  now = Date.now()
) {
  if (!storage) {
    return null;
  }

  try {
    const snapshot = parseLastKnownLogsSnapshot(storage.getItem(LAST_KNOWN_LOGS_KEY), now);
    if (!snapshot) {
      storage.removeItem(LAST_KNOWN_LOGS_KEY);
    }
    return snapshot;
  } catch {
    return null;
  }
}

export function writeLastKnownLogsSnapshot(
  input: CreateLastKnownLogsSnapshotInput,
  storage: StorageLike | null = getBrowserStorage()
) {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(LAST_KNOWN_LOGS_KEY, JSON.stringify(createLastKnownLogsSnapshot(input)));
  } catch {
    // Browsers can deny local storage in private or constrained contexts.
  }
}

export function clearLastKnownLogsSnapshot(storage: StorageLike | null = getBrowserStorage()) {
  try {
    storage?.removeItem(LAST_KNOWN_LOGS_KEY);
  } catch {
    // Signing out must continue even if the browser denies local storage access.
  }
}

function getBrowserStorage() {
  return typeof window === "undefined" ? null : window.localStorage;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value) && value >= 0;
}

function isStats(value: unknown): value is LastKnownLogsSnapshot["stats"] {
  return (
    isRecord(value) &&
    isNonNegativeInteger(value.losses) &&
    isNonNegativeInteger(value.total) &&
    isNonNegativeInteger(value.wins) &&
    value.wins + value.losses <= value.total
  );
}

function isBoundedString(value: unknown, maximumLength: number): value is string {
  return typeof value === "string" && value.length <= maximumLength;
}

function parseSprites(value: unknown) {
  if (
    !Array.isArray(value) ||
    value.length > 2 ||
    !value.every((sprite) => isBoundedString(sprite, 180))
  ) {
    return null;
  }

  return value as string[];
}

function parseLog(value: unknown): LastKnownLog | null {
  if (!isRecord(value)) {
    return null;
  }

  const selfDeckSprites = parseSprites(value.selfDeckSprites);
  const opponentDeckSprites = parseSprites(value.opponentDeckSprites);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(typeof value.date === "string" ? value.date : "") ||
    !["", "First", "Second"].includes(typeof value.goOrder === "string" ? value.goOrder : "x") ||
    !isBoundedString(value.opponentDeckName, 180) ||
    !["Win", "Loss"].includes(typeof value.result === "string" ? value.result : "") ||
    !selfDeckSprites ||
    !opponentDeckSprites
  ) {
    return null;
  }

  return {
    date: value.date as string,
    goOrder: value.goOrder as GoOrder,
    opponentDeckName: value.opponentDeckName,
    opponentDeckSprites,
    result: value.result as Result,
    selfDeckSprites
  };
}
