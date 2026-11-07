import type { Language, LogSection } from "@/types/index";
import { ImportLogValidationError } from "@/lib/log-import/types";

const SETUP_PATTERNS: Record<Language, RegExp> = {
  en: /(.*) drew 7 cards for the opening hand/g,
  es: /(.*) robó 7 cartas de la mano inicial/g,
  de: /(.*) hat für die Starthand 7 Karten gezogen/g,
  fr: /(.*) a pioché 7 cartes pour sa main de départ/g,
  it: /(.*) ha pescato 7 carte come mano d’apertura/g,
  "pt-br": /(.*) comprou 7 cartas para a mão inicial/g
};

export function extractPlayerNames(lines: string[], language: Language): [string, string] {
  const players: string[] = [];

  lines.forEach((line) => {
    const match = SETUP_PATTERNS[language].exec(line);
    SETUP_PATTERNS[language].lastIndex = 0;
    const name = match?.[1]?.trim();
    if (name && !players.includes(name)) {
      players.push(name);
    }
  });

  if (players.length !== 2) {
    throw new ImportLogValidationError(
      "UNKNOWN_LOG",
      `Could not resolve exactly two players from the log setup. Found: ${players.join(", ")}`
    );
  }

  return [players[0], players[1]];
}

export function resolveSelfOpponent(
  playerNames: [string, string],
  ptcglUsername: string,
  ptcglUsernameAliases: string[] = []
) {
  const normalizedUsername = ptcglUsername.trim().toLowerCase();

  if (!normalizedUsername) {
    throw new ImportLogValidationError(
      "MISSING_PTCGL_USERNAME",
      "Set your PTCGL username in your profile before importing battle logs."
    );
  }

  const acceptedUsernames = new Set(
    [ptcglUsername, ...ptcglUsernameAliases]
      .map((username) => username.trim().toLowerCase())
      .filter(Boolean)
  );
  const selfPlayerName = playerNames.find((playerName) =>
    acceptedUsernames.has(playerName.trim().toLowerCase())
  );

  if (!selfPlayerName) {
    throw new ImportLogValidationError(
      "UNRESOLVED_SELF_PLAYER",
      "Could not match your primary or alternate PTCGL usernames to either player in this log."
    );
  }

  const opponentPlayerName =
    playerNames.find((playerName) => playerName !== selfPlayerName) ?? "";

  if (!opponentPlayerName) {
    throw new ImportLogValidationError(
      "UNRESOLVED_SELF_PLAYER",
      "Could not resolve the opponent player from this log."
    );
  }

  return {
    selfPlayerName,
    opponentPlayerName
  };
}

function replaceExactPlayerName(value: string, sourcePlayerName: string, canonicalPlayerName: string) {
  const escapedPlayerName = sourcePlayerName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const playerNamePattern = new RegExp(
    `(?<![\\p{L}\\p{N}_])${escapedPlayerName}(?![\\p{L}\\p{N}_])`,
    "gu"
  );

  return value.replace(playerNamePattern, canonicalPlayerName);
}

export function canonicalizeSelfPlayerSections(
  sections: LogSection[],
  sourcePlayerName: string,
  canonicalPlayerName: string
) {
  if (!sourcePlayerName || !canonicalPlayerName || sourcePlayerName === canonicalPlayerName) {
    return sections;
  }

  return sections.map((section) => ({
    ...section,
    title: replaceExactPlayerName(section.title, sourcePlayerName, canonicalPlayerName),
    player:
      section.player === sourcePlayerName
        ? canonicalPlayerName
        : section.player,
    actions: section.actions.map((action) => ({
      ...action,
      title: replaceExactPlayerName(action.title, sourcePlayerName, canonicalPlayerName),
      details: action.details.map((detail) =>
        replaceExactPlayerName(detail, sourcePlayerName, canonicalPlayerName)
      )
    })),
    prizesAfterTurn: Object.fromEntries(
      Object.entries(section.prizesAfterTurn).map(([playerName, prizes]) => [
        playerName === sourcePlayerName ? canonicalPlayerName : playerName,
        prizes
      ])
    )
  }));
}

/** Match the recorded actor, including names ending in punctuation. */
export function getLeadingPlayerFromLine(line: string, playerNames: string[]) {
  const normalized = String(line || "").replace(/^\s*(?:[-•]\s+)?/, "");
  return (
    playerNames
      .toSorted((left, right) => right.length - left.length)
      .find(
        (player) =>
          normalized.startsWith(`${player} `) ||
          normalized.startsWith(`${player}'s `) ||
          normalized.startsWith(`${player}’s `)
      ) ?? ""
  );
}
