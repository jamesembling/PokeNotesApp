import type {
  ReplayActor,
  ReplayCard,
  ReplayEvent,
  ReplayState,
  ReplayTransactionStage,
  ReplayZoneCard,
  ReplayProgram,
  ReplaySide,
} from "@/lib/battle-replay/types";

/** Gameplay and preview look up the same physical-card evidence query. */
export function resolveReplayCardPreviewDefinition(card: Pick<ReplayZoneCard, "definitionKey">, program: Pick<ReplayProgram, "cardResolutions">) {
  return card.definitionKey && Object.hasOwn(program.cardResolutions ?? {}, card.definitionKey)
    ? program.cardResolutions![card.definitionKey] : undefined;
}

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
  abilityUsed?: boolean;
  conditions?: ReplayCard["conditions"];
  damage?: number;
  damageKnown?: boolean;
  energy?: string[];
  hp?: number | null;
  underlying?: ReplayZoneCard[];
  tool?: string;
  plausibleFields?: ReplayCard["plausibleFields"];
};

/** Render one complete surviving allocation without changing the fact frame. */
export function resolveReplayAssignmentGroups(side: ReplaySide): ReplayCard[][] {
  const cards = [side.active, ...side.bench, ...(side.unplaced ?? [])].filter((card): card is ReplayCard => Boolean(card));
  let groups = cards.map((card) => [card]);
  const join = (ids: Set<string>) => {
    const touched = groups.filter((group) => group.some((card) => ids.has(card.id)));
    if (touched.length < 2) return;
    groups = [...groups.filter((group) => !touched.includes(group)), touched.flat()];
  };
  for (const name of new Set(cards.map((card) => card.name))) join(new Set(cards.filter((card) => card.name === name).map((card) => card.id)));
  for (const pool of side.boardPools ?? []) join(new Set(pool.memberIds));
  return groups;
}

