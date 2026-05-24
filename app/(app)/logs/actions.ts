"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import {
  getBattleLogDeckDisplayName,
  getBattleLogOpponentDisplayName
} from "@/lib/battle-log/display";
import { buildDeckArchetypeId } from "@/lib/decks/archetype";
import { resolveBattleLogImportInput } from "@/lib/battle-log/training-court";
import { linkDeckConservatively } from "@/lib/log-import/deck-linking";
import { identifyLikelyArchetype } from "@/lib/log-import/identifier/archetypes";
import { loadIdentificationCatalog } from "@/lib/log-import/identifier/catalog";
import { selectDeckSprites } from "@/lib/log-import/identifier/sprites";
import {
  LEARNED_SELF_ARCHETYPE_THRESHOLD,
  resolveLearnedSelfArchetype,
  resolveLearnedSelfArchetypeFromCandidates
} from "@/lib/log-import/learned-self-archetypes";
import { parseBattleLog } from "@/lib/log-import/parser";
import { ImportLogValidationError } from "@/lib/log-import/types";
import { getDeckWithList, getDecks } from "@/lib/db/decks";
import { hydrateLogWindowDeckListNames } from "@/lib/db/log-linked-deck-list-names";
import { getOrCreateLogShareSnapshot, revokeLogShare } from "@/lib/db/log-shares";
import { getLogById, getLogsWindow } from "@/lib/db/logs";
import { getPublicAppOrigin } from "@/lib/server/app-url";
import {
  resolveActionFailure,
  userFacingActionError
} from "@/lib/server/action-errors";
import { getFormRedirectPath } from "@/lib/server/action-redirect";
import {
  parseBoolean,
  parseGoPreference,
  parseResult,
  parseStringArray
} from "@/lib/server/form-values";
import { measureServerCall, measureServerStep } from "@/lib/server/perf";
import { revalidateDeckAndLogWorkspace } from "@/lib/server/revalidation";
import { createClient } from "@/lib/supabase/server";
import type { ImportLogRecord } from "@/lib/log-import/types";
import type { LearnedSelfArchetype } from "@/lib/log-import/learned-self-archetypes";
import type { PlayerPokemonEvidence } from "@/lib/log-import/types";
import type { LogSection, ParsedLogReview } from "@/types/index";

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

function buildImportDate() {
  return new Date().toISOString().slice(0, 10);
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

function splitJoinedSprites(value: string) {
  return String(value || "")
    .split(",")
    .map((slug) => slug.trim())
    .filter(Boolean);
}

function buildLearnedSelfSpriteCandidates(args: {
  primarySprites: string[];
  evidence: PlayerPokemonEvidence;
}) {
  const candidates: string[][] = [];
  const primarySprites = args.primarySprites.filter(Boolean);
  if (primarySprites.length > 0) {
    candidates.push(primarySprites);
  }

  const rankedEvidenceSlugs = Array.from(args.evidence.mentionCounts.entries())
    .filter(([, count]) => count > 0)
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }

      return left[0].localeCompare(right[0]);
    })
    .map(([slug]) => slug)
    .slice(0, 10);

  rankedEvidenceSlugs.forEach((slug) => candidates.push([slug]));
  for (let leftIndex = 0; leftIndex < rankedEvidenceSlugs.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < rankedEvidenceSlugs.length; rightIndex += 1) {
      candidates.push([rankedEvidenceSlugs[leftIndex], rankedEvidenceSlugs[rightIndex]]);
    }
  }

  return candidates;
}

async function getImportContext(): Promise<ImportContext> {
  const [user, supabase, catalog] = await Promise.all([
    measureServerCall("logs.import.requireUser", () => requireUser()),
    measureServerCall("logs.import.createClient", () => createClient()),
    measureServerCall("logs.import.loadIdentificationCatalog", () =>
      loadIdentificationCatalog()
    )
  ]);
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

  return {
    user,
    supabase,
    catalog,
    ptcglUsername
  };
}

