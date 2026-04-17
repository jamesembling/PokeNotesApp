"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import {
  getBattleLogDeckDisplayName,
  getBattleLogOpponentDisplayName
} from "@/lib/battle-log/display";
import { resolveBattleLogImportInput } from "@/lib/battle-log/training-court";
import { linkDeckConservatively } from "@/lib/log-import/deck-linking";
import { identifyLikelyArchetype } from "@/lib/log-import/identifier/archetypes";
import { loadIdentificationCatalog } from "@/lib/log-import/identifier/catalog";
import { selectDeckSprites } from "@/lib/log-import/identifier/sprites";
import { parseBattleLog } from "@/lib/log-import/parser";
import { ImportLogValidationError } from "@/lib/log-import/types";
import { getDeckWithList, getDecks } from "@/lib/db/decks";
import { getOrCreateLogShareSnapshot, revokeLogShare } from "@/lib/db/log-shares";
import { getLogById, getLogsWindow } from "@/lib/db/logs";
import { getAppOrigin } from "@/lib/server/app-url";
import {
  resolveActionFailure,
  userFacingActionError
} from "@/lib/server/action-errors";
import { measureServerCall, measureServerStep } from "@/lib/server/perf";
import { createClient } from "@/lib/supabase/server";
import type { ImportLogRecord } from "@/lib/log-import/types";
import type { LogSection, ParsedLogReview, Result } from "@/types/index";

type ProfileRow = {
  ptcgl_username: string;
};

