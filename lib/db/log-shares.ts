import { randomBytes } from "node:crypto";
import type { BattleLog, DeckCard } from "@/types/index";
import { createClient } from "@/lib/supabase/server";

type LogShareRow = {
  id: string;
  payload: unknown;
  expires_at: string;
  created_at: string;
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
  createdAt: string;
  expiresAt: string;
  payload: BattleLogSharePayload;
};

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

export async function createLogShareSnapshot(input: {
  ownerUserId: string;
  log: BattleLog;
  linkedStrategyLabel: string;
  linkedDeckListFormat?: string;
  linkedDeckListName?: string;
  linkedDeckListNotes?: string;
  linkedDeckListRawList?: string;
  linkedDeckListSortedCards?: DeckCard[];
}): Promise<string> {
  const supabase = await createClient();
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
    const { error } = await supabase.from("log_shares").insert({
      id: token,
      owner_user_id: input.ownerUserId,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      payload
    });

    if (!error) {
      return token;
    }

    if (error.code !== "23505") {
      throw error;
    }
  }

  throw new Error("Could not allocate a unique share token.");
}

export async function getSharedLogSnapshot(
  token: string
): Promise<SharedBattleLogSnapshot | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("log_shares")
    .select("id,payload,expires_at,created_at")
    .eq("id", token)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const row = data as LogShareRow | null;
  if (!row || !isBattleLogSharePayload(row.payload)) {
    return null;
  }

  if (Date.parse(row.expires_at) <= Date.now()) {
    return null;
  }

  return {
    id: row.id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    payload: row.payload
  };
}
