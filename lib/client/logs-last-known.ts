import type { BattleLogSummary, GoOrder, Result } from "@/types/index";

const LAST_KNOWN_LOGS_KEY = "poke-notes:logs:last-known:v1";
const LAST_KNOWN_LOGS_VERSION = 2;
const LAST_KNOWN_LOGS_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const LAST_KNOWN_LOGS_LIMIT = 8;
const SESSION_COOKIE_PATTERN = /^sb-.+-auth-token(?:\.(\d+))?$/;

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
  userId: string;
  version: typeof LAST_KNOWN_LOGS_VERSION;
};

type CreateLastKnownLogsSnapshotInput = {
  logs: BattleLogSummary[];
  stats: LastKnownLogsSnapshot["stats"];
};

export function createLastKnownLogsSnapshot(
  input: CreateLastKnownLogsSnapshotInput & { userId: string },
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
    userId: input.userId,
    version: LAST_KNOWN_LOGS_VERSION
  };
}

// The /logs shell paints before the server confirms the session, so a snapshot
// only belongs to the user whose session cookie is currently present.
export function parseLastKnownLogsSnapshot(
  value: string | null,
  userId: string | null,
  now = Date.now()
): LastKnownLogsSnapshot | null {
  if (!value || !userId) {
    return null;
  }

  try {
    const candidate = JSON.parse(value) as unknown;
    if (
      !isRecord(candidate) ||
      candidate.version !== LAST_KNOWN_LOGS_VERSION ||
      candidate.userId !== userId
    ) {
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
      userId,
      version: LAST_KNOWN_LOGS_VERSION
    };
  } catch {
    return null;
  }
}

export function readLastKnownLogsSnapshot(
  storage: StorageLike | null = getBrowserStorage(),
  userId: string | null = readSessionUserId(),
  now = Date.now()
) {
  if (!storage) {
    return null;
  }

  try {
    const snapshot = parseLastKnownLogsSnapshot(storage.getItem(LAST_KNOWN_LOGS_KEY), userId, now);
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
  storage: StorageLike | null = getBrowserStorage(),
  userId: string | null = readSessionUserId()
) {
  if (!storage || !userId) {
    return;
  }

  try {
    storage.setItem(
      LAST_KNOWN_LOGS_KEY,
      JSON.stringify(createLastKnownLogsSnapshot({ ...input, userId }))
    );
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

// Reads the user id from the Supabase SSR session cookie, which is readable by
// scripts and may be split into numbered chunks.
export function readSessionUserId(cookieHeader: string | null = getDocumentCookie()) {
  if (!cookieHeader) {
    return null;
  }

  const sessions = new Map<string, string[]>();
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    const name = part.slice(0, separator).trim();
    const match = separator > 0 ? SESSION_COOKIE_PATTERN.exec(name) : null;
    if (!match) {
      continue;
    }

    const baseName = match[1] === undefined ? name : name.slice(0, name.lastIndexOf("."));
    const chunks = sessions.get(baseName) ?? [];
    chunks[match[1] === undefined ? 0 : Number(match[1])] = part.slice(separator + 1).trim();
    sessions.set(baseName, chunks);
  }

  for (const chunks of sessions.values()) {
    try {
      const value = chunks.join("");
      const json = value.startsWith("base64-")
        ? decodeBase64Url(value.slice("base64-".length))
        : decodeURIComponent(value);
      const session = JSON.parse(json) as unknown;
      const user = isRecord(session) ? session.user : null;
      if (isRecord(user) && isBoundedString(user.id, 200) && user.id) {
        return user.id;
      }
    } catch {
      // A malformed cookie is treated as no session.
    }
  }

  return null;
}

function decodeBase64Url(value: string) {
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

function getDocumentCookie() {
  try {
    return typeof document === "undefined" ? null : document.cookie;
  } catch {
    return null;
  }
}

function getBrowserStorage() {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
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
