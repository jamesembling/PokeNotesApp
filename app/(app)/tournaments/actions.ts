"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { saveDeckList } from "@/lib/decks/deck-list-service";
import { getBattleLogSpriteDisplayName } from "@/lib/battle-log/display";
import { getDefaultSyncedSiteFormat, isKnownSyncedSiteFormat } from "@/lib/formats/catalog";
import {
  toActionFailureResult,
  userFacingActionError
} from "@/lib/server/action-errors";
import { getFormRedirectPath, withRefreshToken } from "@/lib/server/action-redirect";
import type { FailedActionResult } from "@/lib/server/action-errors";
import { createClient } from "@/lib/supabase/server";
import { validateDeckListReference } from "@/lib/db/deck-lists";
import { normalizeTournamentDateRange } from "@/lib/tournaments/date-range";
import { saveTournamentDeckListForTournament } from "@/lib/tournaments/deck-list-workflow";
import {
  TOURNAMENT_CATEGORY_OPTIONS,
  parseTournamentJudgeRole,
  parseTournamentParticipation,
  TOURNAMENT_PLACEMENT_OPTIONS,
  TOURNAMENT_ROUND_GAME_RESULT_OPTIONS,
  TOURNAMENT_ROUND_SPECIAL_RESULT_OPTIONS
} from "@/lib/tournaments/options";
import type {
  TournamentCategory,
  TournamentJudgeRole,
  TournamentPlacement,
  TournamentRoundGameResult,
  TournamentRoundSpecialResult,
  TournamentRoundResult
} from "@/types/index";
import { compactMap } from "@/lib/array";

type SaveActionResult = {
  ok: true;
  redirectTo: string;
} | FailedActionResult;

type PostgrestLikeError = {
  code?: string | null;
  details?: string | null;
  hint?: string | null;
  message?: string | null;
};

function isMissingTournamentDeckListColumns(error: PostgrestLikeError | null) {
  return error?.code === "42703";
}

function isMissingTournamentRoundRpc(error: PostgrestLikeError | null) {
  if (!error || !["42883", "PGRST202"].includes(String(error.code || ""))) {
    return false;
  }

  return [error.message, error.details, error.hint]
    .filter(Boolean)
    .some((value) => /create_tournament_round/i.test(String(value)));
}

function isOutdatedTournamentRoundResultConstraint(error: PostgrestLikeError) {
  if (error.code !== "23514") {
    return false;
  }

  return [error.message, error.details, error.hint]
    .filter(Boolean)
    .some((value) => String(value).includes("tournament_rounds_result_check"));
}

function isMissingTournamentEventDetailsMigration(error: PostgrestLikeError) {
  const errorText = [error.message, error.details, error.hint].filter(Boolean).join(" ");

  if (
    ["42703", "PGRST204"].includes(String(error.code || "")) &&
    /tournament_identifier|location|championship_points|professor_points/i.test(errorText)
  ) {
    return true;
  }

  return (
    error.code === "23514" &&
    /tournaments_category_check/i.test(errorText)
  );
}

function revalidateTournamentWorkspace(tournamentId?: string) {
  revalidatePath("/tournaments", "layout");
  if (tournamentId) {
    revalidatePath(`/tournaments/${tournamentId}`);
  }
}

function toUserFacingDatabaseError(error: PostgrestLikeError) {
  if (error.code === "P0002" && /tournament could not be found/i.test(String(error.message || ""))) {
    return userFacingActionError("Tournament could not be found.");
  }

  if (isOutdatedTournamentRoundResultConstraint(error)) {
    return userFacingActionError(
      "Your Supabase tournament round constraint is out of date. Run the latest tournament rounds SQL update, then try again."
    );
  }

  if (isMissingTournamentEventDetailsMigration(error)) {
    return userFacingActionError(
      "Tournament event details need the latest database migration before they can be saved."
    );
  }

  if (
    ["42703", "PGRST204"].includes(String(error.code || "")) &&
    /participation|judge_role/i.test(
      [error.message, error.details, error.hint].filter(Boolean).join(" ")
    )
  ) {
    return userFacingActionError(
      "Tournament participation needs the latest database migration before it can be saved."
    );
  }

  return userFacingActionError("We couldn't save that tournament update right now.");
}

function parseCategory(value: FormDataEntryValue | null): TournamentCategory {
  const normalized = String(value || "").trim();
  return TOURNAMENT_CATEGORY_OPTIONS.some((option) => option.value === normalized)
    ? (normalized as TournamentCategory)
    : "";
}