type ImportContext = {
  user: Awaited<ReturnType<typeof requireUser>>;
  supabase: Awaited<ReturnType<typeof createClient>>;
  catalog: Awaited<ReturnType<typeof loadIdentificationCatalog>>;
  ptcglUsername: string;
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

async function getImportContext(): Promise<ImportContext> {
  const user = await measureServerCall("logs.import.requireUser", () => requireUser());
  const supabase = await measureServerCall("logs.import.createClient", () => createClient());
  const { data: profile, error: profileError } = await measureServerCall(
    "logs.import.loadProfile",
    async () =>
      await supabase
        .from("profiles")
        .select("ptcgl_username")
        .eq("id", user.id)
        .single()
  );

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

  const catalog = await measureServerCall("logs.import.loadIdentificationCatalog", () =>
    loadIdentificationCatalog()
  );

  return {
    user,
    supabase,
    catalog,
    ptcglUsername
  };
}

async function buildParsedLogReview(
  rawLog: string,
  context?: ImportContext
): Promise<{ context: ImportContext; review: ParsedLogReview }> {
  const resolvedRawLog = await measureServerCall(
    "logs.import.resolveBattleLogImportInput",
    () => resolveBattleLogImportInput(rawLog)
  );
  const trimmedRawLog = String(resolvedRawLog || "").trim();

  if (!trimmedRawLog) {
    throw new ImportLogValidationError("EMPTY_INPUT", "Paste a PTCGL battle log before importing.");
  }

  const importContext = context ?? (await measureServerCall("logs.import.getImportContext", () => getImportContext()));
  const { catalog, ptcglUsername } = importContext;
  const parsed = measureServerStep("logs.import.parseBattleLog", () =>
    parseBattleLog({
      rawLog: trimmedRawLog,
      ptcglUsername,
      catalog
    })
  );

  const selfArchetype = measureServerStep("logs.import.identifyLikelyArchetype.self", () =>
    identifyLikelyArchetype({
      evidence: parsed.pokemonEvidence.self,
      catalog
    })
  );
  const opponentArchetype = measureServerStep("logs.import.identifyLikelyArchetype.opponent", () =>
    identifyLikelyArchetype({
      evidence: parsed.pokemonEvidence.opponent,
      catalog
    })
  );

  const selfSprites = measureServerStep("logs.import.selectDeckSprites.self", () =>
    selectDeckSprites({
      archetype: selfArchetype,
      evidence: parsed.pokemonEvidence.self,
      catalog
    })
  );
  const opponentSprites = measureServerStep("logs.import.selectDeckSprites.opponent", () =>
    selectDeckSprites({
      archetype: opponentArchetype,
      evidence: parsed.pokemonEvidence.opponent,
      catalog
    })
  );

  const selfDeckName = getBattleLogDeckDisplayName(selfArchetype?.label ?? "", selfSprites.slugs);
  const selfDeckSlug = selfArchetype?.archetypeId ?? "";

  return {
    context: importContext,
    review: {
      selfPlayerName: parsed.players.selfPlayerName,
      opponentPlayerName: parsed.players.opponentPlayerName,
      selfDeckName,
      opponentDeckName: getBattleLogOpponentDisplayName(
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
      reason: parsed.stats.reason
    }
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
    const { review } = await buildParsedLogReview(rawLog);
    return review;
  } catch (error) {
    if (error instanceof ImportLogValidationError) {
      return {
        error: error.message
      };
    }

    const actionError = resolveActionFailure(error, {
      action: "parseLog",
      area: "logs",
      fallbackMessage: "We couldn't parse that battle log.",
      route: "/logs"
    });

    return {
      error: actionError.message
    };
  }
}

export async function importLogAction(formData: FormData): Promise<SaveActionResult> {
  try {
    const user = await requireUser();
    const supabase = await createClient();
    const rawLog = String(formData.get("rawLog") || "").trim();

    if (!rawLog) {
      throw userFacingActionError("Paste a PTCGL battle log before importing.");
    }

    const selectedDeckId = String(formData.get("linkedDeckId") || "").trim();
    const selectedDeckListId = String(formData.get("linkedDeckListId") || "").trim();
    const sections = parseSections(formData.get("sections"));
    const suggestedLinkedDeckId = selectedDeckId
      ? ""
      : (await measureServerCall("logs.import.linkDeckConservatively", () =>
          linkDeckConservatively({
            userId: user.id,
            identifiedDeckName: String(formData.get("selfDeckName") || "").trim(),
            identifiedDeckSlug: String(formData.get("selfDeckSlug") || "").trim(),
            identifiedSprites: parseStringArray(formData.getAll("selfSprites"))
          })
        )) ?? "";

    const record: ImportLogRecord = {
      id: crypto.randomUUID(),
      date: String(formData.get("date") || "").trim() || buildImportDate(),
      result: parseResult(formData.get("result")),
      format: String(formData.get("format") || "").trim(),
      go_order: parseGoOrder(formData.get("goOrder")),
      self_player_name: String(formData.get("selfPlayerName") || "").trim(),
      self_deck_name: String(formData.get("selfDeckName") || "").trim(),
      self_deck_slug: String(formData.get("selfDeckSlug") || "").trim(),
      self_deck_sprites: joinSprites(parseStringArray(formData.getAll("selfSprites"))),
      opponent_player_name: String(formData.get("opponentPlayerName") || "").trim(),
      opponent_deck_name: String(formData.get("opponentDeckName") || "").trim(),
      opponent_deck_slug: String(formData.get("opponentDeckSlug") || "").trim(),
      opponent_deck_sprites: joinSprites(parseStringArray(formData.getAll("opponentSprites"))),
      total_turns: Number(formData.get("totalTurns")) || 0,
      coin_toss_won: parseBoolean(formData.get("coinTossWon")),
      self_prizes_taken: Number(formData.get("selfPrizesTaken")) || 0,
      opponent_prizes_taken: Number(formData.get("opponentPrizesTaken")) || 0,
      self_attack_damage: Number(formData.get("selfAttackDamage")) || 0,
      opponent_attack_damage: Number(formData.get("opponentAttackDamage")) || 0,
      self_mulligans: Number(formData.get("selfMulligans")) || 0,
      opponent_mulligans: Number(formData.get("opponentMulligans")) || 0,
      linked_deck_id: selectedDeckId || suggestedLinkedDeckId || null,
      linked_deck_list_id: selectedDeckListId || null,
      reason: String(formData.get("reason") || "").trim(),
      raw_log: rawLog,
      sections
    };

    const { error: insertError } = await supabase.from("logs").insert({
      ...record,
      user_id: user.id
    });

    if (insertError) {
      throw insertError;
    }

    revalidateWorkspaceViews();

    return {
      ok: true,
      redirectTo: `/logs/${record.id}`
    };
  } catch (error) {
    throw resolveActionFailure(error, {
      action: "importLog",
      area: "logs",
      fallbackMessage: "We couldn't import that battle log right now.",
      route: "/logs"
    });
  }
}

export async function updateLogAction(formData: FormData): Promise<SaveActionResult> {
  const logId = String(formData.get("logId") || "").trim();

  try {
    const user = await requireUser();
    const supabase = await createClient();

    if (!logId) {
      throw userFacingActionError("Missing battle log ID.");
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
  } catch (error) {
    throw resolveActionFailure(error, {
      action: "updateLog",
      area: "logs",
      fallbackMessage: "We couldn't update that battle log right now.",
      logId,
      route: "/logs"
    });
  }
}

export async function bulkAssignDeckListAction(input: {
  logIds: string[];
  linkedDeckId: string;
  linkedDeckListId: string;
}): Promise<void> {
  const logIds = Array.from(
    new Set(
      (input.logIds ?? [])
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );
  const linkedDeckId = String(input.linkedDeckId || "").trim();
  const linkedDeckListId = String(input.linkedDeckListId || "").trim();

  try {
    const user = await requireUser();
    const supabase = await createClient();

    if (!logIds.length) {
      throw userFacingActionError("Select at least one battle log.");
    }

    if (!linkedDeckId || !linkedDeckListId) {
      throw userFacingActionError("Choose both a deck strategy and deck list first.");
    }

    const userDecks = await getDecks(user.id);
    const selectedDeck = userDecks.find((deck) => deck.id === linkedDeckId);
    const selectedDeckList = selectedDeck?.deckLists.find(
      (deckList) => deckList.id === linkedDeckListId
    );

    if (!selectedDeck || !selectedDeckList) {
      throw userFacingActionError("That deck list could not be found.");
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
  } catch (error) {
    throw resolveActionFailure(error, {
      action: "bulkAssignDeckList",
      area: "logs",
      fallbackMessage: "We couldn't update those linked deck lists right now.",
      route: "/logs",
      userId: undefined
    });
  }
}

export async function loadMoreLogsAction(windowEndDate?: string) {
  const user = await requireUser();
  return getLogsWindow(user.id, {
    windowEndDate
  });
}

export async function deleteLogsAction(logIdsInput: string[]): Promise<void> {
  const logIds = Array.from(
    new Set(
      (logIdsInput ?? [])
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );

  try {
    const user = await requireUser();
    const supabase = await createClient();

    if (!logIds.length) {
      throw userFacingActionError("Select at least one battle log.");
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
  } catch (error) {
    throw resolveActionFailure(error, {
      action: "deleteLogs",
      area: "logs",
      fallbackMessage: "We couldn't delete those battle logs right now.",
      route: "/logs"
    });
  }
}

export async function deleteLogAction(logIdInput: string): Promise<void> {
  const logId = String(logIdInput || "").trim();

  if (!logId) {
    throw userFacingActionError("Missing battle log ID.");
  }

  await deleteLogsAction([logId]);
}

export async function createLogShareAction(logId: string): Promise<{
  expiresAt: string;
  shareId: string;
  shareUrl: string;
}> {
  const user = await requireUser();
  const normalizedLogId = String(logId || "").trim();

  try {
    if (!normalizedLogId) {
      throw userFacingActionError("Missing battle log ID.");
    }

    const [log, userDecks] = await Promise.all([
      getLogById(user.id, normalizedLogId),
      getDecks(user.id)
    ]);

    if (!log) {
      throw userFacingActionError("Battle log not found.");
    }

    const linkedDeck = log.linkedDeckId
      ? userDecks.find((deck) => deck.id === log.linkedDeckId) ?? null
      : null;
    const linkedDeckList = linkedDeck?.deckLists.find(
      (deckList) => deckList.id === log.linkedDeckListId
    );
    const hydratedLinkedDeckList =
      linkedDeck?.id && linkedDeckList?.id
        ? await getDeckWithList(user.id, linkedDeck.id, linkedDeckList.id)
        : null;
    const linkedStrategyLabel =
      linkedDeckList?.name ?? linkedDeck?.deckName ?? "No strategy linked";
    const sharedLog = {
      ...log,
      id: "shared-log",
      userId: "",
      linkedDeckId: undefined,
      linkedDeckListId: undefined
    };
    const share = await getOrCreateLogShareSnapshot({
      ownerUserId: user.id,
      sourceLogId: normalizedLogId,
      log: sharedLog,
      linkedStrategyLabel,
      linkedDeckListFormat: hydratedLinkedDeckList?.deckList.format ?? linkedDeckList?.format,
      linkedDeckListName: hydratedLinkedDeckList?.deckList.name ?? linkedDeckList?.name,
      linkedDeckListNotes: hydratedLinkedDeckList?.deckList.notes ?? linkedDeckList?.notes,
      linkedDeckListRawList: hydratedLinkedDeckList?.deckList.rawList ?? linkedDeckList?.rawList,
      linkedDeckListSortedCards: hydratedLinkedDeckList?.deckList.sortedCards ?? []
    });

    const shareUrl = `${await getAppOrigin()}/shared/${share.id}`;

    return {
      expiresAt: share.expiresAt,
      shareId: share.id,
      shareUrl
    };
  } catch (error) {
    throw resolveActionFailure(error, {
      action: "createShare",
      area: "logs",
      fallbackMessage: "We couldn't create a share link for this battle log right now.",
      logId: normalizedLogId,
      route: "/logs",
      userId: user.id
    });
  }
}

export async function revokeLogShareAction(shareId: string): Promise<void> {
  const user = await requireUser();
  const normalizedShareId = String(shareId || "").trim();

  try {
    if (!normalizedShareId) {
      throw userFacingActionError("Missing share link ID.");
    }

    const didRevoke = await revokeLogShare(normalizedShareId, user.id);
    if (!didRevoke) {
      throw userFacingActionError("Share link not found or already revoked.");
    }

    revalidatePath("/logs", "layout");
  } catch (error) {
    throw resolveActionFailure(error, {
      action: "revokeShare",
      area: "logs",
      fallbackMessage: "We couldn't revoke that share link right now.",
      route: "/logs",
      shareId: normalizedShareId,
      userId: user.id
    });
  }
}
