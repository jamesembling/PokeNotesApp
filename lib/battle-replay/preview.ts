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

export function resolveTransactionStage(
  stage: ReplayTransactionStage,
  actor: ReplayActor,
  previousState: ReplayState,
  state: ReplayState = previousState,
) {
  if (actor === "self" && stage.cards.length === 0) {
    if (stage.kind === "shuffle") {
      const cards = previousState.self.knownHand;
      const hiddenCount = Math.max(0, previousState.self.handCount - cards.length);
      return { ...stage, cards, hiddenCount: hiddenCount || undefined };
    }

    if (stage.kind === "draw") {
      const previousCardIds = new Set(previousState.self.knownHand.map((card) => card.id));
      const evidencedDraws = state.self.knownHand.filter((card) => !previousCardIds.has(card.id));
      const expectedCount = stage.hiddenCount ?? evidencedDraws.length;
      const cards = evidencedDraws.slice(0, expectedCount);
      const hiddenCount = Math.max(0, expectedCount - cards.length);
      return { ...stage, cards, hiddenCount: hiddenCount || undefined };
    }
  }

  if (
    stage.kind !== "shuffle"
    || stage.cards.length > 0
    || stage.hiddenCount !== undefined
  ) return stage;

  const side = actor === "self" ? previousState.self : previousState.opponent;
  return { ...stage, hiddenCount: side.handCount };
}

export function resolveTransactionActors(
  stage: ReplayTransactionStage,
  actor: ReplayActor,
): ReplayActor[] {
  if (stage.scope !== "both") return [actor];
  return actor === "self" ? ["self", "opponent"] : ["opponent", "self"];
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
  const currentActingSide = actor === "self" ? state.self : state.opponent;
  const previousActingSide = actor === "self" ? previousState.self : previousState.opponent;
  const sideCards = (side: typeof actingSide) => [side.active, ...side.bench]
    .filter((candidate): candidate is ReplayCard => candidate !== null);
  const allBoardCards = [
    frame.self.active,
    ...frame.self.bench,
    frame.opponent.active,
    ...frame.opponent.bench,
  ].filter((candidate): candidate is ReplayCard => candidate !== null);
  const actorBoardCards = sideCards(actingSide);
  const currentActorBoardCards = sideCards(currentActingSide);
  const previousActorBoardCards = sideCards(previousActingSide);
  const canReferenceEitherBoard = stage.kind === "damage" || stage.kind === "heal" || stage.kind === "move";
  const allCards = canReferenceEitherBoard ? allBoardCards : actorBoardCards;
  const identityMatch = allCards.find((candidate) => candidate.id === card.id);
  if (identityMatch) return { ...card, ...identityMatch, id: card.id };
  const matches = allCards.filter((candidate) => candidate.name === card.name);
  if (matches.length === 1) return { ...card, ...matches[0], id: card.id };

  if (stage.kind === "before") {
    const transitioningCard = matches.find((candidate) => {
      const currentCard = currentActorBoardCards.find((current) => current.id === candidate.id);
      return currentCard?.name !== candidate.name
        && currentCard?.underlying?.some((underlying) => underlying.name === candidate.name);
    });
    if (transitioningCard) return { ...card, ...transitioningCard, id: card.id };
  }

  if (stage.kind === "evolve") {
    const transitioningCard = matches.find((candidate) => {
      const previousCard = previousActorBoardCards.find((previous) => previous.id === candidate.id);
      return previousCard && previousCard.name !== candidate.name;
    });
    if (transitioningCard) return { ...card, ...transitioningCard, id: card.id };
  }

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
