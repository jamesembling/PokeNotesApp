import type { Language, LogAction, LogSection } from "@/types/index";
import { LANGUAGE_STRINGS } from "@/lib/log-import/parser/language";

const SUBACTION_MARKERS = [
  "A card was added",
  " was added to ",
  " was discarded from",
  " can no longer use VSTAR Powers",
  "is now in the Active Spot",
  " for the opening coin flip",
  " won the coin toss",
  " took at least 1 mulligan",
  " drew 7 cards for the opening hand"
];

export function stripTurnPrefix(line: string) {
  return String(line || "")
    .replace(/^Turn #\s*\d+\s*-\s*/i, "")
    .replace(/^-\s*/, "")
    .trim();
}

export function getPlayerNameFromTurnLine(line: string, language: Language) {
  const normalized = stripTurnPrefix(line);

  const patterns: Record<Language, RegExp> = {
    en: /^(.*)'s Turn$/i,
    es: /^Turno de (.*)$/i,
    de: /^Zug von (.*)$/i,
    fr: /^Tour de (.*)$/i,
    it: /^Turno di (.*)$/i,
    "pt-br": /^Turno de (.*)$/i
  };

  const extracted = patterns[language].exec(normalized)?.[1] ?? null;
  if (!extracted || /\[playername\]/i.test(extracted)) {
    return null;
  }

  return extracted;
}

export function isTurnBoundary(line: string, language: Language) {
  return getPlayerNameFromTurnLine(line, language) !== null;
}

function getLeadingPlayerFromLine(line: string, playerNames: string[]) {
  const candidates = [...playerNames].sort((left, right) => right.length - left.length);

  return (
    candidates.find((player) => {
      const escaped = player.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`^${escaped}(?:'s|\\b)`).test(String(line || ""));
    }) ?? ""
  );
}

function inferSectionPlayer(
  title: string,
  bodyLines: string[],
  playerNames: string[],
  language: Language
) {
  if (title === LANGUAGE_STRINGS[language].setup) {
    return "";
  }

  const fromTitle = getPlayerNameFromTurnLine(title, language);
  if (fromTitle) {
    return fromTitle;
  }

  for (const line of bodyLines) {
    for (const player of playerNames) {
      if (line.startsWith(`${player} drew `)) {
        return player;
      }
    }
  }

  for (const line of bodyLines) {
    for (const player of playerNames) {
      if (line.startsWith(`${player} `) || line.startsWith(`${player}'s `)) {
        return player;
      }
    }
  }

  const counts = Object.fromEntries(playerNames.map((player) => [player, 0]));
  bodyLines.forEach((line) => {
    playerNames.forEach((player) => {
      if (line.includes(player)) {
        counts[player] += 1;
      }
    });
  });

  return [...playerNames].sort((left, right) => counts[right] - counts[left])[0] ?? "";
}

function getTurnActions(bodyLines: string[]): LogAction[] {
  const actions: LogAction[] = [];

  bodyLines.forEach((line) => {
    const trimmed = line.trim();
    const abilityActivationMatch = trimmed.match(/^[-•]?\s*(.+\s+was activated\.)$/i);
    if (abilityActivationMatch?.[1]) {
      actions.push({
        title: abilityActivationMatch[1],
        details: []
      });
      return;
    }

    const isSubaction =
      trimmed.startsWith("-") ||
      trimmed.startsWith("•") ||
      /\btook \d+ damage\b/i.test(trimmed) ||
      SUBACTION_MARKERS.some((marker) => line.includes(marker));

    if (isSubaction && actions.length > 0) {
      actions[actions.length - 1].details.push(trimmed);
      return;
    }

    actions.push({
      title: trimmed,
      details: []
    });
  });

  return actions;
}

type DivideSectionsOptions = {
  lines: string[];
  language: Language;
  playerNames: [string, string];
  getPrizesTakenFromLine: (line: string, language: Language) => number;
  isPrizeTakenLine: (line: string, language: Language) => boolean;
};

export function divideIntoSections({
  lines,
  language,
  playerNames,
  getPrizesTakenFromLine,
  isPrizeTakenLine
}: DivideSectionsOptions): LogSection[] {
  const sections: LogSection[] = [];
  let currentTitle = LANGUAGE_STRINGS[language].setup;
  let currentBody: string[] = [];
  const prizes = Object.fromEntries(playerNames.map((player) => [player, 6]));

  const pushCurrentSection = () => {
    if (!currentTitle || currentBody.length === 0) {
      return;
    }

    sections.push({
      title: currentTitle,
      player: inferSectionPlayer(currentTitle, currentBody, playerNames, language),
      actions: getTurnActions(currentBody),
      prizesAfterTurn: { ...prizes }
    });
  };

  lines.forEach((line) => {
    if (line.trim() === LANGUAGE_STRINGS[language].setup) {
      pushCurrentSection();
      currentTitle = LANGUAGE_STRINGS[language].setup;
      currentBody = [];
      return;
    }

    if (isTurnBoundary(line, language)) {
      pushCurrentSection();
      currentTitle = line;
      currentBody = [];
      return;
    }

    currentBody.push(line);

    if (isPrizeTakenLine(line, language)) {
      const player = getLeadingPlayerFromLine(line, playerNames);
      const prizesTaken = getPrizesTakenFromLine(line, language);
      if (player && prizesTaken > 0) {
        prizes[player] = Math.max(0, (prizes[player] ?? 0) - prizesTaken);
      }
    }
  });

  pushCurrentSection();
  return sections;
}