function parsePlacement(value: FormDataEntryValue | null): TournamentPlacement {
  const normalized = String(value || "").trim();
  return TOURNAMENT_PLACEMENT_OPTIONS.some((option) => option.value === normalized)
    ? (normalized as TournamentPlacement)
    : "";
}

function parseOptionalEventDetail(
  value: FormDataEntryValue | null,
  label: string,
  maxLength: number
) {
  const normalized = String(value || "").trim();

  if (normalized.length > maxLength) {
    throw userFacingActionError(`${label} must be ${maxLength} characters or fewer.`);
  }

  return normalized;
}

function parseOptionalPoints(value: FormDataEntryValue | null, label: string) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    return null;
  }

  if (!/^\d+$/.test(normalized)) {
    throw userFacingActionError(
      `Enter ${label} as a whole number of 0 or more.`
    );
  }

  const points = Number(normalized);
  if (!Number.isSafeInteger(points) || points > 2_147_483_647) {
    throw userFacingActionError(`${label} are too large to save.`);
  }

  return points;
}

function requireJudgeRole(value: FormDataEntryValue | null): Exclude<TournamentJudgeRole, ""> {
  const role = parseTournamentJudgeRole(value);

  if (!role) {
    throw userFacingActionError("Choose a judge role before saving.");
  }

  return role;
}

function parseRoundGameResult(value: FormDataEntryValue | null): "" | TournamentRoundGameResult {
  const normalized = String(value || "").trim();
  return TOURNAMENT_ROUND_GAME_RESULT_OPTIONS.includes(normalized as TournamentRoundGameResult)
    ? (normalized as TournamentRoundGameResult)
    : "";
}

function buildTournamentRoundResult(gameResults: TournamentRoundGameResult[]): TournamentRoundResult {
  if (gameResults.length === 1) {
    return gameResults[0];
  }

  if (gameResults.length === 2) {
    return `${gameResults[0]}${gameResults[1]}`;
  }

  return `${gameResults[0]}${gameResults[1]}${gameResults[2]}`;
}

function parseRoundResult(formData: FormData): TournamentRoundResult {
  const selectedSpecialResults = compactMap(TOURNAMENT_ROUND_SPECIAL_RESULT_OPTIONS, (option) =>
    String(
      formData.get(
        option.value === "BYE" ? "isBye" : option.value === "ID" ? "isId" : "isNoShow"
      ) || ""
    ).trim()
      ? option.value
      : null
  );

  if (selectedSpecialResults.length > 1) {
    throw userFacingActionError("Choose only one of BYE, ID, or NO SHOW.");
  }

  if (selectedSpecialResults.length === 1) {
    return selectedSpecialResults[0] as TournamentRoundSpecialResult;
  }

  const selectedGameResults = [
    parseRoundGameResult(formData.get("game1")),
    parseRoundGameResult(formData.get("game2")),
    parseRoundGameResult(formData.get("game3"))
  ].filter((result): result is TournamentRoundGameResult => Boolean(result));

  if (selectedGameResults.length > 0) {
    return buildTournamentRoundResult(selectedGameResults);
  }

  throw userFacingActionError("Choose at least one game result or mark the round as BYE, ID, or NO SHOW.");
}

function parseFormat(value: FormDataEntryValue | null) {
  const normalized = String(value || "").trim();
  return normalized;
}

function parseSpriteArray(values: FormDataEntryValue[]) {
  return compactMap(values, (value) => String(value || "").trim())
    .slice(0, 2);
}

function getTournamentDeckDisplayName(sprites: string[]) {
  return getBattleLogSpriteDisplayName(sprites, "/");
}

