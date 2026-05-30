import type { Language, LogSection, Result } from "@/types/index";
import { LANGUAGE_STRINGS } from "@/lib/log-import/parser/language";
import { getPlayerNameFromTurnLine } from "@/lib/log-import/parser/turns";
import { ImportLogValidationError } from "@/lib/log-import/types";
import { compactMap } from "@/lib/array";

const WINNER_PATTERNS: Record<Language, RegExp> = {
  en: /\. (.*) wins\./g,
  es: /\. (.*) ganó\./,
  de: /\. (.*) hat gewonnen\./,
  fr: /\. (.*) gagne\./,
  it: /\. (.*) ha vinto\./,
  "pt-br": /\. (.*) venceu\./
};

const CONCEDE_PATTERNS: Record<Language, RegExp[]> = {
  en: [/conceded/i],
  de: [/aufgegeben/i],
  es: [/concedi[oó]/i],
  fr: [/abandonn/i, /forfait/i],
  it: [/si.*arres/i, /ha concesso/i],
  "pt-br": [/concedeu/i, /desistiu/i]
};

function getLeadingPlayerFromLine(line: string, playerNames: string[]) {
  const candidates = playerNames.toSorted((left, right) => right.length - left.length);

  return (
    candidates.find((player) => {
      const escaped = player.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`^${escaped}(?:'s|\\b)`).test(String(line || ""));
    }) ?? ""
  );
}

function getPlayerFromLine(line: string, playerNames: string[]) {
  return playerNames.find((player) => String(line || "").includes(player)) ?? "";
}

function getCoinTossWinnerFromLine(line: string, playerNames: string[]) {
  if (!String(line || "").includes(" won the coin toss")) {
    return "";
  }

  return getLeadingPlayerFromLine(line, playerNames) || getPlayerFromLine(line, playerNames);
}

function getMulligansTakenFromLine(line: string) {
  const normalized = String(line || "").trim();
  if (!normalized.includes("mulligan")) {
    return 0;
  }
  if (normalized.includes("took a mulligan")) {
    return 1;
  }

  return Number.parseInt(normalized.match(/took (\d+) mulligans?/i)?.[1] ?? "0", 10) || 0;
}

function getAttackDamageFromLine(line: string) {
  const normalized = String(line || "").trim();
  if (!normalized.includes(" used ") || !normalized.includes(" damage")) {
    return 0;
  }

  return Number.parseInt(normalized.match(/\bfor (\d+) damage\b/i)?.[1] ?? "0", 10) || 0;
}

function getDamageCountersPlacedFromLine(line: string) {
  const normalized = String(line || "").trim();
  if (!normalized.includes("damage counter")) {
    return 0;
  }
  if (/\bput a damage counter\b/i.test(normalized)) {
    return 1;
  }

  return Number.parseInt(normalized.match(/\bput (\d+) damage counters?\b/i)?.[1] ?? "0", 10) || 0;
}

function getDamageTakenFromLine(line: string) {
  const normalized = String(line || "").trim();
  if (!normalized.includes("took") || !normalized.includes("damage")) {
    return 0;
  }

  return Number.parseInt(normalized.match(/\btook (\d+) damage\b/i)?.[1] ?? "0", 10) || 0;
}

function shouldCountDamageCounterDetails(title: string, baseDamage: number) {
  if (baseDamage > 0) {
    return true;
  }

  return String(title || "").trim().toLowerCase().includes("used powerful hand");
}

function getAttackDamageFromAction(action: { title: string; details: string[] }) {
  const title = String(action.title || "").trim();
  const baseDamage = getAttackDamageFromLine(title);
  const detailDamage = title.includes(" used ")
    ? action.details.reduce((total, detail) => total + getDamageTakenFromLine(detail), 0)
    : 0;

  if (!shouldCountDamageCounterDetails(title, baseDamage)) {
    return baseDamage + detailDamage;
  }

  return (
    baseDamage +
    detailDamage +
    action.details.reduce((total, detail) => total + getDamageCountersPlacedFromLine(detail) * 10, 0)
  );
}

export function determineWinner(lines: string[], language: Language) {
  const winner = lines
    .map((line) => {
      const match = WINNER_PATTERNS[language].exec(line)?.[1] ?? null;
      WINNER_PATTERNS[language].lastIndex = 0;
      return match;
    })
    .find(Boolean);

  if (!winner) {
    throw new ImportLogValidationError(
      "UNKNOWN_LOG",
      "Could not find a winner line in this PTCGL log."
    );
  }

  return winner;
}

export function getPrizesTakenFromLine(line: string, language: Language) {
  if (language === "en") {
    if (line.includes("took a Prize card")) return 1;
    return Number.parseInt(line.match(/took ([0-9])/i)?.[1] ?? "0", 10);
  }

  if (language === "es") {
    if (line.includes("tomó una carta de Premio")) return 1;
    return Number.parseInt(line.match(/tomó ([0-9])/i)?.[1] ?? "0", 10);
  }

  if (language === "fr") {
    if (line.includes("a récupéré une carte Récompense")) return 1;
    return Number.parseInt(line.match(/récupéré ([0-9])/i)?.[1] ?? "0", 10);
  }

  if (language === "de") {
    if (line.includes("hat eine Preiskarten aufgenommen")) return 1;
    return Number.parseInt(line.match(/hat ([0-9])/i)?.[1] ?? "0", 10);
  }

  if (language === "it") {
    if (line.includes("ha preso una carta Premio")) return 1;
    return Number.parseInt(line.match(/preso ([0-9])/i)?.[1] ?? "0", 10);
  }

  if (language === "pt-br") {
    if (line.includes("pegou uma carta de Prêmio")) return 1;
    return Number.parseInt(line.match(/pegou ([0-9])/i)?.[1] ?? "0", 10);
  }

  return 0;
}

