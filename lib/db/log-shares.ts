import { randomBytes } from "node:crypto";
import type { BattleLog } from "@/types/index";
import { createClient } from "@/lib/supabase/server";

type LogShareRow = {
  id: string;
  payload: unknown;
  created_at: string;
};

export type BattleLogSharePayload = {
  version: "v1";
  log: BattleLog;
  linkedStrategyLabel: string;
};

export type SharedBattleLogSnapshot = {
  id: string;
  createdAt: string;
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
}): Promise<string> {
  const supabase = createClient();
  const payload: BattleLogSharePayload = {
    version: "v1",
    log: input.log,
    linkedStrategyLabel: input.linkedStrategyLabel
  };

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const token = createShareToken();
    const { error } = await supabase.from("log_shares").insert({
      id: token,
      owner_user_id: input.ownerUserId,
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
  const supabase = createClient();
  const { data, error } = await supabase
    .from("log_shares")
    .select("id,payload,created_at")
    .eq("id", token)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const row = data as LogShareRow | null;
  if (!row || !isBattleLogSharePayload(row.payload)) {
    return null;
  }

  return {
    id: row.id,
    createdAt: row.created_at,
    payload: row.payload
  };
}