export function resolveReplayBoardDisplay(frame: ReplayState, cardResolutions: ReplayProgram["cardResolutions"] = {}, refusals?: Array<{ actor: ReplayActor; reason: string }>): ReplayState {
  if (!frame.boardProjection) return frame;
  const display = { ...frame };
  const equalNames = (left: readonly string[], right: readonly string[]) => JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
  const componentNames = (card: { underlyingNames: string[]; energy: string[]; tool?: string }) => [
    ...card.underlyingNames, ...card.energy.map((energy) => /Energy$/i.test(energy) ? energy : `Basic ${energy} Energy`), ...(card.tool ? [card.tool] : []),
  ];
  for (const actor of ["self", "opponent"] as const) {
    const projection = frame.boardProjection[actor];
    if (!projection) continue;
    const refuse = (reason: string) => { refusals?.push({ actor, reason }); };
    const side = frame[actor];
    const originals = [side.active, ...side.bench, ...(side.unplaced ?? [])].filter((card): card is ReplayCard => card !== null);
    const layerObjects = new Map([...originals.flatMap((card) => card.underlying), ...(side.boardPools ?? []).flatMap((pool) => pool.cards.filter((card) => card.boardRole === "evolution"))].map((layer) => [layer.id, layer]));
    const layersFor = (patch: (typeof projection.cards)[number]) => patch.underlyingIds
      ? patch.underlyingIds.map((id) => layerObjects.get(id)) : originals.find((card) => card.id === patch.id)?.underlying ?? [];
    const assignedLayerIds = projection.cards.flatMap((patch) => layersFor(patch).map((layer) => layer?.id));
    if (new Set(assignedLayerIds).size !== assignedLayerIds.length || assignedLayerIds.some((id) => !id)
      || new Set(projection.cards.map((card) => card.id)).size !== projection.cards.length
      || projection.cards.some((patch) => !Number.isFinite(patch.damage) || patch.damage < 0 || !originals.some((card) => card.id === patch.id && card.name === patch.name
        && JSON.stringify(layersFor(patch).map((layer) => layer?.name)) === JSON.stringify(patch.underlyingNames)
        && layersFor(patch).every((layer) => layer && (card.underlying.some((local) => local.id === layer.id)
          || side.boardPools?.some((pool) => pool.memberIds.includes(card.id) && pool.cards.some((component) => component.boardRole === "evolution" && component.id === layer.id))))
        && card.underlying.every((layer) => layersFor(patch).some((assigned) => assigned?.id === layer.id))))) { refuse("top_or_layer_inventory"); continue; }
    const nativeEvidence = side.boardPools?.flatMap((pool) => pool.memberEvidence ?? []) ?? [];
    if (projection.cards.some((patch) => {
      const original = originals.find((card) => card.id === patch.id)!;
      if (patch.position === "active" || !original.activePrintingEffects) return false;
      const key = nativeEvidence.find((entry) => entry.id === original.id && entry.name === original.name)?.definitionKey;
      return !key || !Object.hasOwn(cardResolutions ?? {}, key);
    })) { refuse("native_position_query"); continue; }
    const patchedIds = new Set(projection.cards.map((card) => card.id));
    const touchedPools = (side.boardPools ?? []).filter((pool) => pool.memberIds.some((id) => patchedIds.has(id)));
    // Conditional locations are not a definite source of board attachments.
    if (touchedPools.some((pool) => pool.possiblyReturnedCards?.length || pool.uncertainCards?.some((group) => group.cards.length))) { refuse("conditional_component_domain"); continue; }
    // Guaranteed pooled components must be assigned as one complete group.
    // Applying only one member's attachments would leave the same component
    // visible both on that card and in the unresolved pool.
    if (side.boardPools?.some((pool) => pool.cards.length > 0
      && pool.memberIds.some((id) => patchedIds.has(id))
      && pool.memberIds.some((id) => !patchedIds.has(id)))) { refuse("partial_component_group"); continue; }
    const pooledIds = new Set(touchedPools.filter((pool) => pool.cards.length).flatMap((pool) => pool.memberIds));
    if (projection.cards.some((patch) => {
      const original = originals.find((card) => card.id === patch.id)!;
      return !original.instanceUncertain && (original.damageKnown !== false && original.damage !== patch.damage
        || !pooledIds.has(original.id) && (!equalNames(original.energy, patch.energy) || original.tool !== patch.tool)
        || !side.unplaced?.some((card) => card.id === original.id) && (side.active?.id === original.id) !== (patch.position === "active"));
    })) { refuse("known_copy_fact"); continue; }
    let inventoryReason = "component_inventory";
    if (resolveReplayAssignmentGroups(side).some((group) => {
      const members = new Set(group.map((card) => card.id));
      const patches = projection.cards.filter((card) => members.has(card.id));
      if (!patches.length) return false;
      const ids = new Set(patches.map((card) => card.id));
      const pools = touchedPools.filter((pool) => pool.cards.length && pool.memberIds.some((id) => ids.has(id)));
      if (pools.some((pool) => pool.memberIds.some((id) => !ids.has(id)))) return true;
      const renderedDamage = group.map((card) => patches.find((patch) => patch.id === card.id)?.damage ?? card.damage);
      // Even when another copy's damage is unknown, every established value
      // must survive the group's allocation, with its original multiplicity.
      const remainingDamage = new Map(group.map((card) => [card.name, group.filter((member) => member.name === card.name).map((member) => patches.find((patch) => patch.id === member.id)?.damage ?? member.damage)]));
      for (const card of group.filter((card) => card.damageKnown !== false)) {
        const values = remainingDamage.get(card.name)!;
        const index = values.indexOf(card.damage);
        if (index < 0) { inventoryReason = "known_damage_multiset"; return true; }
        values.splice(index, 1);
      }
      if (group.every((card) => card.damageKnown !== false) && !equalNames(group.map((card) => String(card.damage)), renderedDamage.map(String))) return true;
      const recorded = group.filter((card) => ids.has(card.id)).flatMap((card) => componentNames({ ...card, underlyingNames: card.underlying.map((layer) => layer.name) }));
      return !equalNames([...recorded, ...pools.flatMap((pool) => pool.cards.map((card) => card.name))], patches.flatMap(componentNames));
    })) { refuse(inventoryReason); continue; }
    const cards = originals.map((original) => {
      const patch = projection.cards.find((card) => card.id === original.id);
      if (!patch) return { card: original, position: side.active?.id === original.id ? "active" : side.bench.some((card) => card.id === original.id) ? "bench" : "unplaced" };
      const fields: NonNullable<ReplayCard["plausibleFields"]> = [...patch.plausibleFields];
      if (original.damageKnown === false || original.instanceUncertain && original.damage !== patch.damage) fields.push("damage");
      if (original.instanceUncertain || (side.active?.id === patch.id) !== (patch.position === "active")) fields.push("position");
      if (!equalNames(original.energy, patch.energy)) fields.push("energy");
      if (original.tool !== patch.tool) fields.push("tool");
      const underlying = layersFor(patch).filter((layer): layer is ReplayZoneCard => Boolean(layer));
      if (JSON.stringify(original.underlying.map((layer) => layer.id)) !== JSON.stringify(underlying.map((layer) => layer.id))) fields.push("underlying");
      const card: ReplayCard = { ...original, underlying, damage: patch.damage, damageKnown: true, energy: [...patch.energy], tool: patch.tool,
        remainingHp: original.hp === null ? null : Math.max(0, original.hp - patch.damage),
        instanceUncertain: false, knownStackSize: 1 + underlying.length + patch.energy.length + Number(Boolean(patch.tool)),
        ...(fields.length ? { plausibleFields: [...new Set(fields)] } : {}) };
      // A native Active-episode query is positional evidence, independent of
      // the selected original copy. Keep it on the displayed Active only.
      if (patch.position === "active" && side.active?.name === card.name && side.active.activePrintingEffects) {
        card.activeEpisodeId = side.active.activeEpisodeId;
        card.activePrintingEffects = side.active.activePrintingEffects;
        card.definitionKey = side.active.definitionKey;
        card.hp = side.active.hp; card.baseHp = side.active.baseHp; card.maxHp = side.active.maxHp; card.hpBasis = side.active.hpBasis;
        card.remainingHp = card.hp === null ? null : Math.max(0, card.hp - patch.damage);
      } else if (original.activePrintingEffects) {
        delete card.activeEpisodeId; delete card.activePrintingEffects;
        const native = nativeEvidence.find((entry) => entry.id === card.id && entry.name === card.name)!;
        card.definitionKey = native.definitionKey;
        const resolution = cardResolutions![native.definitionKey!];
        card.baseHp = resolution.printedHp ?? null;
        card.hpBasis = resolution.hpBasis ?? "unknown";
        // Positional printed HP cannot survive on an original Bench copy.
        // A non-baseline maximum needs its own independently resolved modifier.
        card.hp = card.hpModifierUncertain || original.hp !== original.baseHp ? null : card.baseHp;
        card.maxHp = card.hp;
        if (card.hp === null) card.hpBasis = "unknown";
        else if (card.hpModifierBasis === "unverified_attachment") card.hpBasis = "probable";
        card.remainingHp = card.hp === null ? null : Math.max(0, card.hp - patch.damage);
      }
      // A plausible modifier assignment cannot become a known effective HP
      // merely through positional printing restoration above.
      if (patch.hpUncertain || card.hpModifierUncertain) {
        card.hp = null; card.maxHp = null; card.remainingHp = null; card.hpBasis = "unknown";
      }
      return { card, position: patch.position };
    });
    const activeCards = cards.filter((entry) => entry.position === "active");
    if (side.active ? activeCards.length !== 1 : activeCards.length > 1
      || activeCards.length === 1 && (!side.activeUncertain || !side.unplaced?.some((card) => card.id === activeCards[0].card.id)
        || !projection.cards.some((patch) => patch.id === activeCards[0].card.id && patch.plausibleFields.includes("position")))) { refuse("active_slot"); continue; }
    const bench = cards.filter((entry) => entry.position === "bench").map((entry) => entry.card);
    if (projection.benchOrder && (new Set(projection.benchOrder).size !== bench.length || projection.benchOrder.length !== bench.length
      || !bench.every((card) => projection.benchOrder!.includes(card.id)))) { refuse("bench_order"); continue; }
    display[actor] = { ...side, active: cards.find((entry) => entry.position === "active")?.card ?? null,
      bench: projection.benchOrder ? projection.benchOrder.map((id) => bench.find((card) => card.id === id)!) : bench,
      unplaced: cards.filter((entry) => entry.position === "unplaced").map((entry) => entry.card),
      activeUncertain: activeCards.length > 0 && patchedIds.has(activeCards[0].card.id) ? false : side.activeUncertain,
      boardPools: side.boardPools?.map((pool) => pool.memberIds.length && pool.memberIds.every((id) => patchedIds.has(id)) ? { ...pool, cards: [] } : pool) };
  }
  return display;
}

