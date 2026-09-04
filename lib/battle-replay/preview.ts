import type {
  ReplayActor,
  ReplayCard,
  ReplayState,
  ReplayTransactionStage,
  ReplayZoneCard,
} from "@/lib/battle-replay/prototype";

const boardStateStageKinds = new Set<ReplayTransactionStage["kind"]>([
  "ability",
  "bench",
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

export function resolveBoardCardPreview(
  card: ReplayZoneCard,
  stage: ReplayTransactionStage,
  actor: ReplayActor,
  state: ReplayState,
): ReplayCardPreview {
  if (!boardStateStageKinds.has(stage.kind)) return card;

  const actingSide = actor === "self" ? state.self : state.opponent;
  const allBoardCards = [
    state.self.active,
    ...state.self.bench,
    state.opponent.active,
    ...state.opponent.bench,
  ].filter((candidate): candidate is ReplayCard => candidate !== null);
  const actorBoardCards = [actingSide.active, ...actingSide.bench]
    .filter((candidate): candidate is ReplayCard => candidate !== null);
  const canReferenceEitherBoard = stage.kind === "heal" || stage.kind === "move";
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