async function buildParsedLogReview(
  rawLog: string,
  context?: ImportContext,
  ptcglUsernameOverride?: string
): Promise<ParsedLogReview> {
  const resolvedRawLog = await measureServerCall(
    "logs.import.resolveBattleLogImportInput",
    () => resolveBattleLogImportInput(rawLog)
  );
  const trimmedRawLog = String(resolvedRawLog || "").trim();

  if (!trimmedRawLog) {
    throw new ImportLogValidationError("EMPTY_INPUT", "Paste a PTCGL battle log before importing.");
  }

  const normalizedPtcglUsername = String(ptcglUsernameOverride || "").trim();
  const importContext =
    context ??
    (normalizedPtcglUsername
      ? {
          user: null,
          supabase: null,
          catalog: await measureServerCall("logs.import.loadIdentificationCatalog", () =>
            loadIdentificationCatalog()
          ),
          ptcglUsername: normalizedPtcglUsername
        }
      : await measureServerCall("logs.import.getImportContext", () => getImportContext()));
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
  const selfLearnedCandidateSprites = selfArchetype
    ? measureServerStep("logs.import.selectLearnedCandidateSprites.self", () =>
        selectDeckSprites({
          archetype: null,
          evidence: parsed.pokemonEvidence.self,
          catalog
        })
      )
    : selfSprites;
  const shouldCheckLearnedSelfArchetype =
    selfLearnedCandidateSprites.slugs.length > 0 && !selfArchetype;
  let learnedSelfArchetype: LearnedSelfArchetype | null = null;
  if (shouldCheckLearnedSelfArchetype) {
    const [learningUser, learningSupabase] =
      importContext.user && importContext.supabase
        ? [importContext.user, importContext.supabase]
        : await Promise.all([
            measureServerCall("logs.import.requireUserForLearnedSelfArchetype", () => requireUser()),
            measureServerCall("logs.import.createClientForLearnedSelfArchetype", () => createClient())
          ]);

    learnedSelfArchetype = await measureServerCall(
      "logs.import.resolveLearnedSelfArchetype.self",
      () =>
        resolveLearnedSelfArchetype({
          supabase: learningSupabase,
          userId: learningUser.id,
          sprites: selfLearnedCandidateSprites.slugs
        })
    );

    if (!learnedSelfArchetype) {
      learnedSelfArchetype = await measureServerCall(
        "logs.import.resolveLearnedSelfArchetypeCandidates.self",
        () =>
          resolveLearnedSelfArchetypeFromCandidates({
            supabase: learningSupabase,
            userId: learningUser.id,
            candidates: buildLearnedSelfSpriteCandidates({
              primarySprites: selfLearnedCandidateSprites.slugs,
              evidence: parsed.pokemonEvidence.self
            })
          })
      );
    }
  }
  const resolvedSelfArchetype = learnedSelfArchetype ?? selfArchetype;
  const resolvedSelfSprites = learnedSelfArchetype?.sprites ?? selfSprites.slugs;

  const selfDeckName = getBattleLogDeckDisplayName(
    resolvedSelfArchetype?.label ?? "",
    resolvedSelfSprites
  );
  const selfDeckSlug = resolvedSelfArchetype?.archetypeId ?? "";

  return {
    selfPlayerName: parsed.players.selfPlayerName,
    opponentPlayerName: parsed.players.opponentPlayerName,
    selfDeckName,
    opponentDeckName: getBattleLogOpponentDisplayName(
      opponentArchetype?.label ?? "",
      opponentSprites.slugs
    ),
    selfSprites: resolvedSelfSprites,
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
  };
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

function assertMutatedRows(
  rows: Array<{ id?: unknown }> | null,
  expectedCount: number,
  message: string
) {
  if ((rows ?? []).length !== expectedCount) {
    throw userFacingActionError(message);
  }
}

export async function parseLogAction(formData: FormData): Promise<ParseLogActionResult> {
  try {
    const rawLog = String(formData.get("rawLog") || "");
    const ptcglUsername = String(formData.get("ptcglUsername") || "").trim();
    return await buildParsedLogReview(rawLog, undefined, ptcglUsername);
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
    const selectedSelfSprites = parseStringArray(formData.getAll("selfSprites"));
    const selectedOpponentSprites = parseStringArray(formData.getAll("opponentSprites"));
    const submittedSelfDeckSlug = String(formData.get("selfDeckSlug") || "").trim();
    const submittedSelfDeckName = String(formData.get("selfDeckName") || "").trim();
    const selectedSelfSpriteSlug = buildDeckArchetypeId(selectedSelfSprites);
    const learnedSelfArchetype =
      selectedSelfSprites.length === 0 || submittedSelfDeckSlug === selectedSelfSpriteSlug
      ? null
      : await measureServerCall("logs.import.resolveLearnedSelfArchetypeForSave.self", () =>
          resolveLearnedSelfArchetype({
            supabase,
            userId: user.id,
            sprites: selectedSelfSprites,
            minimumExistingMatches: LEARNED_SELF_ARCHETYPE_THRESHOLD - 1
          })
        );
    const suggestedLinkedDeckId = selectedDeckId
      ? ""
      : (await measureServerCall("logs.import.linkDeckConservatively", () =>
          linkDeckConservatively({
            userId: user.id,
            identifiedDeckName: learnedSelfArchetype?.label ?? submittedSelfDeckName,
            identifiedDeckSlug: learnedSelfArchetype?.archetypeId ?? submittedSelfDeckSlug,
            identifiedSprites: selectedSelfSprites
          })
        )) ?? "";

    const record: ImportLogRecord = {
      id: crypto.randomUUID(),
      date: String(formData.get("date") || "").trim() || buildImportDate(),
      result: parseResult(formData.get("result")),
      format: String(formData.get("format") || "").trim(),
      go_order: parseGoPreference(formData.get("goOrder")),
      self_player_name: String(formData.get("selfPlayerName") || "").trim(),
      self_deck_name: learnedSelfArchetype?.label ?? submittedSelfDeckName,
      self_deck_slug: learnedSelfArchetype?.archetypeId ?? submittedSelfDeckSlug,
      self_deck_sprites: joinSprites(selectedSelfSprites),
      opponent_player_name: String(formData.get("opponentPlayerName") || "").trim(),
      opponent_deck_name: String(formData.get("opponentDeckName") || "").trim(),
      opponent_deck_slug: String(formData.get("opponentDeckSlug") || "").trim(),
      opponent_deck_sprites: joinSprites(selectedOpponentSprites),
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

    revalidateDeckAndLogWorkspace();

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
    const nextSelfSprites = joinSprites(parseStringArray(formData.getAll("selfSprites")));
    const nextOpponentSprites = joinSprites(parseStringArray(formData.getAll("opponentSprites")));
    const { data: existingLog, error: existingLogError } = await supabase
      .from("logs")
      .select("self_deck_name,self_deck_sprites,opponent_deck_name,opponent_deck_sprites")
      .eq("user_id", user.id)
      .eq("id", logId)
      .maybeSingle();

    if (existingLogError) {
      throw existingLogError;
    }

    const existingSelfSprites = String(existingLog?.self_deck_sprites ?? "");
    const existingOpponentSprites = String(existingLog?.opponent_deck_sprites ?? "");
    const selfSpritesChanged = nextSelfSprites !== existingSelfSprites;
    const opponentSpritesChanged = nextOpponentSprites !== existingOpponentSprites;
    const nextSelfSpriteList = splitJoinedSprites(nextSelfSprites);
    const nextOpponentSpriteList = splitJoinedSprites(nextOpponentSprites);

    const { data: updatedLogs, error } = await supabase
      .from("logs")
      .update({
        date,
        format,
        linked_deck_id: linkedDeckId || null,
        linked_deck_list_id: linkedDeckListId || null,
        self_deck_sprites: nextSelfSprites,
        opponent_deck_sprites: nextOpponentSprites,
        ...(selfSpritesChanged
          ? {
              self_deck_name: getBattleLogDeckDisplayName("", nextSelfSpriteList),
              self_deck_slug: buildDeckArchetypeId(nextSelfSpriteList)
            }
          : {}),
        ...(opponentSpritesChanged
          ? {
              opponent_deck_name: getBattleLogOpponentDisplayName("", nextOpponentSpriteList),
              opponent_deck_slug: buildDeckArchetypeId(nextOpponentSpriteList)
            }
          : {})
      })
      .eq("user_id", user.id)
      .eq("id", logId)
      .select("id");

    if (error) {
      throw error;
    }

    assertMutatedRows(updatedLogs, 1, "Battle log not found.");

    revalidateDeckAndLogWorkspace();

    return {
      ok: true,
      redirectTo: getFormRedirectPath(formData, `/logs/${logId}`)
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

    const { data: updatedLogs, error } = await supabase
      .from("logs")
      .update({
        linked_deck_id: linkedDeckId,
        linked_deck_list_id: linkedDeckListId
      })
      .eq("user_id", user.id)
      .in("id", logIds)
      .select("id");

    if (error) {
      throw error;
    }

    assertMutatedRows(updatedLogs, logIds.length, "Some selected battle logs could not be found.");

    revalidateDeckAndLogWorkspace();
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

export async function loadMoreLogsAction(cursor?: string) {
  const user = await requireUser();
  const window = await getLogsWindow(user.id, {
    cursor
  });

  return hydrateLogWindowDeckListNames(user.id, window);
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

    const { data: deletedLogs, error } = await supabase
      .from("logs")
      .delete()
      .eq("user_id", user.id)
      .in("id", logIds)
      .select("id");

    if (error) {
      throw error;
    }

    assertMutatedRows(deletedLogs, logIds.length, "Some selected battle logs could not be found.");

    revalidateDeckAndLogWorkspace();
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

    const shareUrl = `${await getPublicAppOrigin()}/shared/${share.id}`;

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
