"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getBattleLogDeckDisplayName } from "@/lib/battle-log/display";
import { resolveBattleLogImportInput } from "@/lib/battle-log/training-court";
import { linkDeckConservatively } from "@/lib/log-import/deck-linking";
import { identifyLikelyArchetype } from "@/lib/log-import/identifier/archetypes";
import { loadIdentificationCatalog } from "@/lib/log-import/identifier/catalog";
import { selectDeckSprites } from "@/lib/log-import/identifier/sprites";
import { parseBattleLog } from "@/lib/log-import/parser";
import { ImportLogValidationError } from "@/lib/log-import/types";
import { getDecks } from "@/lib/db/decks";
import { createLogShareSnapshot } from "@/lib/db/log-shares";
import { getLogById, getLogsWindow } from "@/lib/db/logs";
import { createClient } from "@/lib/supabase/server";
import type { ImportLogRecord } from "@/lib/log-import/types";
import type { LogSection, ParsedLogReview, Result } from "@/types/index";

type ProfileRow = {
  ptcgl_username: string;
};

type ParseLogActionResult = ParsedLogReview | { error: string };
type SaveActionResult = {
  ok: true;
  redirectTo: string;
};

function revalidateWorkspaceViews() {
  revalidatePath("/logs", "layout");
  revalidatePath("/decks", "layout");
}

function buildImportDate() {
  return new Date().toISOString().slice(0, 10);
}

function getRedirectTarget(formData: FormData, fallbackPath: string) {
  return String(formData.get("redirectTo") || "").trim() || fallbackPath;
}

function joinSprites(slugs: string[]) {
  return Array.from(
    new Set(
      slugs
        .map((slug) => String(slug || "").trim())
        .filter(Boolean)
    )
  ).join(",");
}

async function getImportContext() {
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

  return {
    user,
    supabase,
    catalog,
    ptcglUsername
  };
}

async function buildParsedLogReview(rawLog: string): Promise<ParsedLogReview> {
  const resolvedRawLog = await resolveBattleLogImportInput(rawLog);
  const trimmedRawLog = String(resolvedRawLog || "").trim();

  if (!trimmedRawLog) {
    throw new ImportLogValidationError("EMPTY_INPUT", "Paste a PTCGL battle log before importing.");
  }

  const { user, catalog, ptcglUsername } = await getImportContext();
  const parsed = parseBattleLog({
    rawLog: trimmedRawLog,
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

  const selfDeckName = getBattleLogDeckDisplayName(selfArchetype?.label ?? "", selfSprites.slugs);
  const selfDeckSlug = selfArchetype?.archetypeId ?? "";
  const suggestedLinkedDeckId = await linkDeckConservatively({
    userId: user.id,
    identifiedDeckName: selfDeckName,
    identifiedDeckSlug: selfDeckSlug,
    identifiedSprites: selfSprites.slugs
  });

  return {
    selfPlayerName: parsed.players.selfPlayerName,
    opponentPlayerName: parsed.players.opponentPlayerName,
    selfDeckName,
    opponentDeckName: getBattleLogDeckDisplayName(
      opponentArchetype?.label ?? "",
      opponentSprites.slugs
    ),
    selfSprites: selfSprites.slugs,
    opponentSprites: opponentSprites.slugs,
    selfDeckSlug,
    opponentDeckSlug: opponentArchetype?.archetypeId ?? "",
    date: buildImportDate(),
    goOrder: parsed.stats.goOrder,
    coinTossWon: parsed.stats.coinTossWon,
    result: parsed.stats.result,
    language: parsed.language,
    rawLog: parsed.rawLog,
    sections: parsed.sections,
    totalTurns: parsed.stats.totalTurns,
    selfPrizesTaken: parsed.stats.selfPrizesTaken,
    opponentPrizesTaken: parsed.stats.opponentPrizesTaken,
    selfAttackDamage: parsed.stats.selfAttackDamage,
    opponentAttackDamage: parsed.stats.opponentAttackDamage,
    selfMulligans: parsed.stats.selfMulligans,
    opponentMulligans: parsed.stats.opponentMulligans,
    reason: parsed.stats.reason,
    suggestedLinkedDeckId: suggestedLinkedDeckId ?? undefined
  };
}

function parseBoolean(value: FormDataEntryValue | null): boolean | null {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return null;
}

function parseResult(value: FormDataEntryValue | null): Result {
  return value === "Loss" ? "Loss" : "Win";
}

function parseGoOrder(value: FormDataEntryValue | null): "First" | "Second" | "" {
  if (value === "First" || value === "Second") {
    return value;
  }

  return "";
}

function parseStringArray(values: FormDataEntryValue[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );
}

function parseSections(value: FormDataEntryValue | null): LogSection[] {
  if (typeof value !== "string" || !value.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as LogSection[]) : [];
  } catch {
    return [];
  }
}

export async function parseLogAction(formData: FormData): Promise<ParseLogActionResult> {
  try {
    const rawLog = String(formData.get("rawLog") || "");
    return await buildParsedLogReview(rawLog);
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Unable to review this battle log right now."
    };
  }
}