/** Replace only unresolved recipients for this action's recorded increments.
 * Known namesakes and unrelated source operations keep their own stages. */
export function resolveReplayDisplayEvent(event: ReplayEvent | null, frame: ReplayState, display: ReplayState): ReplayEvent | null {
  if (!event) return event;
  const stages = [...(event.transaction?.stages ?? [])];
  const consumedKnown = new Set<string>();
  let changed = false;
  const amountOf = (stage: ReplayTransactionStage) => Number(/^(\d+) damage(?: · plausible recipient)?$/.exec(stage.label)?.[1]);
  const unresolved = (stage: ReplayTransactionStage, card: ReplayZoneCard) => stage.targetResolved === false
    || "instanceUncertain" in card && card.instanceUncertain === true;
  for (const actor of ["self", "opponent"] as const) {
    for (const move of frame.boardProjection?.[actor]?.moves ?? []) {
      if (move.kind !== "damage" || !move.amount) continue;
      const card = [display[actor].active, ...display[actor].bench].find((candidate) => candidate?.id === move.cardId);
      if (!card?.plausibleFields?.includes("damage")) continue;
      const knownStage = stages.findIndex((stage, index) => stage.kind === "damage" && stage.actor === actor && amountOf(stage) === move.amount
        && stage.cards.some((entry) => entry.id === card.id && !unresolved(stage, entry) && !consumedKnown.has(`${index}:${entry.id}`)));
      if (knownStage >= 0) { consumedKnown.add(`${knownStage}:${card.id}`); continue; }
      const ambiguousStage = stages.findIndex((stage) => stage.kind === "damage" && stage.actor === actor && amountOf(stage) === move.amount
        && stage.cards.some((entry) => entry.name === card.name && unresolved(stage, entry)));
      if (ambiguousStage >= 0) {
        const stage = stages[ambiguousStage];
        const index = stage.cards.findIndex((entry) => entry.name === card.name && unresolved(stage, entry));
        const cards = stage.cards.filter((_, ordinal) => ordinal !== index);
        // Leave the stage index stable while matching later increments.
        stages[ambiguousStage] = { ...stage, cards };
      }
      stages.push({ kind: "damage", label: `${move.amount} damage · plausible recipient`, cards: [card], actor });
      changed = true;
    }
  }
  return !changed ? event : { ...event, transaction: { actor: event.actor, title: event.summary, ...event.transaction,
    stages: stages.filter((stage) => stage.kind !== "damage" || stage.cards.length > 0) } };
}

