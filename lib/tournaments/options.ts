import type {
  TournamentCategory,
  TournamentJudgeRole,
  TournamentParticipation,
  TournamentPlacement,
  TournamentRoundGameResult,
  TournamentRoundSpecialResult
} from "@/types/index";

export const TOURNAMENT_CATEGORY_OPTIONS: Array<{
  value: Exclude<TournamentCategory, "">;
  label: string;
}> = [
  { value: "local", label: "Locals" },
  { value: "challenge", label: "League Challenge" },
  { value: "cup", label: "League Cup" },
  { value: "prerelease", label: "Prerelease Event" },
  { value: "online", label: "Online Tournament" },
  { value: "regional", label: "Regional Championships" },
  { value: "international", label: "International Championships" },
  { value: "world", label: "World Championships" }
];

const TOURNAMENT_COMPETITION_BADGES: Partial<
  Record<Exclude<TournamentCategory, "">, { alt: string; src: string }>
> = {
  challenge: {
    alt: "Pokémon League Challenge badge",
    src: "/tournament-badges/league-challenge.png"
  },
  cup: {
    alt: "Pokémon League Cup badge",
    src: "/tournament-badges/league-cup.png"
  },
  regional: {
    alt: "Pokémon Regional Championships badge",
    src: "/tournament-badges/regional-championships.png"
  },
  international: {
    alt: "Pokémon International Championships badge",
    src: "/tournament-badges/international-championships.png"
  },
  world: {
    alt: "Pokémon World Championships badge",
    src: "/tournament-badges/world-championships.png"
  }
};

export const TOURNAMENT_PLACEMENT_OPTIONS: Array<{
  value: Exclude<TournamentPlacement, "">;
  label: string;
}> = [
  { value: "champion", label: "Champion" },
  { value: "finalist", label: "Finalist" },
  { value: "t4", label: "Top 4" },
  { value: "t8", label: "Top 8" },
  { value: "t16", label: "Top 16" },
  { value: "t32", label: "Top 32" },
  { value: "t64", label: "Top 64" },
  { value: "t128", label: "Top 128" },
  { value: "t256", label: "Top 256" },
  { value: "t512", label: "Top 512" },
  { value: "t1024", label: "Top 1024" },
  { value: "second", label: "2nd" },
  { value: "third", label: "3rd" },
  { value: "fourth", label: "4th" },
  { value: "fifth", label: "5th" },
  { value: "sixth", label: "6th" },
  { value: "seventh", label: "7th" },
  { value: "eighth", label: "8th" },
  { value: "dropped", label: "Dropped" },
  { value: "no placement", label: "No placement" }
];

export const TOURNAMENT_JUDGE_ROLE_OPTIONS: Array<{
  value: Exclude<TournamentJudgeRole, "">;
  label: string;
}> = [
  { value: "judge", label: "Judge" },
  { value: "head judge", label: "Head Judge" }
];

export const TOURNAMENT_ROUND_GAME_RESULT_OPTIONS: TournamentRoundGameResult[] = ["W", "L", "T"];
export const TOURNAMENT_ROUND_SPECIAL_RESULT_OPTIONS: Array<{
  value: TournamentRoundSpecialResult;
  label: string;
}> = [
  { value: "BYE", label: "BYE" },
  { value: "ID", label: "ID" },
  { value: "NO SHOW", label: "NO SHOW" }
];
export function getTournamentCategoryLabel(category: TournamentCategory) {
  return (
    TOURNAMENT_CATEGORY_OPTIONS.find((option) => option.value === category)?.label || "Uncategorized"
  );
}

export function getTournamentCompetitionBadge(category: TournamentCategory) {
  return category ? TOURNAMENT_COMPETITION_BADGES[category] ?? null : null;
}

export function getTournamentPlacementLabel(placement: TournamentPlacement) {
  return (
    TOURNAMENT_PLACEMENT_OPTIONS.find((option) => option.value === placement)?.label ||
    "No placement"
  );
}

export function parseTournamentParticipation(value: unknown): TournamentParticipation {
  return String(value || "").trim().toLowerCase() === "judge" ? "judge" : "player";
}

export function parseTournamentJudgeRole(value: unknown): TournamentJudgeRole {
  const normalized = String(value || "").trim().toLowerCase();
  return TOURNAMENT_JUDGE_ROLE_OPTIONS.some((option) => option.value === normalized)
    ? (normalized as TournamentJudgeRole)
    : "";
}

export function getTournamentJudgeRoleLabel(role: TournamentJudgeRole) {
  return TOURNAMENT_JUDGE_ROLE_OPTIONS.find((option) => option.value === role)?.label || "Judge";
}
