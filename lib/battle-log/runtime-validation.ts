import type { BattleLog, DeckCard, LogAction, LogSection } from "@/types/index";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isOptionalString(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === "string";
}

function isLogAction(value: unknown): value is LogAction {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.title === "string" && isStringArray(value.details);
}

function isPrizeMap(value: unknown): value is Record<string, number> {
  return isRecord(value) && Object.values(value).every(isFiniteNumber);
}

function isLogSection(value: unknown): value is LogSection {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.title === "string" &&
    typeof value.player === "string" &&
    Array.isArray(value.actions) &&
    value.actions.every(isLogAction) &&
    isPrizeMap(value.prizesAfterTurn)
  );
}

export function decodeLogSections(value: unknown): LogSection[] | null {
  if (!Array.isArray(value) || !value.every(isLogSection)) {
    return null;
  }

  return value;
}

export function decodeSerializedLogSections(value: unknown): LogSection[] | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  try {
    return decodeLogSections(JSON.parse(value) as unknown);
  } catch {
    return null;
  }
}

function hasBattleLogScalars(candidate: Record<string, unknown>) {
  const stringFields = [
    "id",
    "userId",
    "date",
    "format",
    "selfPlayerName",
    "selfDeckName",
    "selfDeckSlug",
    "opponentPlayerName",
    "opponentDeckName",
    "opponentDeckSlug",
    "reason",
    "rawLog",
    "importedAt",
    "createdAt",
    "updatedAt"
  ] as const;
  const numberFields = [
    "totalTurns",
    "selfPrizesTaken",
    "opponentPrizesTaken",
    "selfAttackDamage",
    "opponentAttackDamage",
    "selfMulligans",
    "opponentMulligans"
  ] as const;

  return (
    stringFields.every((field) => typeof candidate[field] === "string") &&
    numberFields.every((field) => isFiniteNumber(candidate[field])) &&
    (candidate.result === "Win" || candidate.result === "Loss") &&
    (candidate.goOrder === "First" ||
      candidate.goOrder === "Second" ||
      candidate.goOrder === "") &&
    (typeof candidate.coinTossWon === "boolean" || candidate.coinTossWon === null) &&
    isStringArray(candidate.selfDeckSprites) &&
    isStringArray(candidate.opponentDeckSprites) &&
    isOptionalString(candidate.linkedDeckId) &&
    isOptionalString(candidate.linkedDeckListId)
  );
}

export function decodeBattleLog(value: unknown): BattleLog | null {
  if (!isRecord(value) || !hasBattleLogScalars(value)) {
    return null;
  }

  const sections = decodeLogSections(value.sections);
  if (!sections) {
    return null;
  }

  return {
    id: value.id as string,
    userId: value.userId as string,
    date: value.date as string,
    result: value.result as BattleLog["result"],
    format: value.format as string,
    goOrder: value.goOrder as BattleLog["goOrder"],
    selfPlayerName: value.selfPlayerName as string,
    selfDeckName: value.selfDeckName as string,
    selfDeckSlug: value.selfDeckSlug as string,
    selfDeckSprites: value.selfDeckSprites as string[],
    opponentPlayerName: value.opponentPlayerName as string,
    opponentDeckName: value.opponentDeckName as string,
    opponentDeckSlug: value.opponentDeckSlug as string,
    opponentDeckSprites: value.opponentDeckSprites as string[],
    totalTurns: value.totalTurns as number,
    coinTossWon: value.coinTossWon as boolean | null,
    selfPrizesTaken: value.selfPrizesTaken as number,
    opponentPrizesTaken: value.opponentPrizesTaken as number,
    selfAttackDamage: value.selfAttackDamage as number,
    opponentAttackDamage: value.opponentAttackDamage as number,
    selfMulligans: value.selfMulligans as number,
    opponentMulligans: value.opponentMulligans as number,
    linkedDeckId: typeof value.linkedDeckId === "string" ? value.linkedDeckId : undefined,
    linkedDeckListId:
      typeof value.linkedDeckListId === "string" ? value.linkedDeckListId : undefined,
    reason: value.reason as string,
    rawLog: value.rawLog as string,
    sections,
    importedAt: value.importedAt as string,
    createdAt: value.createdAt as string,
    updatedAt: value.updatedAt as string
  };
}

function isPokemonStage(value: unknown): value is NonNullable<DeckCard["stage"]> {
  return value === "Basic" || value === "Stage 1" || value === "Stage 2";
}

function isDeckCard(value: unknown): value is DeckCard {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isFiniteNumber(value.count) &&
    typeof value.name === "string" &&
    typeof value.set === "string" &&
    typeof value.number === "string" &&
    isOptionalString(value.category) &&
    isOptionalString(value.trainerType) &&
    isOptionalString(value.spriteUrl) &&
    (value.stage === undefined || value.stage === null || isPokemonStage(value.stage))
  );
}

export function decodeDeckCards(value: unknown): DeckCard[] | null {
  if (!Array.isArray(value) || !value.every(isDeckCard)) {
    return null;
  }

  return value.map((card) => ({
    count: card.count,
    name: card.name,
    set: card.set,
    number: card.number,
    category: card.category ?? undefined,
    trainerType: card.trainerType ?? undefined,
    spriteUrl: card.spriteUrl ?? undefined,
    stage: card.stage ?? undefined
  }));
}