async function resolveDeckSnapshot(userId: string, linkedDeckId: string) {
  if (!linkedDeckId) {
    return null;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("decks")
    .select("id,deck_name,deck_pokemon,deck_lists")
    .eq("id", linkedDeckId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw toUserFacingDatabaseError(error);
  }

  if (!data) {
    return null;
  }

  return {
    linkedDeckId: data.id as string,
    deckName: String((data as { deck_name?: string }).deck_name || "").trim(),
    deckSprites: Array.isArray((data as { deck_pokemon?: unknown }).deck_pokemon)
      ? ((data as { deck_pokemon: unknown[] }).deck_pokemon.filter(
          (entry): entry is string => typeof entry === "string" && entry.trim().length > 0
        ))
      : [],
    deckListIds: Array.isArray((data as { deck_lists?: unknown }).deck_lists)
      ? (compactMap((data as { deck_lists: Array<{ id?: unknown }> }).deck_lists, (entry) => String(entry?.id || "").trim()))
      : []
  };
}

async function resolveTournamentRoundNumber(params: {
  roundId: string;
  tournamentId: string;
  userId: string;
}) {
  const supabase = await createClient();

  if (params.roundId) {
    const { data, error } = await supabase
      .from("tournament_rounds")
      .select("round_number")
      .eq("id", params.roundId)
      .eq("tournament_id", params.tournamentId)
      .eq("user_id", params.userId)
      .maybeSingle();

    if (error) {
      throw toUserFacingDatabaseError(error);
    }

    if (!data?.round_number) {
      throw userFacingActionError("Could not find that round.");
    }

    return Number(data.round_number);
  }

  const { data, error } = await supabase
    .from("tournament_rounds")
    .select("round_number")
    .eq("tournament_id", params.tournamentId)
    .eq("user_id", params.userId)
    .order("round_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw toUserFacingDatabaseError(error);
  }

  return Number(data?.round_number || 0) + 1;
}

export async function createTournamentAction(formData: FormData): Promise<SaveActionResult> {
  const tournamentId = crypto.randomUUID();
  const [user, supabase] = await Promise.all([requireAuth(), createClient()]);

  try {
    const linkedDeckId = String(formData.get("linkedDeckId") || "").trim();
    const linkedDeckListId = String(formData.get("linkedDeckListId") || "").trim();
    const resolvedDeck = await resolveDeckSnapshot(user.id, linkedDeckId);
    const name = String(formData.get("name") || "").trim();
    const tournamentIdentifier = parseOptionalEventDetail(
      formData.get("tournamentIdentifier"),
      "Tournament ID",
      100
    );
    const location = parseOptionalEventDetail(formData.get("location"), "Location", 160);
    const { dateFrom, dateTo } = normalizeTournamentDateRange(formData);
    const format = parseFormat(formData.get("format")) || (await getDefaultSyncedSiteFormat());
    const selectedDeckSprites = parseSpriteArray(formData.getAll("deckSprites"));
    const participation = parseTournamentParticipation(formData.get("participation"));
    const judgeRole = participation === "judge" ? requireJudgeRole(formData.get("judgeRole")) : null;
    const championshipPoints = participation === "player"
      ? parseOptionalPoints(formData.get("championshipPoints"), "Championship Points")
      : null;
    const professorPoints = participation === "judge"
      ? parseOptionalPoints(formData.get("professorPoints"), "Professor Points")
      : null;
    const validatedReference = await validateDeckListReference({
      linkedDeckId: linkedDeckId || null,
      linkedDeckListId: linkedDeckListId || null,
      supabase,
      userId: user.id
    });

    if (!name) {
      throw userFacingActionError("Enter a tournament name before saving.");
    }

    if (!(await isKnownSyncedSiteFormat(format))) {
      throw userFacingActionError("Choose a valid tournament format.");
    }

    const nextTournament = {
      id: tournamentId,
      user_id: user.id,
      name,
      tournament_identifier: tournamentIdentifier,
      location,
      championship_points: championshipPoints,
      professor_points: professorPoints,
      date_from: dateFrom,
      date_to: dateTo,
      linked_deck_id: resolvedDeck?.linkedDeckId ?? null,
      linked_deck_list_id: validatedReference.deckListId,
      deck_name: resolvedDeck?.deckName ?? "",
      deck_sprites:
        selectedDeckSprites.length > 0 ? selectedDeckSprites : (resolvedDeck?.deckSprites ?? []),
      category: parseCategory(formData.get("category")),
      placement: participation === "judge" ? "" : parsePlacement(formData.get("placement")),
      participation,
      judge_role: judgeRole,
      format,
      notes: String(formData.get("notes") || "").trim()
    };

    let { error } = await supabase.from("tournaments").insert(nextTournament);

    if (isMissingTournamentDeckListColumns(error)) {
      ({ error } = await supabase.from("tournaments").insert({
        id: tournamentId,
        user_id: user.id,
        name,
        tournament_identifier: tournamentIdentifier,
        location,
        championship_points: championshipPoints,
        professor_points: professorPoints,
        date_from: dateFrom,
        date_to: dateTo,
        linked_deck_id: resolvedDeck?.linkedDeckId ?? null,
        deck_name: resolvedDeck?.deckName ?? "",
        deck_sprites:
          selectedDeckSprites.length > 0 ? selectedDeckSprites : (resolvedDeck?.deckSprites ?? []),
        category: parseCategory(formData.get("category")),
        placement: participation === "judge" ? "" : parsePlacement(formData.get("placement")),
        participation,
        judge_role: judgeRole,
        format,
        notes: String(formData.get("notes") || "").trim()
      }));
    }

    if (error) {
      throw toUserFacingDatabaseError(error);
    }

    revalidateTournamentWorkspace(tournamentId);

    return {
      ok: true,
      redirectTo: `/tournaments/${tournamentId}`
    };
  } catch (error) {
    return toActionFailureResult(error, {
      action: "createTournament",
      area: "tournaments",
      fallbackMessage: "We couldn't save that tournament right now.",
      route: "/tournaments",
      tournamentId
    });
  }
}

export async function updateTournamentAction(formData: FormData): Promise<SaveActionResult> {
  const tournamentId = String(formData.get("tournamentId") || "").trim();
  const [user, supabase] = await Promise.all([requireAuth(), createClient()]);

  try {
    const linkedDeckId = String(formData.get("linkedDeckId") || "").trim();
    const linkedDeckListId = String(formData.get("linkedDeckListId") || "").trim();
    const resolvedDeck = await resolveDeckSnapshot(user.id, linkedDeckId);
    const name = String(formData.get("name") || "").trim();
    const tournamentIdentifier = parseOptionalEventDetail(
      formData.get("tournamentIdentifier"),
      "Tournament ID",
      100
    );
    const location = parseOptionalEventDetail(formData.get("location"), "Location", 160);
    const format = parseFormat(formData.get("format")) || (await getDefaultSyncedSiteFormat());
    const selectedDeckSprites = parseSpriteArray(formData.getAll("deckSprites"));
    const participation = parseTournamentParticipation(formData.get("participation"));
    const judgeRole = participation === "judge" ? requireJudgeRole(formData.get("judgeRole")) : null;
    const championshipPoints = participation === "player"
      ? parseOptionalPoints(formData.get("championshipPoints"), "Championship Points")
      : null;
    const professorPoints = participation === "judge"
      ? parseOptionalPoints(formData.get("professorPoints"), "Professor Points")
      : null;
    const validatedReference = await validateDeckListReference({
      linkedDeckId: linkedDeckId || null,
      linkedDeckListId: linkedDeckListId || null,
      supabase,
      userId: user.id
    });
    const { dateFrom, dateTo } = normalizeTournamentDateRange(formData);

    if (!tournamentId) {
      throw userFacingActionError("Tournament id is required.");
    }

    if (!name) {
      throw userFacingActionError("Enter a tournament name before saving.");
    }

    if (!(await isKnownSyncedSiteFormat(format))) {
      throw userFacingActionError("Choose a valid tournament format.");
    }

    const nextTournament = {
      name,
      tournament_identifier: tournamentIdentifier,
      location,
      championship_points: championshipPoints,
      professor_points: professorPoints,
      date_from: dateFrom,
      date_to: dateTo,
      linked_deck_id: resolvedDeck?.linkedDeckId ?? null,
      linked_deck_list_id: validatedReference.deckListId,
      deck_name: resolvedDeck?.deckName ?? "",
      deck_sprites:
        selectedDeckSprites.length > 0 ? selectedDeckSprites : (resolvedDeck?.deckSprites ?? []),
      category: parseCategory(formData.get("category")),
      placement: participation === "judge" ? "" : parsePlacement(formData.get("placement")),
      participation,
      judge_role: judgeRole,
      format,
      notes: String(formData.get("notes") || "").trim()
    };

    let { data: updatedTournament, error } = await supabase
      .from("tournaments")
      .update(nextTournament)
      .eq("id", tournamentId)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();

    if (isMissingTournamentDeckListColumns(error)) {
      ({ data: updatedTournament, error } = await supabase
        .from("tournaments")
        .update({
          name,
          tournament_identifier: tournamentIdentifier,
          location,
          championship_points: championshipPoints,
          professor_points: professorPoints,
          date_from: dateFrom,
          date_to: dateTo,
          linked_deck_id: resolvedDeck?.linkedDeckId ?? null,
          deck_name: resolvedDeck?.deckName ?? "",
          deck_sprites:
            selectedDeckSprites.length > 0
              ? selectedDeckSprites
              : (resolvedDeck?.deckSprites ?? []),
          category: parseCategory(formData.get("category")),
          placement: participation === "judge" ? "" : parsePlacement(formData.get("placement")),
          participation,
          judge_role: judgeRole,
          format,
          notes: String(formData.get("notes") || "").trim()
        })
        .eq("id", tournamentId)
        .eq("user_id", user.id)
        .select("id")
        .maybeSingle());
    }

    if (error) {
      throw toUserFacingDatabaseError(error);
    }

    if (!updatedTournament) {
      throw userFacingActionError("Tournament could not be found.");
    }

    revalidateTournamentWorkspace(tournamentId);

    return {
      ok: true,
      redirectTo: withRefreshToken(getFormRedirectPath(formData, `/tournaments/${tournamentId}`))
    };
  } catch (error) {
    return toActionFailureResult(error, {
      action: "updateTournament",
      area: "tournaments",
      fallbackMessage: "We couldn't update that tournament right now.",
      route: "/tournaments",
      tournamentId
    });
  }
}

export async function saveTournamentDeckListAction(formData: FormData): Promise<SaveActionResult> {
  const tournamentId = String(formData.get("tournamentId") || "").trim();
  const [user, supabase] = await Promise.all([requireAuth(), createClient()]);

  try {
    if (!tournamentId) {
      throw userFacingActionError("Tournament id is required.");
    }

    await saveTournamentDeckListForTournament({
      adapter: {
        async attachDeckList(input) {
          const { data, error } = await supabase
            .from("tournaments")
            .update({
              deck_name: input.deckName,
              deck_sprites: input.deckSprites,
              linked_deck_id: input.linkedDeckId,
              linked_deck_list_id: input.deckListId,
              updated_at: new Date().toISOString()
            })
            .eq("id", input.tournamentId)
            .eq("user_id", input.userId)
            .select("id")
            .maybeSingle();

          if (error) {
            throw toUserFacingDatabaseError(error);
          }
          if (!data) {
            throw userFacingActionError("Tournament could not be found.");
          }
        },
        async loadTournament(userId, targetTournamentId) {
          const { data, error } = await supabase
            .from("tournaments")
            .select("linked_deck_id,linked_deck_list_id,deck_sprites,format")
            .eq("id", targetTournamentId)
            .eq("user_id", userId)
            .maybeSingle();

          if (error) {
            throw toUserFacingDatabaseError(error);
          }
          if (!data) {
            return null;
          }

          return {
            deckSprites: parseSpriteArray(
              Array.isArray(data.deck_sprites)
                ? (data.deck_sprites as FormDataEntryValue[])
                : []
            ),
            format: String(data.format || "").trim(),
            linkedDeckId: String(data.linked_deck_id || "").trim() || null,
            linkedDeckListId: String(data.linked_deck_list_id || "").trim() || null
          };
        },
        saveStandaloneDeckList: (deckListFormData) =>
          saveDeckList({
            formData: deckListFormData,
            supabase,
            user
          })
      },
      formData,
      userId: user.id
    });

    revalidateTournamentWorkspace(tournamentId);
    revalidatePath("/deck-lists", "layout");

    return {
      ok: true,
      redirectTo: withRefreshToken(getFormRedirectPath(formData, `/tournaments/${tournamentId}`))
    };
  } catch (error) {
    return toActionFailureResult(error, {
      action: "saveTournamentDeckList",
      area: "tournaments",
      fallbackMessage: "We couldn't save that tournament deck list right now.",
      route: "/tournaments",
      tournamentId
    });
  }
}

export async function deleteTournamentAction(formData: FormData): Promise<SaveActionResult> {
  const tournamentId = String(formData.get("tournamentId") || "").trim();
  const [user, supabase] = await Promise.all([requireAuth(), createClient()]);

  try {
    if (!tournamentId) {
      throw userFacingActionError("Tournament id is required.");
    }

    const { data: deletedTournament, error } = await supabase
      .from("tournaments")
      .delete()
      .eq("id", tournamentId)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();

    if (error) {
      throw toUserFacingDatabaseError(error);
    }

    if (!deletedTournament) {
      throw userFacingActionError("Tournament could not be found.");
    }

    revalidateTournamentWorkspace();

    return {
      ok: true,
      redirectTo: withRefreshToken("/tournaments")
    };
  } catch (error) {
    return toActionFailureResult(error, {
      action: "deleteTournament",
      area: "tournaments",
      fallbackMessage: "We couldn't delete that tournament right now.",
      route: "/tournaments",
      tournamentId
    });
  }
}

export async function saveTournamentRoundAction(formData: FormData): Promise<SaveActionResult> {
  const tournamentId = String(formData.get("tournamentId") || "").trim();
  const roundId = String(formData.get("roundId") || "").trim();
  const [user, supabase] = await Promise.all([requireAuth(), createClient()]);

  try {
    const opponentDeckSprites = parseSpriteArray(formData.getAll("opponentDeckSprites"));

    if (!tournamentId) {
      throw userFacingActionError("Tournament id is required.");
    }

    const { data: ownedTournament, error: tournamentError } = await supabase
      .from("tournaments")
      .select("id")
      .eq("id", tournamentId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (tournamentError) {
      throw toUserFacingDatabaseError(tournamentError);
    }

    if (!ownedTournament) {
      throw userFacingActionError("Tournament could not be found.");
    }

    const roundNumber = await resolveTournamentRoundNumber({
      roundId,
      tournamentId,
      userId: user.id
    });

    const payload = {
      tournament_id: tournamentId,
      user_id: user.id,
      round_number: roundNumber,
      opponent_deck_name: "",
      opponent_deck_sprites: opponentDeckSprites,
      result: parseRoundResult(formData),
      notes: String(formData.get("notes") || "").trim()
    };

    if (roundId) {
      const { data: updatedRound, error } = await supabase
        .from("tournament_rounds")
        .update(payload)
        .eq("id", roundId)
        .eq("user_id", user.id)
        .select("id")
        .maybeSingle();

      if (error) {
        throw toUserFacingDatabaseError(error);
      }

      if (!updatedRound) {
        throw userFacingActionError("Could not find that round.");
      }
    } else {
      const newRoundId = crypto.randomUUID();
      const { error: rpcError } = await supabase.rpc("create_tournament_round", {
        p_notes: payload.notes,
        p_opponent_deck_name: payload.opponent_deck_name,
        p_opponent_deck_sprites: payload.opponent_deck_sprites,
        p_result: payload.result,
        p_round_id: newRoundId,
        p_tournament_id: tournamentId
      });

      if (rpcError && !isMissingTournamentRoundRpc(rpcError)) {
        throw toUserFacingDatabaseError(rpcError);
      }

      if (rpcError) {
        const { error } = await supabase.from("tournament_rounds").insert({
          id: newRoundId,
          ...payload
        });

        if (error) {
          throw toUserFacingDatabaseError(error);
        }
      }
    }

    revalidateTournamentWorkspace(tournamentId);

    return {
      ok: true,
      redirectTo: withRefreshToken(getFormRedirectPath(formData, `/tournaments/${tournamentId}`))
    };
  } catch (error) {
    return toActionFailureResult(error, {
      action: roundId ? "updateTournamentRound" : "createTournamentRound",
      area: "tournaments",
      fallbackMessage: "We couldn't save that tournament round right now.",
      route: "/tournaments",
      tournamentId
    });
  }
}

export async function deleteTournamentRoundAction(formData: FormData): Promise<SaveActionResult> {
  const tournamentId = String(formData.get("tournamentId") || "").trim();
  const roundId = String(formData.get("roundId") || "").trim();
  const [user, supabase] = await Promise.all([requireAuth(), createClient()]);

  try {
    if (!tournamentId || !roundId) {
      throw userFacingActionError("Round id is required.");
    }

    const { data: deletedRound, error } = await supabase
      .from("tournament_rounds")
      .delete()
      .eq("id", roundId)
      .eq("tournament_id", tournamentId)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();

    if (error) {
      throw toUserFacingDatabaseError(error);
    }

    if (!deletedRound) {
      throw userFacingActionError("Could not find that round.");
    }

    revalidateTournamentWorkspace(tournamentId);

    return {
      ok: true,
      redirectTo: withRefreshToken(`/tournaments/${tournamentId}`)
    };
  } catch (error) {
    return toActionFailureResult(error, {
      action: "deleteTournamentRound",
      area: "tournaments",
      fallbackMessage: "We couldn't delete that tournament round right now.",
      route: "/tournaments",
      tournamentId
    });
  }
}