export function resolveEnergyMarkers(energy: string[]): Array<{ type: string; count?: number }> {
  if (energy.length <= 5) {
    return energy.map((type) => ({ type }));
  }

  const counts = new Map<string, number>();
  for (const type of energy) counts.set(type, (counts.get(type) ?? 0) + 1);
  return Array.from(counts, ([type, count]) => ({ type, count }));
}

export function resolveTransactionStage(
  stage: ReplayTransactionStage,
  actor: ReplayActor,
  previousState: ReplayState,
  state: ReplayState = previousState,
) {
  const actorCount = stage.actorCounts?.[actor];
  const actorCards = stage.actorCards?.[actor];
  if (stage.cards.length === 0 && actorCards) {
    const expectedCount = actorCount ?? actorCards.length;
    const cards = actorCards.slice(0, expectedCount);
    const hiddenCount = Math.max(0, expectedCount - cards.length);
    return { ...stage, cards, hiddenCount: hiddenCount || undefined };
  }

  if (actor === "self" && stage.cards.length === 0) {
    if (stage.kind === "shuffle") {
      const expectedCount = actorCount ?? previousState.self.handCount ?? previousState.self.knownHand.length;
      const cards = previousState.self.knownHand.slice(0, expectedCount);
      const hiddenCount = Math.max(0, expectedCount - cards.length);
      return { ...stage, cards, hiddenCount: hiddenCount || undefined };
    }

    if (stage.kind === "draw") {
      const previousCardIds = new Set(previousState.self.knownHand.map((card) => card.id));
      const evidencedDraws = state.self.knownHand.filter((card) => !previousCardIds.has(card.id));
      const expectedCount = actorCount ?? stage.hiddenCount ?? evidencedDraws.length;
      const cards = evidencedDraws.slice(0, expectedCount);
      const hiddenCount = Math.max(0, expectedCount - cards.length);
      return { ...stage, cards, hiddenCount: hiddenCount || undefined };
    }
  }

  if (actorCount !== undefined && stage.cards.length === 0) {
    return { ...stage, hiddenCount: actorCount };
  }

  if (
    stage.kind !== "shuffle"
    || stage.cards.length > 0
    || stage.hiddenCount !== undefined
  ) return stage;

  const side = actor === "self" ? previousState.self : previousState.opponent;
  return { ...stage, hiddenCount: side.handCount ?? undefined };
}

