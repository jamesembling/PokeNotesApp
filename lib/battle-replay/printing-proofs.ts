import { normalizeText } from "@/lib/log-import/normalization";
import type { CardDefinitionEvidence } from "@/lib/card-definition-catalog/types";
import type { ReplayActor, ReplayCard, ReplayProgram, ReplayState, ReplayZoneCard } from "./types";

type ResolvePrinting = (card: ReplayZoneCard) => CardDefinitionEvidence | undefined;

/** Frame intervals describe one physical top, not every stage of its stack.
 * Proofs contain recorded native effects (or a verified copying permission),
 * never a selected representative or a probable printing's fields. */
export type ReplayPrintingProof = Readonly<{
  actor: ReplayActor;
  cardId: string;
  physicalCardId?: string;
  /** Proven current-Active episode, without identifying its original copy. */
  activeEpisodeId?: string;
  name: string;
  effectiveFrom: number;
  effectiveUntil: number;
  proofAt: number;
  effects: readonly string[];
  setId?: string;
  localId?: string;
}>;

/** A source transition can break continuity for a card or its owner's board. */
export type ReplayPrintingBarrier = Readonly<{ frameIndex: number; actor: ReplayActor; cardId?: string }>;

type Epoch = {
  actor: ReplayActor; cardId: string; physicalCardId?: string; name: string; start: number; last: number;
  effects: Map<string, string>; proofAt: number; setId?: string; localId?: string;
  rejected: boolean;
};

const identity = (setId: string, localId: string) => JSON.stringify([setId.trim().toLowerCase(), localId.trim().replace(/^0+(?=\d)/, "")]);
const boardCards = (state: ReplayState, actor: ReplayActor) =>
  [state[actor].active, ...state[actor].bench, ...(state[actor].unplaced ?? [])].filter((card): card is ReplayCard => card !== null);

/** References preserve the original top's immutable facts without adding a
 * physical card to inventory. Underlying cards have their own physical IDs. */
const printingCards = (state: ReplayState, actor: ReplayActor): ReplayZoneCard[] => {
  const side = state[actor];
  const tops = boardCards(state, actor);
  return [...tops, ...tops.flatMap((card) => card.underlying), ...side.knownHand, ...side.discard,
    ...(side.boardPools ?? []).flatMap((pool) => [...pool.cards, ...(pool.memberEvidence ?? []),
      ...(pool.possiblyReturnedCards ?? []), ...(pool.uncertainCards ?? []).flatMap((group) => group.cards)])];
};

function supportsProof(found: CardDefinitionEvidence | undefined, effects: readonly string[], exact: boolean): boolean {
  if (found?.coverage !== "complete" || !found.candidates.length) return false;
  if (exact && (found.resolution !== "exact" || found.displayBasis !== "played_evidence")) return false;
  return found.candidates.every((printing) => effects.every((name) =>
    [...printing.abilities, ...printing.attacks].some((effect) => normalizeText(effect.name) === normalizeText(name))));
}

const indexedPlans = new WeakMap<readonly ReplayPrintingProof[], Map<ReplayActor, Map<string, ReplayPrintingProof[]>>>();
function indexPlan(plan: readonly ReplayPrintingProof[]) {
  let indexed = indexedPlans.get(plan);
  if (!indexed) {
    indexed = new Map();
    for (const proof of plan) {
      let owner = indexed.get(proof.actor);
      if (!owner) { owner = new Map(); indexed.set(proof.actor, owner); }
      const key = proof.activeEpisodeId ? `active:${proof.activeEpisodeId}` : proof.physicalCardId ? `physical:${proof.physicalCardId}` : proof.cardId;
      const epochs = owner.get(key) ?? [];
      epochs.push(proof); owner.set(key, epochs);
    }
    indexedPlans.set(plan, indexed);
  }
  return indexed;
}

/** Physical provenance is supplied by successful source transitions, and is
 * cleared by unsupported identity-changing mutations. Copy/HP barriers alone
 * cannot erase immutable printing facts. Legacy projections without provenance
 * retain their bounded board epochs. Contradictions reject the whole lifetime. */
