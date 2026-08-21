import type {
  TournamentRoundGameResult,
  TournamentRoundSpecialResult
} from "@/types/index";

type RoundResultSelection = {
  gameResults: string[];
  specialResult: TournamentRoundSpecialResult | "";
};

export function toggleRoundGameResult(
  gameResults: readonly string[],
  gameIndex: number,
  result: TournamentRoundGameResult
): RoundResultSelection {
  const nextGameResults = [...gameResults];
  nextGameResults[gameIndex] = nextGameResults[gameIndex] === result ? "" : result;

  return {
    gameResults: nextGameResults,
    specialResult: ""
  };
}

export function toggleRoundSpecialResult(
  gameResults: readonly string[],
  specialResult: TournamentRoundSpecialResult | "",
  result: TournamentRoundSpecialResult
): RoundResultSelection {
  if (specialResult === result) {
    return {
      gameResults: [...gameResults],
      specialResult: ""
    };
  }

  return {
    gameResults: ["", "", ""],
    specialResult: result
  };
}