export function resolveTransactionActors(
  stage: ReplayTransactionStage,
  actor: ReplayActor,
): ReplayActor[] {
  if (stage.actor) return [stage.actor];
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
  if (stage.targetResolved === false) return card;
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

  if (stage.kind === "ability") {
    const newlyUsedCard = matches.find((candidate) => {
      const previousCard = previousActorBoardCards.find(
        (previous) => previous.id === candidate.id,
      );
      return candidate.abilityUsed && !previousCard?.abilityUsed;
    });
    if (newlyUsedCard) return { ...card, ...newlyUsedCard, id: newlyUsedCard.id };
  }

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

export function resolveOpeningCoinToss(event: ReplayEvent | null) {
  const call = event?.sourceTitle.match(/^(.+?) chose (heads|tails) for the opening coin flip\.?$/i);
  if (!event || !call) return null;
  const choice = call[2].toLowerCase() as "heads" | "tails";
  const winners = [...new Set(event.sourceDetails.flatMap((detail) => {
    const winner = detail.trim().match(/^(?:- )?(.+?) won the coin toss\.?$/i);
    return winner ? [winner[1]] : [];
  }))];
  const winner: ReplayActor | null = winners.length === 1
    ? winners[0] === call[1] ? event.actor : event.actor === "self" ? "opponent" : "self"
    : null;
  return {
    caller: event.actor,
    choice,
    winner,
    result: winner === null ? null : winner === event.actor ? choice : choice === "heads" ? "tails" : "heads",
  };
}

export function resolveResultOnlyCoinFlip(event: ReplayEvent | null) {
  const flip = event?.sourceTitle.match(/^(.+?) flipped a coin and it landed on (heads|tails)\.?$/i);
  if (!event || !flip) return null;
  return {
    actor: event.actor,
    result: flip[2].toLowerCase() as "heads" | "tails",
  };
}

export function resolveOpeningTurnChoice(event: ReplayEvent | null) {
  if (!event || event.turn !== 0) return null;
  const match = event.sourceTitle.match(/^.+? decided to go (first|second)\.?$/i);
  if (!match) return null;
  return { actor: event.actor, order: match[1].toLowerCase() as "first" | "second" };
}
