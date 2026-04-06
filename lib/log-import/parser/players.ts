import type { Language } from "@/types/index";
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
  ptcglUsername: string
) {
  const normalizedUsername = ptcglUsername.trim().toLowerCase();

  if (!normalizedUsername) {
    throw new ImportLogValidationError(
      "MISSING_PTCGL_USERNAME",
      "Set your PTCGL username in your profile before importing battle logs."
    );
  }

  const selfPlayerName = playerNames.find(
    (playerName) => playerName.trim().toLowerCase() === normalizedUsername
  );

  if (!selfPlayerName) {
    throw new ImportLogValidationError(
      "UNRESOLVED_SELF_PLAYER",
      "Could not match your PTCGL username to either player in this log."
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
