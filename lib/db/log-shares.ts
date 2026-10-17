import { randomBytes } from "node:crypto";
import type { BattleLog, DeckCard } from "@/types/index";
import type { Json } from "@/types/supabase";
import { decodeBattleLog, decodeDeckCards } from "@/lib/battle-log/runtime-validation";
import { reportError } from "@/lib/server/report-error";
import { createPublicClient } from "@/lib/supabase/public";
import { createClient } from "@/lib/supabase/server";

export type PublicBattleLog = Omit<BattleLog, "matchNotes">;

type LogShareLookupRow = {
  id: string;
  source_log_id: string | null;
  expires_at: string;
  created_at: string;
};

type PublicLogShareRow = LogShareLookupRow & {
  payload: unknown;
};

export type LogShareRow = PublicLogShareRow & {
  owner_user_id: string;
  updated_at?: string;
};

export type ActiveLogShare = {
  id: string;
  sourceLogId?: string;
  createdAt: string;
  expiresAt: string;
};

export type CreateLogShareSnapshotInput = {
  ownerUserId: string;
  sourceLogId: string;
  log: BattleLog;
  linkedStrategyLabel: string;
  linkedDeckListFormat?: string;
  linkedDeckListName?: string;
  linkedDeckListNotes?: string;
  linkedDeckListRawList?: string;
  linkedDeckListSortedCards?: DeckCard[];
};

type LogShareInsertRow = {
  id: string;
  owner_user_id: string;
  source_log_id: string;
  payload: BattleLogSharePayload;
  expires_at: string;
};

export type BattleLogSharePayload = {
  version: "v1";
  log: PublicBattleLog;
  linkedStrategyLabel: string;
  linkedDeckListFormat?: string;
  linkedDeckListName?: string;
  linkedDeckListNotes?: string;
  linkedDeckListRawList?: string;
  linkedDeckListSortedCards?: DeckCard[];
};

export type SharedBattleLogSnapshot = {
  id: string;
  sourceLogId?: string;
  createdAt: string;
  expiresAt: string;
  payload: BattleLogSharePayload;
};

export type LogShareStore = {
  getOrCreate: (row: LogShareInsertRow) => Promise<LogShareLookupRow>;
  revokeOwnedShare: (shareId: string, ownerUserId: string) => Promise<boolean>;
  findActiveByOwnerLog: (
    ownerUserId: string,
    sourceLogId: string,
    nowIso: string
  ) => Promise<LogShareRow | null>;
  findByToken: (token: string) => Promise<PublicLogShareRow | null>;
  listActiveByOwnerLog: (
    ownerUserId: string,
    sourceLogId: string,
    nowIso: string
  ) => Promise<LogShareRow[]>;
};

type LogShareQueryOptions = {
  now?: Date;
  store?: LogShareStore;
};

const SHARE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const LOG_SHARE_24_HOUR_LIMIT_MESSAGE = "LOG_SHARE_24_HOUR_LIMIT_REACHED";
const LOG_SHARE_PAYLOAD_TOO_LARGE_MESSAGE = "LOG_SHARE_PAYLOAD_TOO_LARGE";
const LOG_SHARE_SOURCE_NOT_FOUND_MESSAGE = "LOG_SHARE_SOURCE_NOT_FOUND";

function decodeBattleLogSharePayload(value: unknown): BattleLogSharePayload | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const decodedLog = decodeBattleLog(candidate.log);
  const log = decodedLog ? toPublicBattleLog(decodedLog) : null;
  const optionalStrings = [
    "linkedDeckListFormat",
    "linkedDeckListName",
    "linkedDeckListNotes",
    "linkedDeckListRawList"
  ] as const;
  const hasValidOptionalStrings = optionalStrings.every(
    (field) =>
      candidate[field] === undefined ||
      candidate[field] === null ||
      typeof candidate[field] === "string"
  );
  const sortedCards =
    candidate.linkedDeckListSortedCards === undefined ||
    candidate.linkedDeckListSortedCards === null
      ? undefined
      : decodeDeckCards(candidate.linkedDeckListSortedCards);

  if (
    candidate.version !== "v1" ||
    typeof candidate.linkedStrategyLabel !== "string" ||
    !hasValidOptionalStrings ||
    !log ||
    sortedCards === null
  ) {
    return null;
  }

  return {
    version: "v1",
    log,
    linkedStrategyLabel: candidate.linkedStrategyLabel,
    linkedDeckListFormat:
      typeof candidate.linkedDeckListFormat === "string"
        ? candidate.linkedDeckListFormat
        : undefined,
    linkedDeckListName:
      typeof candidate.linkedDeckListName === "string" ? candidate.linkedDeckListName : undefined,
    linkedDeckListNotes:
      typeof candidate.linkedDeckListNotes === "string"
        ? candidate.linkedDeckListNotes
        : undefined,
    linkedDeckListRawList:
      typeof candidate.linkedDeckListRawList === "string"
        ? candidate.linkedDeckListRawList
        : undefined,
    linkedDeckListSortedCards: sortedCards
  };
}

