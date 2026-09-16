"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  getBattleLogDeckDisplayName,
  getBattleLogOpponentDisplayName
} from "@/lib/battle-log/display";
import { buildDeckArchetypeId } from "@/lib/decks/archetype";
import { resolveBattleLogImportInput } from "@/lib/battle-log/training-court";
import {
  resolveConservativeDeckLink
} from "@/lib/log-import/deck-linking";
import { buildImportDate } from "@/lib/log-import/import-date";
import { identifyLikelyArchetype } from "@/lib/log-import/identifier/archetypes";
import { loadIdentificationCatalog } from "@/lib/log-import/identifier/catalog";
import { selectDeckSprites } from "@/lib/log-import/identifier/sprites";
import {
  buildLearnedSelfArchetype,
  LEARNED_SELF_ARCHETYPE_THRESHOLD,
  promoteLearnedSelfArchetype
} from "@/lib/log-import/learned-self-archetypes";
import { parseBattleLog } from "@/lib/log-import/parser";
import { canonicalizeSelfPlayerSections } from "@/lib/log-import/parser/players";
import { ImportLogValidationError } from "@/lib/log-import/types";
import { getDeckListById } from "@/lib/db/deck-lists";
import { getDeckWithList, getDecks } from "@/lib/db/decks";
import { validateDeckListReference } from "@/lib/db/deck-lists";
import {
  commitPersistedBattleLogImportDraft,
  getPersistedBattleLogImportDraft,
  startPersistedBattleLogImportDraft,
  type PersistedBattleLogImportReview
} from "@/lib/db/battle-log-import-drafts";
import { hydrateLogWindowDeckListNames } from "@/lib/db/log-linked-deck-list-names";
import {
  MatchNotesWriteConflictError,
  persistOwnerMatchNotes
} from "@/lib/db/log-match-notes";
import {
  getOrCreateLogShareSnapshot,
  isLogShare24HourLimitError,
  isLogSharePayloadTooLargeError,
  isLogShareSourceNotFoundError,
  revokeLogShare
} from "@/lib/db/log-shares";
import { getLogById, getLogsWindow } from "@/lib/db/logs";
import {
  resolveActionFailure,
  userFacingActionError
} from "@/lib/server/action-errors";
import { getFormRedirectPath } from "@/lib/server/action-redirect";
import { parseStringArray } from "@/lib/server/form-values";
import {
  measureServerCall,
  measureServerCallWithTiming,
  measureServerStep,
  reportServerPerformance
} from "@/lib/server/perf";
import { invalidateInitialLogsCache } from "@/lib/server/logs-initial-cache";
import { reportError } from "@/lib/server/report-error";
import {
  invalidateBattleLogImportContext,
  loadCachedBattleLogImportContext,
  revalidateBattleLogImportContext
} from "@/lib/server/battle-log-import-context-cache";
import { revalidateDeckAndLogWorkspace } from "@/lib/server/revalidation";
import { getPublicSharedLogUrl } from "@/lib/server/share-url";
import { createClient } from "@/lib/supabase/server";
import type { ParsedLogReview } from "@/types/index";
import { compactMap } from "@/lib/array";
import {
  evaluateBattleLogImportDraftSave,
  parseBattleLogImportSaveRequest
} from "@/lib/log-import/import-draft";

type ImportContext = {
  cacheOutcome: "hit" | "miss";
  catalog: Awaited<ReturnType<typeof loadIdentificationCatalog>>;
  deckLinkCandidates: Awaited<
    ReturnType<typeof loadCachedBattleLogImportContext>
  >["value"]["deckLinkCandidates"];
  ptcglUsername: string;
  ptcglUsernameAliases: string[];
  timings: {
    catalogMs: number;
    contextMs: number;
  };
};

type ParsedLogReviewResult = {
  review: ParsedLogReview;
  timings: {
    catalogMs: number;
    contextCacheMiss: number;
    contextMs: number;
    identificationMs: number;
    inputMs: number;
    parseMs: number;
  };
};

export type ParseLogActionResult = PersistedBattleLogImportReview | { error: string };
export type SaveActionResult = {
  ok: true;
  redirectTo: string;
};

