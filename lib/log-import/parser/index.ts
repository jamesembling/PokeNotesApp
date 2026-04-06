import { detectLanguage } from "@/lib/log-import/parser/language";
import { extractPlayerPokemonMentions } from "@/lib/log-import/parser/pokemon-mentions";
import { extractPlayerNames, resolveSelfOpponent } from "@/lib/log-import/parser/players";
import { buildStats, getPrizesTakenFromLine, isPrizeTakenLine } from "@/lib/log-import/parser/stats";
import { trimBattleLog } from "@/lib/log-import/parser/trim";
import { divideIntoSections } from "@/lib/log-import/parser/turns";
import type { IdentificationCatalog, ParsedLog } from "@/lib/log-import/types";

export function parseBattleLog(args: {
  rawLog: string;
  ptcglUsername: string;
  catalog: IdentificationCatalog;
}): ParsedLog {
  const rawLog = String(args.rawLog || "");
  const language = detectLanguage(rawLog);
  const lines = trimBattleLog(rawLog, language);
  const playerNames = extractPlayerNames(lines, language);
  const { selfPlayerName, opponentPlayerName } = resolveSelfOpponent(playerNames, args.ptcglUsername);
  const sections = divideIntoSections({
    lines,
    language,
    playerNames,
    getPrizesTakenFromLine,
    isPrizeTakenLine
  });
  const stats = buildStats({
    lines,
    sections,
    language,
    selfPlayerName,
    opponentPlayerName
  });

  return {
    language,
    rawLog,
    lines,
    players: {
      playerNames,
      selfPlayerName,
      opponentPlayerName
    },
    sections,
    stats,
    pokemonEvidence: {
      self: extractPlayerPokemonMentions({
        lines,
        playerName: selfPlayerName,
        language,
        catalog: args.catalog
      }),
      opponent: extractPlayerPokemonMentions({
        lines,
        playerName: opponentPlayerName,
        language,
        catalog: args.catalog
      })
    }
  };
}
