import { randomBytes } from "node:crypto";
import type { BattleLog, DeckCard } from "@/types/index";
import { createClient } from "@/lib/supabase/server";

export type LogShareRow = {
  id: string;
  owner_user_id: string;
  source_log_id: string | null;
  payload: unknown;
  expires_at: string;
  created_at: string;
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
  log: BattleLog;
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
  deleteOwnedShare: (shareId: string, ownerUserId: string) => Promise<boolean>;
  findActiveByOwnerLog: (
    ownerUserId: string,
    sourceLogId: string,
    nowIso: string
  ) => Promise<LogShareRow | null>;
  findByToken: (token: string) => Promise<LogShareRow | null>;
  insert: (row: LogShareInsertRow) => Promise<void>;
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

const SHARE_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

function isBattleLogSharePayload(value: unknown): value is BattleLogSharePayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    candidate.version === "v1" &&
    typeof candidate.linkedStrategyLabel === "string" &&
    candidate.log !== null &&
    typeof candidate.log === "object"
  );
}

function createShareToken() {
  return randomBytes(24).toString("base64url");
}

function isUniqueViolation(error: unknown) {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "23505"
  );
}

function getShareExpiry(now = new Date()) {
  return new Date(now.getTime() + SHARE_LIFETIME_MS).toISOString();
}

function getEffectiveNow(now?: Date) {
  return now ?? new Date();
}

function mapActiveLogShare(
  row: LogShareRow | null,
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
  row: LogShareRow | null,
  now = Date.now()
): SharedBattleLogSnapshot | null {
  if (!row || !isBattleLogSharePayload(row.payload)) {
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
    payload: row.payload
  };
}

async function createSupabaseLogShareStore(): Promise<LogShareStore> {
  const supabase = await createClient();

  return {
    async deleteOwnedShare(shareId, ownerUserId) {
      const { data, error } = await supabase
        .from("log_shares")
        .delete()
        .eq("id", shareId)
        .eq("owner_user_id", ownerUserId)
        .select("id");

      if (error) {
        throw error;
      }

      return Array.isArray(data) && data.length > 0;
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
      const { data, error } = await supabase
        .from("log_shares")
        .select("id,owner_user_id,source_log_id,payload,expires_at,created_at,updated_at")
        .eq("id", token)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return ((data as unknown) as LogShareRow | null) ?? null;
    },
    async insert(row) {
      const { error } = await supabase.from("log_shares").insert(row);

      if (error) {
        throw error;
      }
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

export async function createLogShareSnapshot(
  input: CreateLogShareSnapshotInput,
  options: LogShareQueryOptions = {}
): Promise<string> {
  const store = await getLogShareStore(options.store);
  const now = getEffectiveNow(options.now);
  const payload: BattleLogSharePayload = {
    version: "v1",
    log: input.log,
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
      await store.insert({
        id: token,
        owner_user_id: input.ownerUserId,
        source_log_id: input.sourceLogId,
        expires_at: getShareExpiry(now),
        payload
      });
      return token;
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
  const existingShare = await getActiveShareForLog(input.ownerUserId, input.sourceLogId, {
    ...options,
    now
  });

  if (existingShare) {
    return existingShare;
  }

  const token = await createLogShareSnapshot(input, {
    ...options,
    now
  });

  const createdShare = await getActiveShareForLog(input.ownerUserId, input.sourceLogId, {
    ...options,
    now
  });

  return (
    createdShare ?? {
      id: token,
      sourceLogId: input.sourceLogId,
      createdAt: now.toISOString(),
      expiresAt: getShareExpiry(now)
    }
  );
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
  return store.deleteOwnedShare(shareId, ownerUserId);
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
