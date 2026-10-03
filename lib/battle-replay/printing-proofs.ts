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
  actor: ReplayActor; cardId: string; name: string; start: number; last: number;
  effects: Map<string, string>; proofAt: number; setId?: string; localId?: string;
  rejected: boolean;
};

const identity = (setId: string, localId: string) => JSON.stringify([setId.trim().toLowerCase(), localId.trim().replace(/^0+(?=\d)/, "")]);
const boardCards = (state: ReplayState, actor: ReplayActor) =>
  [state[actor].active, ...state[actor].bench, ...(state[actor].unplaced ?? [])].filter((card): card is ReplayCard => card !== null);

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
      const epochs = owner.get(proof.cardId) ?? [];
      epochs.push(proof); owner.set(proof.cardId, epochs);
    }
    indexedPlans.set(plan, indexed);
  }
  return indexed;
}

/** Collect only facts observed on an identified physical top. Copy ambiguity,
 * removal, evolution and explicit source barriers partition its lifetime.
 * A contradiction rejects that whole segment instead of choosing an answer. */
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
    for (const actor of ["self", "opponent"] as const) for (const card of boardCards(state, actor)) {
      const key = JSON.stringify([actor, card.id]);
      seen.add(key);
      const blocked = card.instanceUncertain || unresolvedTargets.has(card.id)
        || frameBarriers.some((barrier) => barrier.actor === actor && (!barrier.cardId || barrier.cardId === card.id));
      const current = active.get(key);
      if (blocked || changesTop.has(card.id) || current && normalizeText(current.name) !== normalizeText(card.name)) finish(key);
      if (blocked) continue;
      let epoch = active.get(key);
      if (!epoch) {
        epoch = { actor, cardId: card.id, name: card.name, start: frameIndex, last: frameIndex,
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
    for (const key of active.keys()) if (!seen.has(key)) finish(key);
  });
  for (const key of active.keys()) finish(key);
  return Object.freeze(completed.filter((epoch) => !epoch.rejected && (epoch.effects.size || epoch.setId)).map((epoch) => Object.freeze({
    actor: epoch.actor, cardId: epoch.cardId, name: epoch.name,
    effectiveFrom: epoch.start, effectiveUntil: epoch.last + 1, proofAt: epoch.proofAt,
    effects: Object.freeze([...epoch.effects.values()].sort((a, b) => normalizeText(a).localeCompare(normalizeText(b)))),
    ...(epoch.setId ? { setId: epoch.setId, localId: epoch.localId } : {}),
  })));
}

/** Seed an immutable evidence plan during recompilation, before HP and preview
 * resolution. Prospective candidate checks prevent conflicts with new facts. */
export function applyReplayPrintingProofs(
  plan: readonly ReplayPrintingProof[], state: ReplayState, frameIndex: number, resolve: ResolvePrinting,
): void {
  for (const actor of ["self", "opponent"] as const) for (const card of boardCards(state, actor)) {
    applyReplayPrintingProofToCard(plan, card, actor, frameIndex, resolve);
  }
}

/** Transaction snapshots use the same top-epoch check as the live board. The
 * caller supplies the snapshot's frame; a prior evolution layer cannot inherit
 * its later top's proof merely because the physical stack ID is shared. */
export function applyReplayPrintingProofToCard(
  plan: readonly ReplayPrintingProof[], card: ReplayZoneCard, actor: ReplayActor,
  frameIndex: number, resolve: ResolvePrinting,
): boolean {
  if ("instanceUncertain" in card && card.instanceUncertain || card.definitionOwner && card.definitionOwner !== actor) return false;
  const proof = indexPlan(plan).get(actor)?.get(card.id)?.find((entry) => frameIndex >= entry.effectiveFrom && frameIndex < entry.effectiveUntil && normalizeText(card.name) === normalizeText(entry.name));
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
