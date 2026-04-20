import type {
  TournamentCategory,
  TournamentPlacement,
  TournamentRoundGameResult,
  TournamentRoundSpecialResult,
  TournamentRoundResult
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
  { value: "regional", label: "Regionals" },
  { value: "world", label: "Worlds" }
];

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

export const TOURNAMENT_ROUND_GAME_RESULT_OPTIONS: TournamentRoundGameResult[] = ["W", "L", "T"];
export const TOURNAMENT_ROUND_SPECIAL_RESULT_OPTIONS: Array<{
  value: TournamentRoundSpecialResult;
  label: string;
}> = [
  { value: "BYE", label: "BYE" },
  { value: "ID", label: "ID" },
  { value: "NO SHOW", label: "NO SHOW" }
];
export const TOURNAMENT_ROUND_RESULT_OPTIONS: TournamentRoundResult[] = [
  "Win",
  "Loss",
  "Tie",
  ...TOURNAMENT_ROUND_SPECIAL_RESULT_OPTIONS.map((option) => option.value),
  ...TOURNAMENT_ROUND_GAME_RESULT_OPTIONS
];

export function getTournamentCategoryLabel(category: TournamentCategory) {
  return (
    TOURNAMENT_CATEGORY_OPTIONS.find((option) => option.value === category)?.label || "Uncategorized"
  );
}

export function getTournamentPlacementLabel(placement: TournamentPlacement) {
  return (
    TOURNAMENT_PLACEMENT_OPTIONS.find((option) => option.value === placement)?.label ||
    "No placement"
  );
}