export function collectReplayPrintingProofs(
  program: ReplayProgram,
  resolve: ResolvePrinting,
  barriers: readonly ReplayPrintingBarrier[] = [],
): readonly ReplayPrintingProof[] {
  const active = new Map<string, Epoch>();
  const completed: Epoch[] = [];
  const indexedBarriers = new Map<number, ReplayPrintingBarrier[]>();
  for (const barrier of barriers) {
    const group = indexedBarriers.get(barrier.frameIndex) ?? [];
    group.push(barrier); indexedBarriers.set(barrier.frameIndex, group);
  }
  const finish = (key: string) => {
    const epoch = active.get(key);
    if (epoch) { completed.push(epoch); active.delete(key); }
  };
  program.frames.forEach((state, frameIndex) => {
    const event = program.events[frameIndex - 1];
    const changesTop = new Set(event?.transaction?.stages.filter((stage) => stage.kind === "evolve").flatMap((stage) => stage.cards.map((card) => card.id)) ?? []);
    const unresolvedTargets = new Set(event?.transaction?.stages.filter((stage) => stage.targetResolved === false).flatMap((stage) => stage.cards.map((card) => card.id)) ?? []);
    const frameBarriers = indexedBarriers.get(frameIndex) ?? [];
    const seen = new Set<string>();
    for (const actor of ["self", "opponent"] as const) {
      // An identified native Ability may return its own stack to the deck in
      // the same source action. Its transaction is the surviving observation;
      // absence from the final board is not absence of printing evidence.
      const staged = event?.transaction?.stages.filter((stage) => stage.targetResolved !== false)
        .flatMap((stage) => stage.cards.filter((card) => card.physicalCardId
          && (stage.actor === actor || !stage.actor && card.definitionOwner === actor)
          && (!card.definitionOwner || card.definitionOwner === actor))) ?? [];
      for (const card of [...printingCards(state, actor), ...staged]) {
        const key = JSON.stringify([actor, card.physicalCardId ? `physical:${card.physicalCardId}` : card.id]);
        seen.add(key);
        const blocked = !card.physicalCardId && (("instanceUncertain" in card && card.instanceUncertain) || unresolvedTargets.has(card.id)
          || frameBarriers.some((barrier) => barrier.actor === actor && (!barrier.cardId || barrier.cardId === card.id)));
        const current = active.get(key);
        if (blocked || !card.physicalCardId && changesTop.has(card.id) || current && normalizeText(current.name) !== normalizeText(card.name)) finish(key);
        if (blocked) continue;
        let epoch = active.get(key);
        if (!epoch) {
          epoch = { actor, cardId: card.id, physicalCardId: card.physicalCardId, name: card.name, start: frameIndex, last: frameIndex,
            effects: new Map(), proofAt: frameIndex, rejected: false };
          active.set(key, epoch);
        }
        epoch.last = frameIndex;
        for (const effect of card.observedEffects ?? []) if (!epoch.effects.has(normalizeText(effect))) {
          epoch.effects.set(normalizeText(effect), effect); epoch.proofAt = frameIndex;
        }
        if (card.setId && card.localId) {
          if (epoch.setId && epoch.localId && identity(epoch.setId, epoch.localId) !== identity(card.setId, card.localId)) epoch.rejected = true;
          if (!epoch.setId) { epoch.setId = card.setId; epoch.localId = card.localId; epoch.proofAt = frameIndex; }
        }
        if (epoch.effects.size || epoch.setId) {
          const effects = [...epoch.effects.values()];
          const found = resolve({ ...card, definitionOwner: actor, observedEffects: effects,
            ...(epoch.setId ? { setId: epoch.setId, localId: epoch.localId } : {}) });
          if (!supportsProof(found, effects, Boolean(epoch.setId))) epoch.rejected = true;
        }
      }
    }
    for (const key of active.keys()) if (!seen.has(key) && !active.get(key)?.physicalCardId) finish(key);
  });
  for (const key of active.keys()) finish(key);
  const physical = completed.filter((epoch) => !epoch.rejected && (epoch.effects.size || epoch.setId)).map((epoch) => Object.freeze({
    actor: epoch.actor, cardId: epoch.cardId, ...(epoch.physicalCardId ? { physicalCardId: epoch.physicalCardId } : {}), name: epoch.name,
    effectiveFrom: epoch.start, effectiveUntil: epoch.physicalCardId ? program.frames.length : epoch.last + 1, proofAt: epoch.proofAt,
    effects: Object.freeze([...epoch.effects.values()].sort((a, b) => normalizeText(a).localeCompare(normalizeText(b)))),
    ...(epoch.setId ? { setId: epoch.setId, localId: epoch.localId } : {}),
  }));
  return Object.freeze([...physical, ...collectActivePrintingProofs(program, resolve)]);
}

/** Source-scoped Active keys reset on every successful position/top boundary.
 * A native execution identifies that uninterrupted position, not an original
 * physical copy. Its query is kept separate from observedEffects throughout. */
