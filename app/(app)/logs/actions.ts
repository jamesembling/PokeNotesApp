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
import { normalizeMatchNotes } from "@/lib/battle-log/match-notes";
import {
  getDeckLinkCandidates,
  resolveConservativeDeckLink
} from "@/lib/log-import/deck-linking";
import { buildImportDate } from "@/lib/log-import/import-date";
import { identifyLikelyArchetype } from "@/lib/log-import/identifier/archetypes";
import { loadIdentificationCatalog } from "@/lib/log-import/identifier/catalog";
import { selectDeckSprites } from "@/lib/log-import/identifier/sprites";
import {
  LEARNED_SELF_ARCHETYPE_THRESHOLD,
  resolveSelfArchetypeForSave
} from "@/lib/log-import/learned-self-archetypes";
import { parseBattleLog } from "@/lib/log-import/parser";
import { ImportLogValidationError } from "@/lib/log-import/types";
import { getDeckListById } from "@/lib/db/deck-lists";
import { getDeckWithList, getDecks } from "@/lib/db/decks";
import { validateDeckListReference } from "@/lib/db/deck-lists";
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
import {
  parseBoolean,
  parseGoPreference,
  parseResult,
  parseStringArray
} from "@/lib/server/form-values";
import { measureServerCall, measureServerStep } from "@/lib/server/perf";
import { invalidateInitialLogsCache } from "@/lib/server/logs-initial-cache";
import { revalidateDeckAndLogWorkspace } from "@/lib/server/revalidation";
import { getPublicSharedLogUrl } from "@/lib/server/share-url";
import { createClient } from "@/lib/supabase/server";
import type { ImportLogRecord } from "@/lib/log-import/types";
import type { LogSection, ParsedLogReview } from "@/types/index";
import { compactMap } from "@/lib/array";
import { decodeSerializedLogSections } from "@/lib/battle-log/runtime-validation";

type ProfileRow = {
  ptcgl_username: string;
};

type ImportContext = {
  user: Awaited<ReturnType<typeof requireAuth>>;
  supabase: Awaited<ReturnType<typeof createClient>>;
  catalog: Awaited<ReturnType<typeof loadIdentificationCatalog>>;
  ptcglUsername: string;
};

type ParseLogActionResult = ParsedLogReview | { error: string };
type SaveActionResult = {
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

async function getImportContext(
  user: Awaited<ReturnType<typeof requireAuth>>,
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<ImportContext> {
  const [catalog, profileResult] = await Promise.all([
    measureServerCall("logs.import.loadIdentificationCatalog", () =>
      loadIdentificationCatalog({
        supabase,
        userId: user.id
      })
    ),
    measureServerCall("logs.import.loadProfile", async () =>
      await supabase
        .from("profiles")
        .select("ptcgl_username")
        .eq("id", user.id)
        .single()
    )
  ]);
  const { data: profile, error: profileError } = profileResult;

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
  context: ImportContext | Promise<ImportContext>
): Promise<ParsedLogReview> {
  const [resolvedRawLog, importContext] = await Promise.all([
    measureServerCall("logs.import.resolveBattleLogImportInput", () =>
      resolveBattleLogImportInput(rawLog)
    ),
    context
  ]);
  const trimmedRawLog = String(resolvedRawLog || "").trim();

  if (!trimmedRawLog) {
    throw new ImportLogValidationError("EMPTY_INPUT", "Paste a PTCGL battle log before importing.");
  }

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
  const resolvedSelfArchetype = selfSprites.selectionSource === "archetype" ? selfArchetype : null;
  const resolvedSelfSprites = selfSprites.slugs;
  const resolvedOpponentArchetype =
    opponentSprites.selectionSource === "archetype" ? opponentArchetype : null;

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
  const sections = decodeSerializedLogSections(value);
  if (!sections) {
    throw userFacingActionError(
      "The parsed battle-log details were missing or invalid. Parse the log again before importing."
    );
  }

  return sections;
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
  const [user, supabase] = await Promise.all([
    measureServerCall("logs.import.requireUser", () => requireAuth()),
    measureServerCall("logs.import.createClient", () => createClient())
  ]);

  try {
    const rawLog = String(formData.get("rawLog") || "");
    return await buildParsedLogReview(rawLog, getImportContext(user, supabase));
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
  const [user, supabase] = await Promise.all([requireAuth(), createClient()]);

  try {
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
    const [catalog, deckLinkCandidates] = await Promise.all([
      selectedSelfSprites.length > 0
        ? measureServerCall("logs.import.loadIdentificationCatalogForSave", () =>
            loadIdentificationCatalog({
              supabase,
              userId: user.id
            })
          )
        : Promise.resolve(null),
      selectedDeckId
        ? Promise.resolve([])
        : measureServerCall("logs.import.getDeckLinkCandidates", () =>
            getDeckLinkCandidates(user.id, supabase)
          )
    ]);
    const resolvedSelfArchetype =
      !catalog
      ? null
      : await measureServerCall("logs.import.resolveSelfArchetypeForSave.self", () =>
          resolveSelfArchetypeForSave({
            supabase,
            userId: user.id,
            sprites: selectedSelfSprites,
            catalog,
            minimumExistingMatches: LEARNED_SELF_ARCHETYPE_THRESHOLD - 1
          })
        );
    const savedSelfSprites = resolvedSelfArchetype?.sprites ?? selectedSelfSprites;
    const suggestedLinkedDeckId = selectedDeckId
      ? ""
      : resolveConservativeDeckLink(deckLinkCandidates, {
          deckName: resolvedSelfArchetype?.label ?? submittedSelfDeckName,
          deckSlug: resolvedSelfArchetype?.archetypeId ?? submittedSelfDeckSlug,
          sprites: savedSelfSprites
        }) ?? "";
    const validatedReference = await validateDeckListReference({
      linkedDeckId:
        selectedDeckId || (selectedDeckListId ? null : suggestedLinkedDeckId) || null,
      linkedDeckListId: selectedDeckListId || null,
      supabase,
      userId: user.id
    });

    const record: ImportLogRecord = {
      id: crypto.randomUUID(),
      date: String(formData.get("date") || "").trim() || buildImportDate(),
      result: parseResult(formData.get("result")),
      format: String(formData.get("format") || "").trim(),
      go_order: parseGoPreference(formData.get("goOrder")),
      self_player_name: String(formData.get("selfPlayerName") || "").trim(),
      self_deck_name: resolvedSelfArchetype?.label ?? submittedSelfDeckName,
      self_deck_slug: resolvedSelfArchetype?.archetypeId ?? submittedSelfDeckSlug,
      self_deck_sprites: joinSprites(savedSelfSprites),
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
      linked_deck_id: validatedReference.deckId,
      linked_deck_list_id: validatedReference.deckListId,
      match_notes: normalizeMatchNotes(formData.get("matchNotes")),
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

    invalidateInitialLogsCache(user.id);
    after(() => {
      revalidateDeckAndLogWorkspace();
    });

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

export async function updateLogAction(formData: FormData): Promise<SaveActionResult> {
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

    invalidateInitialLogsCache(user.id);
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