export type SaveMatchNotesResult = {
  matchNotes: string | null;
  ok: true;
};

function joinSprites(slugs: string[]) {
  return Array.from(
    new Set(
      compactMap(slugs, (slug) => String(slug || "").trim())
    )
  ).join(",");
}

function splitJoinedSprites(value: string) {
  return compactMap(String(value || "")
    .split(","), (slug) => slug.trim());
}

async function getImportContext(userId: string): Promise<ImportContext> {
  const context = await loadCachedBattleLogImportContext(userId);
  const catalogTiming = await measureServerCallWithTiming(
    "logs.import.buildIdentificationCatalog",
    () =>
      loadIdentificationCatalog({
        learnedArchetypeRows: context.value.learnedArchetypeRows
      })
  );
  const { deckLinkCandidates, ptcglUsername, ptcglUsernameAliases } = context.value;

  if (!ptcglUsername) {
    throw new ImportLogValidationError(
      "MISSING_PTCGL_USERNAME",
      "Set your PTCGL username in your profile before importing battle logs."
    );
  }

  return {
    cacheOutcome: context.cacheOutcome,
    catalog: catalogTiming.value,
    deckLinkCandidates,
    ptcglUsername,
    ptcglUsernameAliases,
    timings: {
      catalogMs: catalogTiming.durationMs,
      contextMs: context.durationMs
    }
  };
}