export function isPrizeTakenLine(line: string, language: Language) {
  return (
    String(line || "").includes(LANGUAGE_STRINGS[language].took) &&
    String(line || "").includes(LANGUAGE_STRINGS[language].prize)
  );
}

function calculateTotalTurns(sections: LogSection[]) {
  const nonSetupSections = sections.filter((section) => section.player);
  const numberedTurns = nonSetupSections
    .map((section) => {
      const match = String(section.title || "").match(/Turn #\s*(\d+)/i);
      return match ? Number.parseInt(match[1], 10) : NaN;
    })
    .filter((value) => Number.isFinite(value));

  return numberedTurns.length > 0 ? Math.max(...numberedTurns) : Math.ceil(nonSetupSections.length / 2);
}

function determineGoOrder(
  sections: LogSection[],
  selfPlayerName: string
): "First" | "Second" | "" {
  const firstTurnPlayer = sections.find((section) => section.player)?.player ?? "";
  if (!firstTurnPlayer) {
    return "";
  }

  return firstTurnPlayer === selfPlayerName ? "First" : "Second";
}

function determineReason(
  lines: string[],
  language: Language,
  selfPrizesTaken: number,
  opponentPrizesTaken: number
) {
  if (CONCEDE_PATTERNS[language].some((pattern) => lines.some((line) => pattern.test(line)))) {
    return "Concede";
  }

  if (selfPrizesTaken >= 6 || opponentPrizesTaken >= 6) {
    return "Prizes";
  }

  return "";
}

type BuildStatsArgs = {
  lines: string[];
  sections: LogSection[];
  language: Language;
  selfPlayerName: string;
  opponentPlayerName: string;
};

export function buildStats({
  lines,
  sections,
  language,
  selfPlayerName,
  opponentPlayerName
}: BuildStatsArgs) {
  const playerNames = [selfPlayerName, opponentPlayerName];
  const statsByName = Object.fromEntries(
    playerNames.map((name) => [
      name,
      {
        attackDamage: 0,
        prizesTaken: 0,
        mulligans: 0
      }
    ])
  );
  let coinTossWinner = "";

  sections.forEach((section) => {
    section.actions.forEach((action) => {
      const line = String(action.title || "").trim();
      if (!line) {
        return;
      }

      const leadingPlayer = getLeadingPlayerFromLine(line, playerNames) || getPlayerFromLine(line, playerNames);
      const playerStats = leadingPlayer ? statsByName[leadingPlayer] : null;
      const actionLines = compactMap([line, ...action.details], (entry) => String(entry || "").trim());

      actionLines.forEach((actionLine) => {
        const coinTossPlayer = getCoinTossWinnerFromLine(actionLine, playerNames);
        if (!coinTossWinner && coinTossPlayer) {
          coinTossWinner = coinTossPlayer;
        }

        const mulliganPlayer =
          getLeadingPlayerFromLine(actionLine, playerNames) || getPlayerFromLine(actionLine, playerNames);
        const mulliganStats = mulliganPlayer ? statsByName[mulliganPlayer] : null;
        const mulligansTaken = getMulligansTakenFromLine(actionLine);
        if (mulliganStats && mulligansTaken > 0) {
          mulliganStats.mulligans = Math.max(mulliganStats.mulligans, mulligansTaken);
        }
      });

      if (!playerStats) {
        return;
      }

      if (isPrizeTakenLine(line, language)) {
        playerStats.prizesTaken += getPrizesTakenFromLine(line, language);
      }

      const attackDamage = getAttackDamageFromAction(action);
      if (attackDamage > 0) {
        playerStats.attackDamage += attackDamage;
      }
    });
  });

  const winner = determineWinner(lines, language);
  const result: Result = winner.toLowerCase() === selfPlayerName.toLowerCase() ? "Win" : "Loss";
  const selfStats = statsByName[selfPlayerName];
  const opponentStats = statsByName[opponentPlayerName];

  return {
    winner,
    result,
    totalTurns: calculateTotalTurns(sections),
    coinTossWon: coinTossWinner ? coinTossWinner === selfPlayerName : null,
    goOrder: determineGoOrder(sections, selfPlayerName),
    selfPrizesTaken: selfStats.prizesTaken,
    opponentPrizesTaken: opponentStats.prizesTaken,
    selfAttackDamage: selfStats.attackDamage,
    opponentAttackDamage: opponentStats.attackDamage,
    selfMulligans: selfStats.mulligans,
    opponentMulligans: opponentStats.mulligans,
    reason: determineReason(lines, language, selfStats.prizesTaken, opponentStats.prizesTaken)
  };
}
