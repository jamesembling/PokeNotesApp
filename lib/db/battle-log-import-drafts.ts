import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildBattleLogImportReviewProjection,
  createBattleLogImportDraft,
  type BattleLogImportDraft,
  type BattleLogImportEditableFields,
  type BattleLogImportReviewProjection
} from "@/lib/log-import/import-draft";
import type { Json } from "@/types/supabase";
import type { ParsedLogReview } from "@/types/index";

const IMPORT_DRAFT_TTL_MS = 30 * 60 * 1000;

type ImportDraftRow = {
  battle_log_id: string | null;
  consumed_at: string | null;
  consumed_fingerprint: string | null;
  consumed_idempotency_key: string | null;
  created_at: string;
  expires_at: string;
  id: string;
  immutable_facts: Json;
  initial_editable: Json;
  user_id: string;
};

export type PersistedBattleLogImportReview = ParsedLogReview & {
  draftId: string;
  expiresAt: string;
};

export type CommitBattleLogImportDraftResult = {
  battleLogId: string;
  created: boolean;
  status: "created" | "replay";
};

function asJson(value: unknown): Json {
  return value as Json;
}

function mapRowToDraft(row: ImportDraftRow): BattleLogImportDraft {
  return {
    id: row.id,
    userId: row.user_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    immutable: row.immutable_facts as unknown as BattleLogImportDraft["immutable"],
    editable: row.initial_editable as unknown as BattleLogImportEditableFields,
    consumed:
      row.consumed_idempotency_key &&
      row.consumed_fingerprint &&
      row.battle_log_id &&
      row.consumed_at
        ? {
            idempotencyKey: row.consumed_idempotency_key,
            fingerprint: row.consumed_fingerprint,
            battleLogId: row.battle_log_id,
            consumedAt: row.consumed_at
          }
        : null
  };
}

export async function createPersistedBattleLogImportDraft(args: {
  format: string;
  review: ParsedLogReview;
  userId: string;
}): Promise<PersistedBattleLogImportReview> {
  const now = new Date();
  const draft = createBattleLogImportDraft({
    id: crypto.randomUUID(),
    userId: args.userId,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + IMPORT_DRAFT_TTL_MS).toISOString(),
    review: args.review,
    format: args.format
  });
  const admin = createAdminClient();
  const { error } = await admin.from("battle_log_import_drafts").insert({
    id: draft.id,
    user_id: draft.userId,
    immutable_facts: asJson(draft.immutable),
    initial_editable: asJson(draft.editable),
    created_at: draft.createdAt,
    expires_at: draft.expiresAt
  });

  if (error) {
    throw error;
  }

  return {
    ...args.review,
    draftId: draft.id,
    expiresAt: draft.expiresAt
  };
}

export async function getPersistedBattleLogImportDraft(
  draftId: string
): Promise<BattleLogImportDraft | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("battle_log_import_drafts")
    .select([
      "id",
      "user_id",
      "immutable_facts",
      "initial_editable",
      "created_at",
      "expires_at",
      "consumed_idempotency_key",
      "consumed_fingerprint",
      "battle_log_id",
      "consumed_at"
    ].join(","))
    .eq("id", draftId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapRowToDraft(data as unknown as ImportDraftRow) : null;
}

export async function commitPersistedBattleLogImportDraft(args: {
  draftId: string;
  editable: BattleLogImportEditableFields;
  idempotencyKey: string;
  resolved: {
    opponentDeckName: string;
    opponentDeckSlug: string;
    opponentDeckSprites: string[];
    selfDeckName: string;
    selfDeckSlug: string;
    selfDeckSprites: string[];
  };
  userId: string;
}): Promise<CommitBattleLogImportDraftResult> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("commit_battle_log_import_draft", {
    p_user_id: args.userId,
    p_draft_id: args.draftId,
    p_idempotency_key: args.idempotencyKey,
    p_editable: asJson(args.editable),
    p_resolved: asJson(args.resolved)
  });

  if (error) {
    throw error;
  }

  const result = data as unknown as Partial<CommitBattleLogImportDraftResult>;
  if (
    !result ||
    typeof result.battleLogId !== "string" ||
    typeof result.created !== "boolean" ||
    (result.status !== "created" && result.status !== "replay")
  ) {
    throw new Error("The Battle Log import commit returned an invalid result.");
  }

  return result as CommitBattleLogImportDraftResult;
}

export function buildPersistedBattleLogImportReviewProjection(
  draft: BattleLogImportDraft
): BattleLogImportReviewProjection {
  return buildBattleLogImportReviewProjection(draft);
}