async function buildParsedLogReview(
  rawLog: string,
  context: ImportContext | Promise<ImportContext>
): Promise<ParsedLogReviewResult> {
  const [inputTiming, importContext] = await Promise.all([
    measureServerCallWithTiming("logs.import.resolveBattleLogImportInput", () =>
      resolveBattleLogImportInput(rawLog)
    ),
    context
  ]);
  const resolvedRawLog = inputTiming.value;
  const trimmedRawLog = String(resolvedRawLog || "").trim();

  if (!trimmedRawLog) {
    throw new ImportLogValidationError("EMPTY_INPUT", "Paste a PTCGL battle log before importing.");
  }

  const { catalog, ptcglUsername, ptcglUsernameAliases } = importContext;
  const parseStartedAt = performance.now();
  const parsed = measureServerStep("logs.import.parseBattleLog", () =>
    parseBattleLog({
      rawLog: trimmedRawLog,
      ptcglUsername,
      ptcglUsernameAliases,
      catalog
    })
  );
  const parseMs = performance.now() - parseStartedAt;

  const identificationStartedAt = performance.now();
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
  const resolvedSelfArchetype = selfSprites.selectionSource === "archetype" ? selfArchetype : null;
  const resolvedSelfSprites = selfSprites.slugs;
  const resolvedOpponentArchetype =
    opponentSprites.selectionSource === "archetype" ? opponentArchetype : null;
  const identificationMs = performance.now() - identificationStartedAt;

  const selfDeckName = getBattleLogDeckDisplayName(
    resolvedSelfArchetype?.label ?? "",
    resolvedSelfSprites
  );
  const selfDeckSlug = resolvedSelfArchetype?.archetypeId ?? "";

  const review: ParsedLogReview = {
    selfPlayerName: ptcglUsername,
    opponentPlayerName: parsed.players.opponentPlayerName,
    selfDeckName,
    opponentDeckName: getBattleLogOpponentDisplayName(
      resolvedOpponentArchetype?.label ?? "",
      opponentSprites.slugs
    ),
    selfSprites: resolvedSelfSprites,
    opponentSprites: opponentSprites.slugs,
    selfDeckSlug,
    opponentDeckSlug: resolvedOpponentArchetype?.archetypeId ?? "",
    date: buildImportDate(),
    goOrder: parsed.stats.goOrder,
    coinTossWon: parsed.stats.coinTossWon,
    result: parsed.stats.result,
    language: parsed.language,
    rawLog: parsed.rawLog,
    sections: canonicalizeSelfPlayerSections(
      parsed.sections,
      parsed.players.selfPlayerName,
      ptcglUsername
    ),
    totalTurns: parsed.stats.totalTurns,
    selfPrizesTaken: parsed.stats.selfPrizesTaken,
    opponentPrizesTaken: parsed.stats.opponentPrizesTaken,
    selfAttackDamage: parsed.stats.selfAttackDamage,
    opponentAttackDamage: parsed.stats.opponentAttackDamage,
    selfMulligans: parsed.stats.selfMulligans,
    opponentMulligans: parsed.stats.opponentMulligans,
    reason: parsed.stats.reason
  };

  const suggestedLinkedDeckId = resolveConservativeDeckLink(importContext.deckLinkCandidates, {
    deckName: selfDeckName,
    deckSlug: selfDeckSlug,
    sprites: resolvedSelfSprites
  });
  const suggestedLinkedDeck = suggestedLinkedDeckId
    ? importContext.deckLinkCandidates.find((deck) => deck.id === suggestedLinkedDeckId)
    : null;

  review.suggestedLinkedDeckId = suggestedLinkedDeckId ?? undefined;
  review.suggestedLinkedDeckName = suggestedLinkedDeck?.deckName;

  return {
    review,
    timings: {
      catalogMs: importContext.timings.catalogMs,
      contextCacheMiss: importContext.cacheOutcome === "miss" ? 1 : 0,
      contextMs: importContext.timings.contextMs,
      identificationMs,
      inputMs: inputTiming.durationMs,
      parseMs
    }
  };
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
  const actionStartedAt = performance.now();
  const userTiming = await measureServerCallWithTiming("logs.import.requireUser", () =>
    requireAuth()
  );
  const user = userTiming.value;

  try {
    const rawLog = String(formData.get("rawLog") || "");
    const format = String(formData.get("format") || "").trim();
    const parsedResult = await buildParsedLogReview(rawLog, getImportContext(user.id));
    const draftStartedAt = performance.now();
    const draft = startPersistedBattleLogImportDraft({
      format,
      review: parsedResult.review,
      userId: user.id
    });
    const draftScheduleMs = performance.now() - draftStartedAt;
    after(async () => {
      const persistStartedAt = performance.now();
      try {
        await draft.persist;
        reportServerPerformance("logs.import.draftPersist", {
          persistMs: performance.now() - persistStartedAt
        });
      } catch (error) {
        reportError(error, {
          action: "persistBattleLogImportDraft",
          area: "logs",
          boundary: "battle-log-import-draft-after",
          route: "/logs",
          userId: user.id
        });
      }
    });
    reportServerPerformance("logs.import.review", {
      actionMs: performance.now() - actionStartedAt,
      authMs: userTiming.durationMs,
      catalogMs: parsedResult.timings.catalogMs,
      contextCacheMiss: parsedResult.timings.contextCacheMiss,
      contextMs: parsedResult.timings.contextMs,
      draftScheduleMs,
      identificationMs: parsedResult.timings.identificationMs,
      inputMs: parsedResult.timings.inputMs,
      parseMs: parsedResult.timings.parseMs
    });
    return draft.review;
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

export async function importLogAction(
  formData: FormData,
  invalidationContext: "route-handler" | "server-action" = "server-action"
): Promise<SaveActionResult> {
  const [user, supabase] = await Promise.all([requireAuth(), createClient()]);

  try {
    const selectedSelfSprites = parseStringArray(formData.getAll("selfSprites"));
    const selectedOpponentSprites = parseStringArray(formData.getAll("opponentSprites"));
    const request = parseBattleLogImportSaveRequest({
      draftId: formData.get("draftId"),
      idempotencyKey: formData.get("idempotencyKey"),
      editable: {
        selfDeckSlug: buildDeckArchetypeId(selectedSelfSprites),
        selfDeckSprites: selectedSelfSprites,
        opponentDeckSlug: buildDeckArchetypeId(selectedOpponentSprites),
        opponentDeckSprites: selectedOpponentSprites,
        date: formData.get("date"),
        format: formData.get("format"),
        linkedDeckId: formData.get("linkedDeckId"),
        linkedDeckListId: formData.get("linkedDeckListId"),
        matchNotes: formData.get("matchNotes")
      }
    });
    const draft = await getPersistedBattleLogImportDraft(request.draftId);
    const decision = evaluateBattleLogImportDraftSave({
      draft,
      userId: user.id,
      request,
      now: new Date().toISOString()
    });
    if (decision.status === "rejected") {
      throw userFacingActionError(decision.message);
    }

    const catalog = await measureServerCall(
      "logs.import.loadIdentificationCatalogForSave",
      () => loadIdentificationCatalog({ supabase, userId: user.id })
    );
    const learnedCandidate = buildLearnedSelfArchetype(selectedSelfSprites, 0);
    const knownSelfArchetype = learnedCandidate
      ? catalog.archetypes.byId.get(learnedCandidate.archetypeId)
      : null;
    const resolvedSelfSprites = knownSelfArchetype?.sprites ?? selectedSelfSprites;
    const resolvedSelfSlug = buildDeckArchetypeId(resolvedSelfSprites);
    const resolvedSelfName = getBattleLogDeckDisplayName(
      knownSelfArchetype?.label ?? "",
      resolvedSelfSprites
    );
    const result = await commitPersistedBattleLogImportDraft({
      draftId: request.draftId,
      editable: request.editable,
      idempotencyKey: request.idempotencyKey,
      resolved: {
        selfDeckName: resolvedSelfName,
        selfDeckSlug: resolvedSelfSlug,
        selfDeckSprites: resolvedSelfSprites,
        opponentDeckName: getBattleLogOpponentDisplayName("", selectedOpponentSprites),
        opponentDeckSlug: buildDeckArchetypeId(selectedOpponentSprites),
        opponentDeckSprites: selectedOpponentSprites
      },
      userId: user.id
    });

    const selfSelectionChanged = Boolean(
      draft && joinSprites(draft.editable.selfDeckSprites) !== joinSprites(selectedSelfSprites)
    );
    await promoteLearnedSelfArchetype({
      supabase,
      userId: user.id,
      sprites: resolvedSelfSprites,
      catalog,
      minimumExistingMatches: selfSelectionChanged ? 1 : LEARNED_SELF_ARCHETYPE_THRESHOLD
    });

    if (invalidationContext === "route-handler") {
      revalidateBattleLogImportContext(user.id);
    } else {
      invalidateBattleLogImportContext(user.id);
    }
    invalidateInitialLogsCache(user.id, invalidationContext);
    after(() => {
      revalidateDeckAndLogWorkspace();
    });

    return {
      ok: true,
      redirectTo: `/logs/${result.battleLogId}`
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

export async function saveMatchNotesAction(
  formData: FormData
): Promise<SaveMatchNotesResult> {
  const logId = String(formData.get("logId") || "").trim();
  const [user, supabase] = await Promise.all([requireAuth(), createClient()]);

  try {
    if (!logId) {
      throw userFacingActionError("This battle log is unavailable.");
    }

    const matchNotes = await persistOwnerMatchNotes(supabase, {
      logId,
      userId: user.id,
      value: formData.get("matchNotes")
    });

    invalidateInitialLogsCache(user.id);
    revalidatePath(`/logs/${logId}`);

    return {
      matchNotes,
      ok: true
    };
  } catch (error) {
    if (error instanceof MatchNotesWriteConflictError) {
      throw userFacingActionError("This battle log is unavailable.");
    }

    throw resolveActionFailure(error, {
      action: "saveMatchNotes",
      area: "logs",
      fallbackMessage: "We couldn't save those match notes right now.",
      route: `/logs/${logId}`
    });
  }
}

export async function updateLogAction(
  formData: FormData,
  invalidationContext: "route-handler" | "server-action" = "server-action"
): Promise<SaveActionResult> {
  const logId = String(formData.get("logId") || "").trim();
  const [user, supabase] = await Promise.all([requireAuth(), createClient()]);

  try {
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
    const validatedReference = await validateDeckListReference({
      linkedDeckId: linkedDeckId || null,
      linkedDeckListId: linkedDeckListId || null,
      supabase,
      userId: user.id
    });

    const { data: updatedLogs, error } = await supabase
      .from("logs")
      .update({
        date,
        format,
        linked_deck_id: validatedReference.deckId,
        linked_deck_list_id: validatedReference.deckListId,
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

    invalidateInitialLogsCache(user.id, invalidationContext);
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
  linkedDeckId?: string | null;
  linkedDeckListId: string;
}): Promise<void> {
  const logIds = Array.from(
    new Set(
      compactMap(input.logIds ?? [], (value) => String(value || "").trim())
    )
  );
  const linkedDeckId = String(input.linkedDeckId || "").trim() || null;
  const linkedDeckListId = String(input.linkedDeckListId || "").trim();
  const [user, supabase] = await Promise.all([requireAuth(), createClient()]);

  try {
    if (!logIds.length) {
      throw userFacingActionError("Select at least one battle log.");
    }

    if (!linkedDeckListId) {
      throw userFacingActionError("Choose a deck list first.");
    }

    const validatedReference = await validateDeckListReference({
      linkedDeckId,
      linkedDeckListId,
      supabase,
      userId: user.id
    });

    const { data: updatedLogs, error } = await supabase
      .from("logs")
      .update({
        linked_deck_id: validatedReference.deckId,
        linked_deck_list_id: validatedReference.deckListId
      })
      .eq("user_id", user.id)
      .in("id", logIds)
      .select("id");

    if (error) {
      throw error;
    }

    assertMutatedRows(updatedLogs, logIds.length, "Some selected battle logs could not be found.");

    invalidateInitialLogsCache(user.id);
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
  const user = await requireAuth();
  const window = await getLogsWindow(user.id, {
    cursor
  });

  return hydrateLogWindowDeckListNames(user.id, window);
}

export async function deleteLogsAction(logIdsInput: string[]): Promise<void> {
  const logIds = Array.from(
    new Set(
      compactMap(logIdsInput ?? [], (value) => String(value || "").trim())
    )
  );
  const [user, supabase] = await Promise.all([requireAuth(), createClient()]);

  try {
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

    invalidateInitialLogsCache(user.id);
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
  await requireAuth();

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
  const user = await requireAuth();
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
    const deckListById = log.linkedDeckListId
      ? await getDeckListById(user.id, log.linkedDeckListId, log.linkedDeckId ?? null)
        : null;
    const linkedDeckList = linkedDeck?.deckLists.find(
      (deckList) => deckList.id === log.linkedDeckListId
    ) ?? deckListById;
    const hydratedLinkedDeckList =
      linkedDeck?.id && linkedDeckList?.id
        ? await getDeckWithList(user.id, linkedDeck.id, linkedDeckList.id)
        : null;
    const resolvedDeckList = hydratedLinkedDeckList?.deckList ?? linkedDeckList;
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
      linkedDeckListFormat: resolvedDeckList?.format,
      linkedDeckListName: resolvedDeckList?.name,
      linkedDeckListNotes: resolvedDeckList?.notes,
      linkedDeckListRawList: resolvedDeckList?.rawList,
      linkedDeckListSortedCards: resolvedDeckList?.sortedCards ?? []
    });

    const shareUrl = await getPublicSharedLogUrl(share.id);

    return {
      expiresAt: share.expiresAt,
      shareId: share.id,
      shareUrl
    };
  } catch (error) {
    if (isLogShare24HourLimitError(error)) {
      throw userFacingActionError(
        "You've reached the limit of 50 new share links in a rolling 24-hour period. Existing active links still work; try creating a new one later.",
        { code: "LOG_SHARE_RATE_LIMIT", httpStatus: 429 }
      );
    }

    if (isLogSharePayloadTooLargeError(error)) {
      throw userFacingActionError(
        "This battle log is too large to share safely. The original log remains unchanged.",
        { code: "LOG_SHARE_PAYLOAD_TOO_LARGE", httpStatus: 413 }
      );
    }

    if (isLogShareSourceNotFoundError(error)) {
      throw userFacingActionError("Battle log not found.", {
        code: "LOG_SHARE_SOURCE_NOT_FOUND",
        httpStatus: 404
      });
    }

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
  const user = await requireAuth();
  const normalizedShareId = String(shareId || "").trim();

  try {
    if (!normalizedShareId) {
      throw userFacingActionError("Missing share link ID.");
    }

    const didRevoke = await revokeLogShare(normalizedShareId, user.id);
    if (!didRevoke) {
      throw userFacingActionError("Share link not found or already revoked.", {
        code: "LOG_SHARE_NOT_FOUND",
        httpStatus: 404
      });
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