export async function importLogAction(formData: FormData): Promise<void> {
  const rawLogInput = String(formData.get("rawLog") || "").trim();
  const review = await buildParsedLogReview(rawLogInput);
  const { user, supabase } = await getImportContext();

  const selectedDeckId = String(formData.get("linkedDeckId") || "").trim();
  const selectedDeckListId = String(formData.get("linkedDeckListId") || "").trim();
  const sections = parseSections(formData.get("sections"));

  const record: ImportLogRecord = {
    id: crypto.randomUUID(),
    date: String(formData.get("date") || review.date).trim() || review.date,
    result: parseResult(formData.get("result")),
    format: String(formData.get("format") || "").trim(),
    go_order: parseGoOrder(formData.get("goOrder")) || review.goOrder,
    self_player_name: String(formData.get("selfPlayerName") || review.selfPlayerName).trim(),
    self_deck_name: String(formData.get("selfDeckName") || review.selfDeckName).trim(),
    self_deck_slug: String(formData.get("selfDeckSlug") || review.selfDeckSlug).trim(),
    self_deck_sprites: joinSprites(parseStringArray(formData.getAll("selfSprites"))),
    opponent_player_name: String(
      formData.get("opponentPlayerName") || review.opponentPlayerName
    ).trim(),
    opponent_deck_name: String(formData.get("opponentDeckName") || review.opponentDeckName).trim(),
    opponent_deck_slug: String(
      formData.get("opponentDeckSlug") || review.opponentDeckSlug
    ).trim(),
    opponent_deck_sprites: joinSprites(parseStringArray(formData.getAll("opponentSprites"))),
    total_turns: Number(formData.get("totalTurns") || review.totalTurns) || 0,
    coin_toss_won: parseBoolean(formData.get("coinTossWon")),
    self_prizes_taken: Number(formData.get("selfPrizesTaken") || review.selfPrizesTaken) || 0,
    opponent_prizes_taken:
      Number(formData.get("opponentPrizesTaken") || review.opponentPrizesTaken) || 0,
    self_attack_damage: Number(formData.get("selfAttackDamage") || review.selfAttackDamage) || 0,
    opponent_attack_damage:
      Number(formData.get("opponentAttackDamage") || review.opponentAttackDamage) || 0,
    self_mulligans: Number(formData.get("selfMulligans") || review.selfMulligans) || 0,
    opponent_mulligans: Number(formData.get("opponentMulligans") || review.opponentMulligans) || 0,
    linked_deck_id: selectedDeckId || review.suggestedLinkedDeckId || null,
    linked_deck_list_id: selectedDeckListId || null,
    reason: String(formData.get("reason") || review.reason).trim(),
    raw_log: review.rawLog,
    sections: sections.length > 0 ? sections : review.sections
  };

  const { error: insertError } = await supabase.from("logs").insert({
    ...record,
    user_id: user.id
  });

  if (insertError) {
    throw insertError;
  }

  revalidateWorkspaceViews();
  redirect(`/logs/${record.id}`);
}