export function toPublicBattleLog(log: BattleLog): PublicBattleLog {
  const { matchNotes: _matchNotes, ...publicLog } = log;
  return publicLog;
}

function createShareToken() {
  return randomBytes(12).toString("base64url");
}

function isUniqueViolation(error: unknown) {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "23505"
  );
}

function hasDatabaseError(error: unknown, code: string, message: string) {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === code &&
    "message" in error &&
    error.message === message
  );
}

export function isLogShare24HourLimitError(error: unknown) {
  return hasDatabaseError(error, "P0001", LOG_SHARE_24_HOUR_LIMIT_MESSAGE);
}

export function isLogSharePayloadTooLargeError(error: unknown) {
  return hasDatabaseError(error, "P0001", LOG_SHARE_PAYLOAD_TOO_LARGE_MESSAGE);
}

export function isLogShareSourceNotFoundError(error: unknown) {
  return hasDatabaseError(error, "P0001", LOG_SHARE_SOURCE_NOT_FOUND_MESSAGE);
}

function getShareExpiry(now = new Date()) {
  return new Date(now.getTime() + SHARE_LIFETIME_MS).toISOString();
}

function getEffectiveNow(now?: Date) {
  return now ?? new Date();
}

function mapActiveLogShare(
  row: LogShareLookupRow | null,
  now = Date.now()
): ActiveLogShare | null {
  if (!row) {
    return null;
  }

  if (Date.parse(row.expires_at) <= now) {
    return null;
  }

  return {
    id: row.id,
    sourceLogId: row.source_log_id ?? undefined,
    createdAt: row.created_at,
    expiresAt: row.expires_at
  };
}

export function mapSharedLogSnapshot(
  row: PublicLogShareRow | null,
  now = Date.now()
): SharedBattleLogSnapshot | null {
  if (!row) {
    return null;
  }

  const payload = decodeBattleLogSharePayload(row.payload);
  if (!payload) {
    reportError(new Error("Shared battle log payload failed runtime validation."), {
      area: "shares",
      boundary: "share-read",
      shareId: row.id
    });
    return null;
  }

  const activeShare = mapActiveLogShare(row, now);
  if (!activeShare) {
    return null;
  }

  return {
    id: activeShare.id,
    sourceLogId: activeShare.sourceLogId,
    createdAt: activeShare.createdAt,
    expiresAt: activeShare.expiresAt,
    payload
  };
}

type LogShareClients = {
  publicSupabase: ReturnType<typeof createPublicClient>;
  supabase: Awaited<ReturnType<typeof createClient>>;
};

async function createSupabaseLogShareStore(): Promise<LogShareStore> {
  return buildSupabaseLogShareStore({
    publicSupabase: createPublicClient(),
    supabase: await createClient()
  });
}

