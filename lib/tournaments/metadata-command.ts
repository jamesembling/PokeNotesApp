import { normalizeTournamentDateRange } from "@/lib/tournaments/date-range";
import { userFacingActionError } from "@/lib/server/action-errors";
import {
  TOURNAMENT_CATEGORY_OPTIONS,
  parseTournamentJudgeRole,
  parseTournamentParticipation,
  TOURNAMENT_PLACEMENT_OPTIONS
} from "@/lib/tournaments/options";
import type { TournamentCategory, TournamentJudgeRole, TournamentPlacement } from "@/types/index";

type MetadataParserInput = {
  formData: FormData;
  format: string;
  linkedDeckListId: string | null;
  resolvedDeck: {
    linkedDeckId: string;
    deckName: string;
    deckSprites: readonly string[];
  } | null;
};

function parseCategory(value: FormDataEntryValue | null): TournamentCategory {
  const normalized = String(value || "").trim();
  return TOURNAMENT_CATEGORY_OPTIONS.some((option) => option.value === normalized)
    ? normalized as TournamentCategory
    : "";
}

function parsePlacement(value: FormDataEntryValue | null): TournamentPlacement {
  const normalized = String(value || "").trim();
  return TOURNAMENT_PLACEMENT_OPTIONS.some((option) => option.value === normalized)
    ? normalized as TournamentPlacement
    : "";
}

function parseDetail(value: FormDataEntryValue | null, label: string, maxLength: number) {
  const normalized = String(value || "").trim();
  if (normalized.length > maxLength) {
    throw userFacingActionError(`${label} must be ${maxLength} characters or fewer.`);
  }
  return normalized;
}

function parsePoints(value: FormDataEntryValue | null, label: string) {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  if (!/^\d+$/.test(normalized)) {
    throw userFacingActionError(`Enter ${label} as a whole number of 0 or more.`);
  }
  const points = Number(normalized);
  if (!Number.isSafeInteger(points) || points > 2_147_483_647) {
    throw userFacingActionError(`${label} are too large to save.`);
  }
  return points;
}

export function parseTournamentMetadataCommand(input: MetadataParserInput) {
  const { formData } = input;
  const name = String(formData.get("name") || "").trim();
  if (!name) throw userFacingActionError("Enter a tournament name before saving.");
  if (!input.format.trim()) throw userFacingActionError("Choose a valid tournament format.");
  const participation = parseTournamentParticipation(formData.get("participation"));
  const judgeRole = participation === "judge"
    ? parseTournamentJudgeRole(formData.get("judgeRole"))
    : null;
  if (participation === "judge" && !judgeRole) throw userFacingActionError("Choose a judge role before saving.");
  const { dateFrom, dateTo } = normalizeTournamentDateRange(formData);
  const selectedDeckSprites = formData.getAll("deckSprites")
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .slice(0, 2);
  return {
    name,
    tournament_identifier: parseDetail(formData.get("tournamentIdentifier"), "Tournament ID", 100),
    location: parseDetail(formData.get("location"), "Location", 160),
    championship_points: participation === "player"
      ? parsePoints(formData.get("championshipPoints"), "Championship Points")
      : null,
    professor_points: participation === "judge"
      ? parsePoints(formData.get("professorPoints"), "Professor Points")
      : null,
    date_from: dateFrom,
    date_to: dateTo,
    linked_deck_id: input.resolvedDeck?.linkedDeckId ?? null,
    linked_deck_list_id: input.linkedDeckListId,
    deck_name: input.resolvedDeck?.deckName ?? "",
    deck_sprites: selectedDeckSprites.length > 0 ? selectedDeckSprites : (input.resolvedDeck?.deckSprites ?? []),
    category: parseCategory(formData.get("category")),
    placement: participation === "judge" ? "" : parsePlacement(formData.get("placement")),
    participation,
    judge_role: judgeRole,
    format: input.format,
    notes: String(formData.get("notes") || "").trim()
  };
}