export async function updateLogAction(formData: FormData): Promise<SaveActionResult> {
  const user = await requireUser();
  const supabase = createClient();
  const logId = String(formData.get("logId") || "").trim();

  if (!logId) {
    throw new Error("Missing battle log ID.");
  }

  const date = String(formData.get("date") || "").trim();
  const format = String(formData.get("format") || "").trim();
  const linkedDeckId = String(formData.get("linkedDeckId") || "").trim();
  const linkedDeckListId = String(formData.get("linkedDeckListId") || "").trim();

  const { error } = await supabase
    .from("logs")
    .update({
      date,
      format,
      linked_deck_id: linkedDeckId || null,
      linked_deck_list_id: linkedDeckListId || null,
      self_deck_sprites: joinSprites(parseStringArray(formData.getAll("selfSprites"))),
      opponent_deck_sprites: joinSprites(parseStringArray(formData.getAll("opponentSprites")))
    })
    .eq("user_id", user.id)
    .eq("id", logId);

  if (error) {
    throw error;
  }

  revalidateWorkspaceViews();

  return {
    ok: true,
    redirectTo: getRedirectTarget(formData, `/logs/${logId}`)
  };
}

export async function bulkAssignDeckListAction(input: {
  logIds: string[];
  linkedDeckId: string;
  linkedDeckListId: string;
}): Promise<void> {
  const user = await requireUser();
  const supabase = createClient();
  const logIds = Array.from(
    new Set(
      (input.logIds ?? [])
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );
  const linkedDeckId = String(input.linkedDeckId || "").trim();
  const linkedDeckListId = String(input.linkedDeckListId || "").trim();

  if (!logIds.length) {
    throw new Error("Select at least one battle log.");
  }

  if (!linkedDeckId || !linkedDeckListId) {
    throw new Error("Choose both a deck strategy and deck list first.");
  }

  const userDecks = await getDecks(user.id);
  const selectedDeck = userDecks.find((deck) => deck.id === linkedDeckId);
  const selectedDeckList = selectedDeck?.deckLists.find((deckList) => deckList.id === linkedDeckListId);

  if (!selectedDeck || !selectedDeckList) {
    throw new Error("That deck list could not be found.");
  }

  const { error } = await supabase
    .from("logs")
    .update({
      linked_deck_id: linkedDeckId,
      linked_deck_list_id: linkedDeckListId
    })
    .eq("user_id", user.id)
    .in("id", logIds);

  if (error) {
    throw error;
  }

  revalidateWorkspaceViews();
}

export async function loadMoreLogsAction(windowEndDate?: string) {
  const user = await requireUser();
  return getLogsWindow(user.id, {
    windowEndDate
  });
}

export async function deleteLogsAction(logIdsInput: string[]): Promise<void> {
  const user = await requireUser();
  const supabase = createClient();
  const logIds = Array.from(
    new Set(
      (logIdsInput ?? [])
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );

  if (!logIds.length) {
    throw new Error("Select at least one battle log.");
  }

  const { error } = await supabase
    .from("logs")
    .delete()
    .eq("user_id", user.id)
    .in("id", logIds);

  if (error) {
    throw error;
  }

  revalidateWorkspaceViews();
}

export async function deleteLogAction(logIdInput: string): Promise<void> {
  const logId = String(logIdInput || "").trim();

  if (!logId) {
    throw new Error("Missing battle log ID.");
  }

  await deleteLogsAction([logId]);
}

export async function createLogShareAction(logId: string): Promise<{ shareUrl: string }> {
  const user = await requireUser();
  const normalizedLogId = String(logId || "").trim();

  if (!normalizedLogId) {
    throw new Error("Missing battle log ID.");
  }

  const [log, userDecks] = await Promise.all([
    getLogById(user.id, normalizedLogId),
    getDecks(user.id)
  ]);

  if (!log) {
    throw new Error("Battle log not found.");
  }

  const linkedDeck = log.linkedDeckId
    ? userDecks.find((deck) => deck.id === log.linkedDeckId) ?? null
    : null;
  const linkedDeckList = linkedDeck?.deckLists.find(
    (deckList) => deckList.id === log.linkedDeckListId
  );
  const linkedStrategyLabel = linkedDeckList?.name ?? linkedDeck?.deckName ?? "No strategy linked";
  const sharedLog = {
    ...log,
    id: "shared-log",
    userId: "",
    linkedDeckId: undefined,
    linkedDeckListId: undefined
  };
  const token = await createLogShareSnapshot({
    ownerUserId: user.id,
    log: sharedLog,
    linkedStrategyLabel
  });

  const requestHeaders = headers();
  const origin = requestHeaders.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
  const shareUrl = `${origin.replace(/\/$/, "")}/shared/${token}`;

  return { shareUrl };
}
