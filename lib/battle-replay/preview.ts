import type {
  ReplayActor,
  ReplayCard,
  ReplayState,
  ReplayTransactionStage,
  ReplayZoneCard,
} from "@/lib/battle-replay/prototype";

const boardStateStageKinds = new Set<ReplayTransactionStage["kind"]>([
  "ability",
  "attack",
  "before",
  "bench",
  "damage",
  "evolve",
  "heal",
  "move",
]);

export type ReplayCardPreview = ReplayZoneCard & {
  damage?: number;
  energy?: string[];
  hp?: number;
  underlying?: ReplayZoneCard[];
  tool?: string;
};

export function getHiddenCardSlots(hiddenCount?: number) {
  return Array.from(
    { length: Math.max(0, Math.floor(hiddenCount ?? 0)) },
    (_, index) => index,
  );
}

export function shouldShowTransactionEvolutionStack(
  stage: ReplayTransactionStage,
  card: ReplayCardPreview,
) {
  return stage.kind !== "before"
    && stage.kind !== "evolve"
    && Boolean(card.underlying?.length);
}

export function resolveBoardCardPreview(
  card: ReplayZoneCard,
  stage: ReplayTransactionStage,
  actor: ReplayActor,
  state: ReplayState,
  previousState: ReplayState = state,
): ReplayCardPreview {
  if (!boardStateStageKinds.has(stage.kind)) return card;

  const frame = stage.kind === "before" ? previousState : state;
  const actingSide = actor === "self" ? frame.self : frame.opponent;
  const allBoardCards = [
    frame.self.active,
    ...frame.self.bench,
    frame.opponent.active,
    ...frame.opponent.bench,
  ].filter((candidate): candidate is ReplayCard => candidate !== null);
  const actorBoardCards = [actingSide.active, ...actingSide.bench]
    .filter((candidate): candidate is ReplayCard => candidate !== null);
  const canReferenceEitherBoard = stage.kind === "damage" || stage.kind === "heal" || stage.kind === "move";
  const allCards = canReferenceEitherBoard ? allBoardCards : actorBoardCards;
  const identityMatch = allCards.find((candidate) => candidate.id === card.id);
  if (identityMatch) return { ...card, ...identityMatch, id: card.id };
  const matches = allCards.filter((candidate) => candidate.name === card.name);
  if (matches.length === 1) return { ...card, ...matches[0], id: card.id };

  const identifiesActive = stage.kind === "move"
    || stage.label.toLowerCase().includes("active")
    || stage.detail?.toLowerCase().includes("active");
  const activeMatches = canReferenceEitherBoard
    ? [state.self.active, state.opponent.active]
    : [actingSide.active];
  const identifiedActive = activeMatches.find((candidate) => candidate?.name === card.name);
  if (identifiesActive && identifiedActive)
    return { ...card, ...identifiedActive, id: card.id };

  return card;
}