function collectActivePrintingProofs(program: ReplayProgram, resolve: ResolvePrinting): readonly ReplayPrintingProof[] {
  const episodes = new Map<string, { actor: ReplayActor; card: ReplayCard; start: number; last: number; proofAt: number; effects: Map<string, string>; rejected: boolean }>();
  program.frames.forEach((state, frameIndex) => {
    for (const actor of ["self", "opponent"] as const) {
      const card = state[actor].active;
      if (!card?.activeEpisodeId || state[actor].activeUncertain) continue;
      const key = JSON.stringify([actor, card.activeEpisodeId]);
      const previous = episodes.get(key);
      if (previous) {
        if (previous.last !== frameIndex - 1 || previous.card.id !== card.id || normalizeText(previous.card.name) !== normalizeText(card.name)) previous.rejected = true;
        previous.last = frameIndex;
      } else episodes.set(key, { actor, card, start: frameIndex, last: frameIndex, proofAt: frameIndex, effects: new Map(), rejected: false });
    }
    for (const stage of program.events[frameIndex - 1]?.transaction?.stages ?? []) {
      if (!stage.actor || stage.targetResolved === false || !["attack", "ability"].includes(stage.kind)) continue;
      for (const card of stage.cards) {
        if (!card.activeEpisodeId || card.definitionOwner && card.definitionOwner !== stage.actor) continue;
        const episode = episodes.get(JSON.stringify([stage.actor, card.activeEpisodeId]));
        if (!episode || episode.card.id !== card.id || normalizeText(episode.card.name) !== normalizeText(card.name)) continue;
        const effects = [...new Map([...(episode.effects.values()), ...(card.observedEffects ?? [])].map((effect) => [normalizeText(effect), effect])).values()];
        if (!effects.length) continue;
        if (!supportsProof(resolve({ ...card, definitionOwner: stage.actor, observedEffects: effects }), effects, false)) { episode.rejected = true; continue; }
        effects.forEach((effect) => episode.effects.set(normalizeText(effect), effect)); episode.proofAt = frameIndex;
      }
    }
  });
  return [...episodes].filter(([, epoch]) => !epoch.rejected && epoch.effects.size).map(([, epoch]) => Object.freeze({
    actor: epoch.actor, cardId: epoch.card.id, activeEpisodeId: epoch.card.activeEpisodeId, name: epoch.card.name,
    effectiveFrom: epoch.start, effectiveUntil: epoch.last + 1, proofAt: epoch.proofAt, effects: Object.freeze([...epoch.effects.values()]),
  }));
}

/** Seed an immutable evidence plan during recompilation, before HP and preview
 * resolution. Prospective candidate checks prevent conflicts with new facts. */
export function applyReplayPrintingProofs(
  plan: readonly ReplayPrintingProof[], state: ReplayState, frameIndex: number, resolve: ResolvePrinting,
): void {
  for (const actor of ["self", "opponent"] as const) {
    for (const card of printingCards(state, actor)) {
      delete card.activePrintingEffects;
      if (card !== state[actor].active) delete card.activeEpisodeId;
      applyReplayPrintingProofToCard(plan, card, actor, frameIndex, resolve);
    }
    const card = state[actor].active;
    if (!card?.activeEpisodeId || state[actor].activeUncertain) continue;
    const proof = indexPlan(plan).get(actor)?.get(`active:${card.activeEpisodeId}`)?.find((entry) => frameIndex >= entry.effectiveFrom && frameIndex < entry.effectiveUntil && card.id === entry.cardId && normalizeText(card.name) === normalizeText(entry.name));
    if (!proof) continue;
    const effects = [...new Set([...(card.observedEffects ?? []), ...proof.effects])];
    if (!supportsProof(resolve({ ...card, definitionOwner: actor, observedEffects: effects }), effects, false)) continue;
    card.activePrintingEffects = { episodeId: card.activeEpisodeId, effects: [...proof.effects] };
    delete card.definitionKey;
  }
}

/** Transaction snapshots use the same top-epoch check as the live board. The
 * caller supplies the snapshot's frame; a prior evolution layer cannot inherit
 * its later top's proof merely because the physical stack ID is shared. */
export function applyReplayPrintingProofToCard(
  plan: readonly ReplayPrintingProof[], card: ReplayZoneCard, actor: ReplayActor,
  frameIndex: number, resolve: ResolvePrinting,
): boolean {
  if (!card.physicalCardId && "instanceUncertain" in card && card.instanceUncertain || card.definitionOwner && card.definitionOwner !== actor) return false;
  const proof = indexPlan(plan).get(actor)?.get(card.physicalCardId ? `physical:${card.physicalCardId}` : card.id)?.find((entry) => frameIndex >= entry.effectiveFrom && frameIndex < entry.effectiveUntil && normalizeText(card.name) === normalizeText(entry.name));
  if (!proof) return false;
  if (proof.setId && proof.localId && card.setId && card.localId && identity(proof.setId, proof.localId) !== identity(card.setId, card.localId)) return false;
  const effects = [...new Map([...(card.observedEffects ?? []), ...proof.effects].map((name) => [normalizeText(name), name])).values()];
  const exact = Boolean(proof.setId && proof.localId);
  const prospective = { ...card, definitionOwner: actor, observedEffects: effects,
    ...(exact ? { setId: proof.setId, localId: proof.localId } : {}) };
  if (!supportsProof(resolve(prospective), effects, exact)) return false;
  card.observedEffects = effects;
  if (exact) { card.setId = proof.setId; card.localId = proof.localId; }
  delete card.definitionKey;
  return true;
}