export function buildSupabaseLogShareStore({ publicSupabase, supabase }: LogShareClients): LogShareStore {
  return {
    async getOrCreate(row) {
      const { data, error } = await supabase.rpc("create_log_share", {
        p_payload: row.payload as unknown as Json,
        p_source_log_id: row.source_log_id,
        p_token: row.id
      });

      if (error) {
        throw error;
      }

      const [share] = data ?? [];
      if (!share) {
        throw new Error("Share creation returned no row.");
      }

      return share;
    },
    async revokeOwnedShare(shareId, ownerUserId) {
      const { data, error } = await supabase.rpc("revoke_log_share", {
        p_share_id: shareId
      });

      if (error) {
        throw error;
      }

      return data;
    },
    async findActiveByOwnerLog(ownerUserId, sourceLogId, nowIso) {
      const { data, error } = await supabase
        .from("log_shares")
        .select("id,owner_user_id,source_log_id,payload,expires_at,created_at,updated_at")
        .eq("owner_user_id", ownerUserId)
        .eq("source_log_id", sourceLogId)
        .gt("expires_at", nowIso)
        .order("created_at", { ascending: false })
        .limit(1);

      if (error) {
        throw error;
      }

      const [row] = (((data ?? []) as unknown) as LogShareRow[]);
      return row ?? null;
    },
    async findByToken(token) {
      const { data, error } = await publicSupabase.rpc("get_active_log_share", {
        p_token: token
      });

      if (error) {
        throw error;
      }

      const [row] = data ?? [];
      return row ?? null;
    },
    async listActiveByOwnerLog(ownerUserId, sourceLogId, nowIso) {
      const { data, error } = await supabase
        .from("log_shares")
        .select("id,owner_user_id,source_log_id,payload,expires_at,created_at,updated_at")
        .eq("owner_user_id", ownerUserId)
        .eq("source_log_id", sourceLogId)
        .gt("expires_at", nowIso)
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }

      return (((data ?? []) as unknown) as LogShareRow[]) ?? [];
    }
  };
}

async function getLogShareStore(store?: LogShareStore) {
  return store ?? (await createSupabaseLogShareStore());
}

async function getOrCreateShareRow(
  input: CreateLogShareSnapshotInput,
  options: LogShareQueryOptions = {}
): Promise<LogShareLookupRow> {
  const store = await getLogShareStore(options.store);
  const now = getEffectiveNow(options.now);
  const payload: BattleLogSharePayload = {
    version: "v1",
    log: toPublicBattleLog(input.log),
    linkedStrategyLabel: input.linkedStrategyLabel,
    linkedDeckListFormat: input.linkedDeckListFormat,
    linkedDeckListName: input.linkedDeckListName,
    linkedDeckListNotes: input.linkedDeckListNotes,
    linkedDeckListRawList: input.linkedDeckListRawList,
    linkedDeckListSortedCards: input.linkedDeckListSortedCards
  };

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const token = createShareToken();
    try {
      return await store.getOrCreate({
        id: token,
        owner_user_id: input.ownerUserId,
        source_log_id: input.sourceLogId,
        expires_at: getShareExpiry(now),
        payload
      });
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
    }
  }

  throw new Error("Could not allocate a unique share token.");
}

export async function getActiveShareForLog(
  ownerUserId: string,
  sourceLogId: string,
  options: LogShareQueryOptions = {}
): Promise<ActiveLogShare | null> {
  const store = await getLogShareStore(options.store);
  const now = getEffectiveNow(options.now);
  const row = await store.findActiveByOwnerLog(
    ownerUserId,
    sourceLogId,
    now.toISOString()
  );

  return mapActiveLogShare(row, now.getTime());
}

export async function getOrCreateLogShareSnapshot(
  input: CreateLogShareSnapshotInput,
  options: LogShareQueryOptions = {}
): Promise<ActiveLogShare> {
  const now = getEffectiveNow(options.now);
  const row = await getOrCreateShareRow(input, { ...options, now });
  const share = mapActiveLogShare(row, now.getTime());

  if (!share) {
    throw new Error("Share creation returned an expired row.");
  }

  return share;
}

export async function listActiveSharesForOwnerLog(
  ownerUserId: string,
  sourceLogId: string,
  options: LogShareQueryOptions = {}
): Promise<ActiveLogShare[]> {
  const store = await getLogShareStore(options.store);
  const now = getEffectiveNow(options.now);
  const rows = await store.listActiveByOwnerLog(ownerUserId, sourceLogId, now.toISOString());

  return rows
    .map((row) => mapActiveLogShare(row, now.getTime()))
    .filter((share): share is ActiveLogShare => Boolean(share));
}

export async function revokeLogShare(
  shareId: string,
  ownerUserId: string,
  options: LogShareQueryOptions = {}
) {
  const store = await getLogShareStore(options.store);
  return store.revokeOwnedShare(shareId, ownerUserId);
}

export async function getSharedLogSnapshot(
  token: string,
  options: LogShareQueryOptions = {}
): Promise<SharedBattleLogSnapshot | null> {
  const store = await getLogShareStore(options.store);
  const now = getEffectiveNow(options.now);
  const row = await store.findByToken(token);
  return mapSharedLogSnapshot(row, now.getTime());
}
