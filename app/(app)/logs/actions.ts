"use server";

import { isRedirectError } from "next/dist/client/components/redirect";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { linkDeckConservatively } from "@/lib/log-import/deck-linking";
import { identifyLikelyArchetype } from "@/lib/log-import/identifier/archetypes";
import { loadIdentificationCatalog } from "@/lib/log-import/identifier/catalog";
import { selectDeckSprites } from "@/lib/log-import/identifier/sprites";
import { parseBattleLog } from "@/lib/log-import/parser";
import { createClient } from "@/lib/supabase/server";
import type { ImportLogRecord, ImportLogValidationErrorCode } from "@/lib/log-import/types";
import { ImportLogValidationError } from "@/lib/log-import/types";

type ProfileRow = {
  ptcgl_username: string;
};

export type ImportLogFormState = {
  error?: string;
  errorCode?: ImportLogValidationErrorCode;
  rawLog: string;
};

const INITIAL_STATE: ImportLogFormState = {
  rawLog: ""
};

function buildImportDate() {
  return new Date().toISOString().slice(0, 10);
}

function joinSprites(slugs: string[]) {
  return Array.from(new Set(slugs)).join(",");
}

function mapValidationError(error: unknown, rawLog: string): ImportLogFormState {
  if (error instanceof ImportLogValidationError) {
    return {
      error: error.message,
      errorCode: error.code,
      rawLog
    };
  }

  return {
    error: error instanceof Error ? error.message : "Unable to import this battle log right now.",
    errorCode: "UNKNOWN_LOG",
    rawLog
  };
}

export async function importLogAction(
  _previousState: ImportLogFormState = INITIAL_STATE,
  formData: FormData
): Promise<ImportLogFormState> {
  const rawLog = String(formData.get("rawLog") || "").trim();

  if (!rawLog) {
    return {
      error: "Paste a PTCGL battle log before importing.",
      errorCode: "EMPTY_INPUT",
      rawLog
    };
  }

  try {
    const user = await requireUser();
    const supabase = createClient();
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("ptcgl_username")
      .eq("id", user.id)
      .single();

    if (profileError) {
      throw profileError;
    }

    const ptcglUsername = ((profile as ProfileRow | null)?.ptcgl_username ?? "").trim();
    if (!ptcglUsername) {
      throw new ImportLogValidationError(
        "MISSING_PTCGL_USERNAME",
        "Set your PTCGL username in your profile before importing battle logs."
      );
    }

    const catalog = await loadIdentificationCatalog();
    const parsed = parseBattleLog({
      rawLog,
      ptcglUsername,
      catalog
    });

    const selfArchetype = identifyLikelyArchetype({
      evidence: parsed.pokemonEvidence.self,
      catalog
    });
    const opponentArchetype = identifyLikelyArchetype({
      evidence: parsed.pokemonEvidence.opponent,
      catalog
    });

    const selfSprites = selectDeckSprites({
      archetype: selfArchetype,
      evidence: parsed.pokemonEvidence.self,
      catalog
    });
    const opponentSprites = selectDeckSprites({
      archetype: opponentArchetype,
      evidence: parsed.pokemonEvidence.opponent,
      catalog
    });

    const selfDeckName = selfArchetype?.label ?? "Unknown Deck";
    const opponentDeckName = opponentArchetype?.label ?? "Unknown Deck";
    const selfDeckSlug = selfArchetype?.archetypeId ?? "";
    const opponentDeckSlug = opponentArchetype?.archetypeId ?? "";
    const linkedDeckId = await linkDeckConservatively({
      userId: user.id,
      identifiedDeckName: selfDeckName,
      identifiedDeckSlug: selfDeckSlug,
      identifiedSprites: selfSprites.slugs
    });

    const record: ImportLogRecord = {
      id: crypto.randomUUID(),
      date: buildImportDate(),
      result: parsed.stats.result,
      format: "",
      go_order: parsed.stats.goOrder,
      self_player_name: parsed.players.selfPlayerName,
      self_deck_name: selfDeckName,
      self_deck_slug: selfDeckSlug,
      self_deck_sprites: joinSprites(selfSprites.slugs),
      opponent_player_name: parsed.players.opponentPlayerName,
      opponent_deck_name: opponentDeckName,
      opponent_deck_slug: opponentDeckSlug,
      opponent_deck_sprites: joinSprites(opponentSprites.slugs),
      total_turns: parsed.stats.totalTurns,
      coin_toss_won: parsed.stats.coinTossWon,
      self_prizes_taken: parsed.stats.selfPrizesTaken,
      opponent_prizes_taken: parsed.stats.opponentPrizesTaken,
      self_attack_damage: parsed.stats.selfAttackDamage,
      opponent_attack_damage: parsed.stats.opponentAttackDamage,
      self_mulligans: parsed.stats.selfMulligans,
      opponent_mulligans: parsed.stats.opponentMulligans,
      linked_deck_id: linkedDeckId,
      linked_deck_list_id: null,
      reason: parsed.stats.reason,
      raw_log: parsed.rawLog,
      sections: parsed.sections
    };

    const { error: insertError } = await supabase.from("logs").insert({
      ...record,
      user_id: user.id
    });

    if (insertError) {
      throw insertError;
    }

    revalidatePath("/logs");
    redirect(`/logs/${record.id}`);
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    return mapValidationError(error, rawLog);
  }
}
