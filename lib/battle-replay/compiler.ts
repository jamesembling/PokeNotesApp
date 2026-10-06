import { getCardDefinitionTrainerFieldAgreement } from "@/lib/card-definition-catalog/resolve";
import { normalizeText } from "@/lib/log-import/normalization";
import { decodeLogSections } from "@/lib/battle-log/runtime-validation";
import { flattenReplaySourceActions } from "./source";
import { createReplayHpContext } from "./hp";
import { collectReplayPrintingProofs, type ReplayPrintingProof } from "./printing-proofs";
import { hasReplayCopyProofs, replayCopyKey, resolveReplayKnockoutHpInventory, solveReplayCopyConstraints, type CopyFact, type CopyStep, type ReplayCopyProofs } from "./copy-constraints";
import { replayBenchTriggerMatches, type ReplayEffectTarget } from "./effect-targets";
import { isReplayAbilityLimitContextNeutral, isReplayCopyIndependentOnceAbilityText, isReplayHandEvolutionText, isReplaySelfAttackPermission, resolveReplayAbilityActivation, stripReplayNamedAbilityLimits, supportsReplayActiveAbilityPredicate } from "./ability-eligibility";
import { resolveReplayAssignmentGroups, resolveReplayBoardDisplay } from "./preview";
import type { ReplayCondition } from "./conditions";
import type {
  ReplayActor, ReplayCard, ReplayEffectKind, ReplayEvent, ReplayLogSource, ReplayProgram,
  ReplaySide, ReplayState, ReplayTransactionStage, ReplayZoneCard,
} from "./types";

export type { ReplayLogSource, ReplayProgram } from "./types";

const clean = (line: string) => line.trim().replace(/^[-•]\s*/, "").replace(/[.!]$/, "");
const count = (text: string) => {
  const value = /^(?:a|an)$/i.test(text) ? 1 : Number(text);
  if (!Number.isSafeInteger(value) || value < 1 || value > 60) throw new Unresolved("The recorded count is outside the supported replay bounds.");
  return value;
};
const observeEffect = (card: ReplayCard, name: string) => { card.observedEffects = [...new Set([...(card.observedEffects ?? []), name])]; };
const allCards = (side: ReplaySide) => [side.active, ...side.bench, ...(side.unplaced ?? [])].filter((card): card is ReplayCard => card !== null);
const physicalCardCount = (card: ReplayCard) => 1 + card.underlying.length + card.energy.length + Number(Boolean(card.tool));

/** A Stadium activation may be skipped as a mutation-free notice only when
 * every printed rules sentence is a pure passive prevention clause (or a
 * damage-still-taken clarification). Any heal, draw, move, return, discard,
 * search, Prize, HP, condition, choice or conditional wording refuses. */
const PREVENTION_FORBIDDEN = /\b(?:heal|healed|draw|drew|attach|attached|move|moved|return|returned|discard|discarded|shuffle|search|put|switch|remove|evolve|devolve|flip|choose|look|reveal|play|played|use|take|takes|Prize|Knocked Out|knock|HP|Energy|Tool|Special Condition|Poisoned|Burned|Asleep|Paralyzed|Confused|hand|deck|instead|unless|if|except|only|until|during|once|then|and also|additional|more)\b/i;
const PREVENTION_SCOPE_WORDS = new Set(["benched", "active", "basic", "stage", "1", "2", "evolution", "evolved", "pokémon", "pokemon", "ex", "v", "your", "opponent's", "the", "both", "yours", "and", "each", "player's", "in", "play"]);
export function isReplayPurePreventionStadiumRules(rules: readonly string[] | null | undefined): boolean {
  if (!rules?.length || rules.some((rule) => typeof rule !== "string" || !rule.trim())) return false;
  const sentences = rules.flatMap((rule) => rule.trim().split(/(?<=[.!?)])\s+(?=[A-Z(])/));
  let hasPrevention = false;
  const valid = sentences.every((raw) => {
    const sentence = raw.trim();
    const prevention = /^Prevent all (?:damage counters from being placed on|damage done to|effects of attacks(?:, including damage,)? done to) ([^.]+?)(?: by (?:effects of )?(attacks(?: and Abilities)?|Abilities)(?: (?:from|used by) ([^.]+?))?)?(?: \(both yours and your opponent['’]s\))?\.$/i.exec(sentence);
    if (prevention) {
      hasPrevention = true;
      // Target and source phrases are a closed Pokémon-scope vocabulary, so no
      // effect clause can hide inside them (a denylist alone is open-ended).
      return [prevention[1], prevention[3] ?? ""].every((part) => !PREVENTION_FORBIDDEN.test(part)
        && part.replace(/[(),]/g, " ").split(/\s+/).filter(Boolean).every((word) => PREVENTION_SCOPE_WORDS.has(word.toLowerCase().replace(/’/g, "'"))));
    }
    const clarification = /^\((Damage from attacks is still (?:taken|done))\.\)$/i.exec(sentence);
    return Boolean(clarification);
  });
  return valid && hasPrevention;
}

/** Absence of a passive limit override requires both physical inventories. */
export function replayPassiveInventoriesComplete(state: ReplayState): boolean {
  return (["self", "opponent"] as const).every((owner) => {
    const side = state[owner];
    if (side.inPlayCount == null || side.activeUncertain || side.unplaced?.length
      || side.boardPools?.some((pool) => pool.cards.length > 0 && !pool.memberIds.length
        || pool.possiblyReturnedCards?.length || pool.uncertainCards?.some((group) => group.cards.length))) return false;
    const represented = allCards(side).reduce((sum, card) => sum + physicalCardCount(card), 0)
      + (side.boardPools ?? []).reduce((sum, pool) => sum + pool.cards.length, 0) + Number(state.stadium?.actor === owner);
    return represented === side.inPlayCount;
  });
}
const openComponents = (side: ReplaySide, card: ReplayCard) => (side.boardPools ?? []).some((pool) => pool.memberIds.includes(card.id)
  && (pool.cards.length > 0 && pool.memberIds.length > 1 || pool.possiblyReturnedCards?.length || pool.uncertainCards?.some((group) => group.cards.length)));
const stackComplete = (side: ReplaySide, card: ReplayCard) => !card.instanceUncertain && !openComponents(side, card);
const exactStackSize = (side: ReplaySide, card: ReplayCard) => openComponents(side, card) ? null : card.instanceUncertain ? card.knownStackSize ?? null : physicalCardCount(card)
  + (side.boardPools ?? []).filter((pool) => pool.memberIds.length === 1 && pool.memberIds[0] === card.id).reduce((sum, pool) => sum + pool.cards.length, 0);

class Unresolved extends Error {}
type CountZone = "hand" | "deck" | "prizes" | "board" | "discard";
class CountConflict extends Unresolved {
  constructor(message: string, readonly zones: CountZone[] = ["hand", "deck"]) { super(message); }
}
class BoardCardUnresolved extends Unresolved {}

function zoneCard(id: string, name: string): ReplayZoneCard {
  return { id, name, imageUrl: "" };
}

/** Zone changes retain the evidence of the physical top card, not its damage. */
function topCardEvidence(id: string, card: ReplayCard): ReplayZoneCard {
  return { ...zoneCard(id, card.name),
    observedEffects: [...(card.observedEffects ?? [])],
    ...(card.physicalCardId ? { physicalCardId: card.physicalCardId } : {}),
    ...(card.setId ? { setId: card.setId } : {}),
    ...(card.localId ? { localId: card.localId } : {}),
  };
}

function pokemon(id: string, name: string): ReplayCard {
  return { ...zoneCard(id, name), physicalCardId: id, hp: null, damage: 0, energy: [], underlying: [] };
}

function emptySide(name: string): ReplaySide {
  return { name, active: null, bench: [], unplaced: [], boardPools: [], activeUncertain: false, hpModifiersKnown: true, deckCount: null, handCount: null, inPlayCount: null, discardCount: null, knownHand: [], discard: [], discardIdentitiesKnown: false, prizesRemaining: null };
}

function changeCount(value: number | null, change: number, zones: CountZone[] = ["hand", "deck"]): number | null {
  if (value === null) return null;
  const next = value + change;
  if (next < 0 || next > 60) throw new CountConflict("The recorded card count conflicts with the reconstructed zone.", zones);
  return next;
}

function commonPrinting(cards: ReplayZoneCard[]): Partial<ReplayZoneCard> {
  if (!cards.length) return {};
  const first = cards[0];
  const sameExact = cards.every((card) => card.setId === first.setId && card.localId === first.localId);
  return {
    observedEffects: (first.observedEffects ?? []).filter((effect) => cards.every((card) => card.observedEffects?.includes(effect))),
    ...(sameExact && first.setId && first.localId ? { setId: first.setId, localId: first.localId } : {}),
    ...(cards.length === 1 && first.physicalCardId ? { physicalCardId: first.physicalCardId } : {}),
  };
}

/** Removing a named copy from a complete zone proves an individual only
 * when unique. An exhaustive same-name batch moves the original multiset;
 * a partial batch shares only facts true of every alternative on BOTH sides. */
function removeKnownZone(cards: ReplayZoneCard[], names: string[], complete: boolean): Array<Partial<ReplayZoneCard>> {
  const originals = new Map(names.map((name) => [name, cards.filter((card) => card.name === name).map((card) => structuredClone(card))]));
  const requested = new Map(names.map((name) => [name, names.filter((value) => value === name).length]));
  const used = new Map<string, number>();
  const result = names.map((name) => {
    const alternatives = originals.get(name) ?? [];
    const ordinal = used.get(name) ?? 0; used.set(name, ordinal + 1);
    const exhaustive = complete && requested.get(name) === alternatives.length;
    const evidence = complete && (requested.get(name) ?? 0) <= alternatives.length ? exhaustive ? commonPrinting([alternatives[ordinal]]) : commonPrinting(alternatives) : {};
    const index = cards.findIndex((card) => card.name === name);
    if (index >= 0) cards.splice(index, 1);
    return evidence;
  });
  for (const [name, alternatives] of originals) if (!complete || alternatives.length > (requested.get(name) ?? 0)) {
    const common = complete ? commonPrinting(alternatives) : { observedEffects: [] };
    for (const card of cards.filter((card) => card.name === name)) {
      delete card.physicalCardId; delete card.setId; delete card.localId; delete card.definitionKey;
      Object.assign(card, common);
    }
  }
  return result;
}

function removeHand(side: ReplaySide, names: string[], amount = names.length, destination?: CountZone) {
  const complete = side.handCount !== null && side.knownHand.length === side.handCount;
  const zones: CountZone[] = destination ? ["hand", destination] : ["hand"];
  if (side.handCount !== null && side.knownHand.length === side.handCount) {
    const available = side.knownHand.map((card) => card.name);
    for (const name of names) {
      const index = available.indexOf(name);
      if (index < 0) throw new CountConflict("The recorded hand removal contradicts the previously known hand.", zones);
      available.splice(index, 1);
    }
  }
  side.handCount = changeCount(side.handCount, -amount, zones);
  const evidence = removeKnownZone(side.knownHand, names, complete);
  // With an unidentified removal we cannot know which previously seen cards remain.
  if (amount > names.length) side.knownHand = [];
  return evidence;
}

function findBoardCard(side: ReplaySide, name: string, position: string | undefined, hp: ReturnType<typeof createReplayHpContext>, eligible: (card: ReplayCard) => boolean = () => true, sameHistory: (left: ReplayCard, right: ReplayCard) => boolean = () => true) {
  const pool = position === "Active Spot" ? [side.active] : position === "Bench" ? side.bench : allCards(side);
  const matches = pool.filter((card): card is ReplayCard => Boolean(card && card.name === name && eligible(card)));
  // IDs distinguish physical copies, but only observable, future-relevant state
  // can distinguish the outcome of an action whose source omits copy identity.
  const sameList = (left: string[], right: string[]) => left.length === right.length
    && left.every((value, index) => value === right[index]);
  const samePrintingEvidence = (left: ReplayCard, right: ReplayCard) => {
    if ((left.setId || right.setId || left.localId || right.localId) && (left.setId !== right.setId || left.localId !== right.localId)) return false;
    if (sameList([...(left.observedEffects ?? [])].sort(), [...(right.observedEffects ?? [])].sort())) return true;
    const leftEvidence = hp.resolve(left);
    const rightEvidence = hp.resolve(right);
    return leftEvidence?.coverage === "complete" && rightEvidence?.coverage === "complete"
      && leftEvidence.candidates.length > 0 && sameList(
        leftEvidence.candidates.map((card) => card.sourceCardId).sort(),
        rightEvidence.candidates.map((card) => card.sourceCardId).sort(),
      );
  };
  const sameState = (left: ReplayCard, right: ReplayCard) => left.name === right.name
    && left.hp === right.hp && left.damage === right.damage
    && (left.damageKnown !== false) === (right.damageKnown !== false)
    && Boolean(left.abilityUsed) === Boolean(right.abilityUsed)
    && left.tool === right.tool
    && samePrintingEvidence(left, right)
    && sameList([...(left.conditions ?? [])].sort(), [...(right.conditions ?? [])].sort())
    && sameList([...left.energy].sort(), [...right.energy].sort())
    && sameList(left.underlying.map((card) => JSON.stringify([card.name, card.setId, card.localId, [...(card.observedEffects ?? [])].sort()])), right.underlying.map((card) => JSON.stringify([card.name, card.setId, card.localId, [...(card.observedEffects ?? [])].sort()])));
  const interchangeable = matches.length > 1 && !matches.some((card) => card.id === side.active?.id)
    && matches.every((card) => sameState(card, matches[0]) && sameHistory(card, matches[0]));
  if (matches.length !== 1 && !interchangeable) throw new BoardCardUnresolved(matches.length
    ? `The log does not identify which ${name} was affected.`
    : `${name} is not present in the last evidenced board state.`);
  return matches[0];
}

function anonymise(text: string, input: ReplayLogSource) {
  // Longest name first avoids replacing one player's name inside the other's.
  return [
    { name: input.selfPlayerName, label: "You", possessive: "Your" },
    { name: input.opponentPlayerName, label: "Opponent", possessive: "Opponent's" },
  ].sort((a, b) => b.name.length - a.name.length).reduce((value, player) => value
    .replaceAll(`${player.name}'s`, player.possessive)
    .replaceAll(`${player.name}’s`, player.possessive)
    .replaceAll(player.name, player.label), text)
    .replace(/\bYou wins\b/g, "You win").replace(/^You ended their turn\b/, "You ended your turn");
}

/** Compile recorded English evidence one transition at a time. Unresolved lines
 * invalidate only affected knowledge; validated catalog metadata classifies effects.
 */
export function compileBattleReplay(input: ReplayLogSource, options: { attackKoOrderConvention?: boolean } = {}): ReplayProgram {
  const trace: CopyStep[] = [];
  const projectionTrace: CopyStep[] = [];
  const first = compileReplayPass(input, { trace, projectionTrace });
  if (!first.events.length) return first;
  const copies = solveReplayCopyConstraints(trace, "facts");
  const selections = new Map<string, string>();
  const second = hasReplayCopyProofs(copies) ? compileReplayPass(input, { copies, selections }) : first;
  const hp = createReplayHpContext(input.cardDefinitions, input.format, input.selfCardDefinitions, input.date);
  const printing = collectReplayPrintingProofs(second, hp.resolve, copies.barriers);
  // A fixed, bounded reconciliation: source trace, copy proof, then printing
  // proof on the validated copy lineage. No frames are patched after replay.
  // Printing learned on a canonical carrier must not erase that earlier
  // successful selection by making previously equivalent copies look unlike.
  // Retain only origins of proven relations, never arbitrary lookup choices.
  const referenceSelections = new Map([...copies.relations.values()].flatMap((key) => selections.has(key) ? [[key, selections.get(key)!] as const] : []));
  const program = printing.length ? compileReplayPass(input, { copies, printing, referenceSelections }) : second;
  anchorCompleteDisplayBoards(projectionTrace, program);
  const convention = annotateAttackKnockoutBatches(projectionTrace, input, program);
  const enabled = options.attackKoOrderConvention !== false && !convention.counterexample;
  const display = solveReplayCopyConstraints(projectionTrace, "display", { attackKoOrderConvention: enabled, endFrame: program.frames.length });
  program.displayDiagnostics = { attackKoOrderConvention: options.attackKoOrderConvention === false ? "disabled" : convention.counterexample ? "counterexample_disabled" : "enabled",
    factsPeakAlternatives: copies.peakAlternatives, displayPeakAlternatives: display.peakAlternatives,
    factsBoundedOut: copies.boundedOut, displayBoundedOut: display.boundedOut, segments: [...display.displaySegments], refusals: [] };
  applyBoardProjections(program, display, hp);
  return program;
}

/** A fully represented public side can restart an erased display universe.
 * Numeric totals alone are insufficient: every top, stack and position must
 * be independently known, and conditional inventory cannot be anchored. */
function anchorCompleteDisplayBoards(trace: CopyStep[], program: ReplayProgram) {
  const complete = (state: ReplayState, actor: ReplayActor) => {
    const side = state[actor]; const cards = allCards(side);
    return side.inPlayCount != null && !side.activeUncertain && !side.unplaced?.length && !side.boardPools?.length
      && side.hpModifiersKnown !== false && !side.uncertainZones?.includes("board")
      && cards.every((card) => card.physicalCardId && !card.instanceUncertain && card.damageKnown !== false
        && card.underlying.every((layer) => layer.physicalCardId))
      && cards.reduce((sum, card) => sum + 1 + card.underlying.length + card.energy.length + Number(Boolean(card.tool)), 0) + Number(state.stadium?.actor === actor) === side.inPlayCount;
  };
  const additions: CopyStep[] = [];
  for (const [event, action] of program.events.entries()) {
    if (action.turn > 0 && action.sourceSectionIndex !== program.events[event - 1]?.sourceSectionIndex) {
      const actor = action.turnActor ?? action.actor;
      additions.push({ key: JSON.stringify([event, actor, "turn-start"]), actor, event,
        section: action.sourceSectionIndex, name: "*", kind: "turn" });
    }
  }
  for (const actor of ["self", "opponent"] as const) {
    const entered = new Map<string, number>(); const evolved = new Map<string, number>();
    let wasComplete = complete(program.frames[0], actor);
    for (let frame = 1; frame < program.frames.length; frame++) {
      const event = frame - 1; const section = program.events[event].sourceSectionIndex;
      const cards = allCards(program.frames[frame][actor]);
      const present = new Set(cards.map((card) => card.id));
      for (const id of entered.keys()) if (!present.has(id)) { entered.delete(id); evolved.delete(id); }
      const stages = program.events[event].transaction?.stages ?? [];
      for (const card of cards) {
        if (!entered.has(card.id)) entered.set(card.id, section);
        // Final factual transaction lineage includes copy proofs. The first
        // trace's canonical evolution slot is only a display preference and
        // must not decide a recovered world's evolution timing.
        if (stages.some((stage) => stage.kind === "evolve" && stage.actor === actor
          && stage.cards.some((top) => top.id === card.id && top.name === card.name))) evolved.set(card.id, section);
      }
      const isComplete = complete(program.frames[frame], actor);
      if (isComplete && (!wasComplete || trace.some((step) => step.actor === actor && step.event === frame - 1))) {
        const snapshots: CopyFact[] = cards.map((card) => ({ card: structuredClone(card), position: program.frames[frame][actor].active?.id === card.id ? "active" : "bench",
          entered: entered.get(card.id), evolved: evolved.get(card.id) }));
        additions.push({ key: JSON.stringify([event, actor, "complete-board-checkpoint"]), actor, event, section, name: "*", kind: "checkpoint", cards: snapshots });
      }
      wasComplete = isComplete;
    }
  }
  trace.push(...additions);
  trace.sort((a, b) => a.event - b.event || Number(b.kind === "turn") - Number(a.kind === "turn")
    || Number(a.kind === "checkpoint") - Number(b.kind === "checkpoint"));
}

/** An observed ordering convention is eligible only in an adjacent attack
 * batch. Conditions, recoil, Stadiums and interrupted knockout runs do not
 * borrow it. A independently resolved opposite order disables it for the log. */
function annotateAttackKnockoutBatches(trace: CopyStep[], input: ReplayLogSource, program: ReplayProgram) {
  let counterexample = false;
  for (const attack of trace.filter((step) => step.kind === "damage" && step.position === "active")) {
    const source = JSON.parse(attack.key)[3] as string;
    if (!/^.+?['’]s .+? used .+? on .+?['’]s .+? for \d+\+? damage(?:\. .+)?$/i.test(source)) continue;
    const attacking = program.events[attack.event];
    if (!attacking || attacking.actor === attack.actor) continue;
    const player = attack.actor === "self" ? input.selfPlayerName : input.opponentPlayerName;
    const batch: CopyStep[] = [];
    for (let event = attack.event + 1; event < program.events.length; event++) {
      const action = program.events[event];
      const title = /^(.+?)['’]s (.+?) was Knocked Out$/i.exec(clean(action.sourceTitle));
      if (!title || title[1] !== player || action.sourceSectionIndex !== attacking.sourceSectionIndex) break;
      const knockout = trace.find((step) => step.event === event && step.actor === attack.actor && step.kind === "ko");
      if (!knockout || trace.some((step) => step.event === event && step.kind !== "ko")) break;
      batch.push(knockout);
    }
    if (batch.length < 2) continue;
    const side = program.frames[attack.event][attack.actor];
    const active = side.active;
    const sameNames = active && allCards(side).filter((card) => card.name === active.name);
    const activeRemoved = active && batch.some((step) => step.name === active.name && (sameNames?.length === 1
      || !active.instanceUncertain && active.physicalCardId && program.events[step.event].transaction?.stages.some((stage) => stage.kind === "discard" && stage.cards.some((card) => card.name === active.name && card.physicalCardId === active.physicalCardId))));
    if (active && !side.activeUncertain && activeRemoved && batch[0].name !== active.name) counterexample = true;
    batch.forEach((step, index) => { step.attackKoBatch = { id: `attack:${attack.event}:${attack.actor}`, index, last: index === batch.length - 1 }; });
  }
  return { counterexample };
}

function recordDisplayRefusal(program: ReplayProgram, actor: ReplayActor, stage: "producer" | "materializer", reason: string, frame: number) {
  const entries = program.displayDiagnostics?.refusals;
  if (!entries) return;
  let entry = entries.find((entry) => entry.actor === actor && entry.stage === stage && entry.reason === reason);
  if (!entry) { entry = { actor, stage, reason, count: 0, exampleFrames: [] }; entries.push(entry); }
  entry.count++;
  if (entry.exampleFrames.length < 3 && !entry.exampleFrames.includes(frame)) entry.exampleFrames.push(frame);
}

/** Validate the selected concrete source path against actual represented
 * inventory. Symbolic cards are never published as real card/printing objects. */
function applyBoardProjections(program: ReplayProgram, copies: ReplayCopyProofs, hp: ReturnType<typeof createReplayHpContext>) {
  const namesOf = (card: ReplayCard) => [...card.underlying.map((layer) => layer.name), ...card.energy.map((energy) => /Energy$/i.test(energy) ? energy : `Basic ${energy} Energy`), ...(card.tool ? [card.tool] : [])];
  const equalNames = (a: string[], b: string[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  const mappings: Record<ReplayActor, Map<string, string>> = { self: new Map(), opponent: new Map() };
  const nativeLayers: Record<ReplayActor, Map<string, ReplayZoneCard[]>> = { self: new Map(), opponent: new Map() };
  const benchLineages: Record<ReplayActor, string[]> = { self: [], opponent: [] };
  for (const [frameIndex, actors] of [...copies.projection].sort(([left], [right]) => left - right)) {
    const frame = program.frames[frameIndex]; if (!frame) continue;
    const previousFrame = program.frames[Math.max(0, frameIndex - 1)];
    const previousDisplay = resolveReplayBoardDisplay(previousFrame, program.cardResolutions);
    for (const [actor, checkpoint] of actors) {
      const side = frame[actor];
      // A checkpoint gap or unpatched frame displayed the factual Bench, not
      // an old witness order. Resume from the order the user actually saw.
      if (checkpoint.resetOrder || frameIndex > 0 && (!previousFrame.boardProjection?.[actor]?.benchOrder || previousDisplay[actor] === previousFrame[actor])) benchLineages[actor] = [];
      const previousMappings = new Map(mappings[actor]);
      const patches: NonNullable<ReplayState["boardProjection"]>[ReplayActor] = { basis: "plausible", cards: [], ...(checkpoint.selection ? { selection: checkpoint.selection } : {}) };
      for (const actual of resolveReplayAssignmentGroups(side)) {
        const ids = new Set(actual.map((card) => card.id));
        const names = new Set(actual.map((card) => card.name));
        const projected = checkpoint.cards.filter((copy) => ids.has(copy.card.id) || names.has(copy.card.name));
        if (projected.length !== actual.length || !equalNames(actual.map((card) => card.name), projected.map((copy) => copy.card.name))) { recordDisplayRefusal(program, actor, "producer", "top_inventory", frameIndex); continue; }
        const pools = (side.boardPools ?? []).filter((pool) => pool.memberIds.some((id) => ids.has(id)));
        if (pools.some((pool) => pool.memberIds.some((id) => !ids.has(id)) || pool.possiblyReturnedCards?.length || pool.uncertainCards?.some((group) => group.cards.length))) { recordDisplayRefusal(program, actor, "producer", "component_domain", frameIndex); continue; }
        const represented = [...actual.flatMap(namesOf), ...pools.flatMap((pool) => pool.cards.map((card) => card.name))];
        if (!equalNames(represented, projected.flatMap((copy) => namesOf(copy.card)))) { recordDisplayRefusal(program, actor, "producer", "component_inventory", frameIndex); continue; }
        const remainingDamage = new Map([...names].map((name) => [name, projected.filter((copy) => copy.card.name === name).map((copy) => copy.card.damage)]));
        if (actual.filter((card) => card.damageKnown !== false).some((card) => {
          const values = remainingDamage.get(card.name)!;
          const index = values.indexOf(card.damage);
          if (index < 0) return true;
          values.splice(index, 1); return false;
        })) { recordDisplayRefusal(program, actor, "producer", "known_damage_multiset", frameIndex); continue; }
        const nativeCompatible = (left: ReplayZoneCard, right: ReplayZoneCard) => {
          const a = hp.resolve({ ...left, definitionOwner: actor }); const b = hp.resolve({ ...right, definitionOwner: actor });
          // Unknown source metadata cannot contradict a known printing. Two
          // complete independently constrained domains must still intersect.
          return !a || !b || a.coverage !== "complete" || b.coverage !== "complete"
            || a.candidates.some((printing) => b.candidates.some((other) => other.sourceCardId === printing.sourceCardId));
        };
        const layersFor = (copy: CopyFact, card: ReplayCard): ReplayZoneCard[] | null => {
          const available = [...card.underlying, ...pools.filter((pool) => pool.memberIds.includes(card.id)).flatMap((pool) => pool.cards.filter((layer) => layer.boardRole === "evolution"))];
          const used = new Set<string>(); const layers: ReplayZoneCard[] = [];
          for (const [index, symbolic] of copy.card.underlying.entries()) {
            const candidates = available.filter((layer) => !used.has(layer.id) && layer.name === symbolic.name && nativeCompatible(layer, symbolic));
            const previous = nativeLayers[actor].get(copy.card.id)?.[index];
            const selected = candidates.find((layer) => layer.id === symbolic.id)
              ?? candidates.find((layer) => previous?.name === symbolic.name && layer.id === previous.id)
              ?? (candidates.length === 1 ? candidates[0] : undefined);
            if (!selected) return null;
            used.add(selected.id); layers.push(selected);
          }
          return card.underlying.every((layer) => used.has(layer.id)) ? layers : null;
        };
        const compatible = (copy: CopyFact, card: ReplayCard) => copy.card.name === card.name && copy.card.damageKnown !== false && !copy.card.instanceUncertain && copy.card.damage >= 0
          && nativeCompatible(card, copy.card)
          && layersFor(copy, card) !== null
          && (card.instanceUncertain || card.damageKnown === false || card.damage === copy.card.damage)
          && (card.instanceUncertain || (side.active?.id === card.id) === (copy.position === "active") || side.unplaced?.some((unplaced) => unplaced.id === card.id))
          && (card.instanceUncertain || !card.physicalCardId || copy.card.id === card.id)
          && (card.instanceUncertain || pools.some((pool) => pool.memberIds.includes(card.id) && pool.cards.length) || equalNames(card.energy, copy.card.energy) && card.tool === copy.card.tool);
        const assigned = new Map<string, ReplayCard>(); const available = new Set(actual);
        // Keep established correspondences. Rematch only a disappeared or
        // source-reidentified top; current source-derived IDs settle ties.
        for (const copy of projected) {
          const existing = actual.find((card) => card.id === mappings[actor].get(copy.card.id));
          if (existing && available.has(existing) && compatible(copy, existing)) { assigned.set(copy.card.id, existing); available.delete(existing); }
        }
        const birth = (id: string) => /^action-(\d+)-(?:physical|card)-(\d+)$/.exec(id)?.slice(1).map(Number) ?? [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER];
        const order = (left: string, right: string) => { const a = birth(left); const b = birth(right); return a[0] - b[0] || a[1] - b[1]; };
        for (const copy of [...projected].sort((a, b) => order(a.card.id, b.card.id))) if (!assigned.has(copy.card.id)) {
          const candidates = [...available].filter((card) => compatible(copy, card)).sort((a, b) => Number(b.id === copy.card.id) - Number(a.id === copy.card.id) || order(a.id, b.id));
          if (candidates[0]) { assigned.set(copy.card.id, candidates[0]); available.delete(candidates[0]); }
        }
        if (assigned.size !== projected.length) { recordDisplayRefusal(program, actor, "producer", "known_copy_or_layer", frameIndex); continue; }
        const selectedLayers = new Map(projected.map((copy) => [copy.card.id, layersFor(copy, assigned.get(copy.card.id)!)!]));
        const layerIds = [...selectedLayers.values()].flatMap((layers) => layers.map((layer) => layer.id));
        if (new Set(layerIds).size !== layerIds.length) { recordDisplayRefusal(program, actor, "producer", "native_layer_identity", frameIndex); continue; }
        assigned.forEach((card, id) => { mappings[actor].set(id, card.id); nativeLayers[actor].set(id, selectedLayers.get(id)!); });
        for (const copy of projected) {
          const card = assigned.get(copy.card.id)!;
          const fields: NonNullable<ReplayCard["plausibleFields"]> = [];
          if (card.damageKnown === false || card.instanceUncertain && card.damage !== copy.card.damage) fields.push("damage");
          if (card.instanceUncertain || side.unplaced?.some((unplaced) => unplaced.id === card.id)) fields.push("position");
          if (!equalNames(card.energy, copy.card.energy) || pools.some((pool) => pool.cards.some((card) => card.boardRole === "energy"))) fields.push("energy");
          if (card.tool !== copy.card.tool || pools.some((pool) => pool.cards.some((card) => card.boardRole === "tool"))) fields.push("tool");
          if (!equalNames(card.underlying.map((layer) => layer.name), copy.card.underlying.map((layer) => layer.name)) || pools.some((pool) => pool.cards.some((card) => card.boardRole === "evolution"))) fields.push("underlying");
          if (!card.abilityUsed && copy.card.abilityUsed) fields.push("abilityUsed");
          const assignmentChanged = !equalNames(card.energy, copy.card.energy) || card.tool !== copy.card.tool;
          const pooledHpModifier = pools.some((pool) => pool.cards.some((component) => hp.hasAttachmentHpModifier({ tool: component.name, energy: [component.name], definitionOwner: actor })));
          const attachmentHpChanged = assignmentChanged && (pooledHpModifier || hp.hasAttachmentHpModifier({ ...card, definitionOwner: actor }) || hp.hasAttachmentHpModifier({ ...copy.card, definitionOwner: actor }));
          const derivedMaximum = (candidate: ReplayCard | null) => candidate?.maxHp != null && candidate.baseHp != null && candidate.maxHp !== candidate.baseHp;
          const positionHpChanged = (side.active?.id === card.id) !== (copy.position === "active") && (derivedMaximum(card) || derivedMaximum(side.active));
          if (fields.length) patches.cards.push({ id: card.id, name: card.name, position: copy.position, damage: copy.card.damage, energy: [...copy.card.energy], ...(copy.card.tool ? { tool: copy.card.tool } : {}), underlyingNames: copy.card.underlying.map((layer) => layer.name), underlyingIds: selectedLayers.get(copy.card.id)!.map((layer) => layer.id), plausibleFields: fields,
            ...(copy.card.abilityUsed ? { abilityUsed: true } : {}),
            ...(card.hpModifierUncertain || card.baseHp != null && card.maxHp == null || attachmentHpChanged || positionHpChanged ? { hpUncertain: true as const } : {}) });
        }
      }
      const positions = new Map(checkpoint.cards.map((copy) => [copy.card.id, copy.position]));
      const bench = checkpoint.cards.filter((copy) => copy.position === "bench").map((copy) => copy.card.id);
      if (!benchLineages[actor].length) {
        const reference = previousDisplay[actor].bench;
        benchLineages[actor] = reference.flatMap((card) => bench.filter((id) => (previousMappings.get(id) ?? id) === card.id));
      }
      // Preserve already displayed slots through native-ID remapping. Source
      // removal/promotion drops a slot; a newly benched copy appends once.
      benchLineages[actor] = [...benchLineages[actor].filter((id) => positions.get(id) === "bench"), ...bench.filter((id) => !benchLineages[actor].includes(id))];
      const order = benchLineages[actor].map((id) => mappings[actor].get(id) ?? id);
      if (patches.cards.length) {
        const patched = new Map(patches.cards.map((patch) => [patch.id, patch.position]));
        const actualBench = allCards(side).filter((card) => (patched.get(card.id) ?? (side.active?.id === card.id ? "active" : side.unplaced?.some((copy) => copy.id === card.id) ? "unplaced" : "bench")) === "bench");
        // Scalar Ability markers do not select a new board arrangement. The
        // witness may have a different internal Bench order after a reset.
        const scalarOnly = patches.cards.every((patch) => patch.plausibleFields.every((field) => field === "abilityUsed"));
        if (!scalarOnly && order.length === actualBench.length && new Set(order).size === order.length && actualBench.every((card) => order.includes(card.id))) patches.benchOrder = order;
        patches.moves = checkpoint.moves.map((move) => ({ ...move, cardId: mappings[actor].get(move.cardId) ?? move.cardId })).filter((move) => patches.cards.some((card) => card.id === move.cardId));
        frame.boardProjection ??= {}; frame.boardProjection[actor] = patches;
        if (scalarOnly) benchLineages[actor] = [];
      } else benchLineages[actor] = [];
    }
  }
  program.frames.forEach((frame, index) => {
    if (!frame.boardProjection) return;
    const refusals: Array<{ actor: ReplayActor; reason: string }> = [];
    resolveReplayBoardDisplay(frame, program.cardResolutions, refusals);
    refusals.forEach((refusal) => recordDisplayRefusal(program, refusal.actor, "materializer", refusal.reason, index));
  });
}

function compileReplayPass(input: ReplayLogSource, proof: { trace?: CopyStep[]; projectionTrace?: CopyStep[]; copies?: ReplayCopyProofs; printing?: readonly ReplayPrintingProof[]; selections?: Map<string, string>; referenceSelections?: ReadonlyMap<string, string> } = {}): ReplayProgram {
  const hp = createReplayHpContext(input.cardDefinitions, input.format, input.selfCardDefinitions, input.date);
  const attackRouteHistory: import("./hp").ReplayAttackRouteContext[] = [];
  const abilityLimitContextSafe = (state: ReplayState, name: string, effect: string, actor: ReplayActor) => {
    const targetEvidence = hp.resolve({ name, definitionOwner: actor });
    const sources: ReplayZoneCard[] = [];
    for (const owner of ["self", "opponent"] as const) {
      const side = state[owner];
      for (const card of allCards(side)) {
        sources.push(card);
        if (card.tool) sources.push({ id: `limit-tool:${card.id}`, name: card.tool, imageUrl: "", definitionOwner: owner });
        for (const energy of card.energy.filter((energy) => /Energy$/i.test(energy) && !/^Basic /i.test(energy))) sources.push({ id: `limit-energy:${card.id}:${energy}`, name: energy, imageUrl: "", definitionOwner: owner });
      }
      for (const pool of side.boardPools ?? []) if (pool.memberIds.length) sources.push(...[...pool.cards, ...(pool.possiblyReturnedCards ?? []), ...(pool.uncertainCards ?? []).flatMap((group) => group.cards)]
        .filter((card) => card.boardRole !== "evolution" && !/^Basic .+ Energy$/i.test(card.name)));
    }
    if (state.stadium) sources.push({ id: "limit-stadium", name: state.stadium.name, imageUrl: "", definitionOwner: state.stadium.actor });
    if (sources.some((source) => {
      const found = hp.resolve(source);
      return found?.coverage !== "complete" || !found.candidates.length || found.candidates.some((candidate) =>
        candidate.category !== "Pokemon" && candidate.rules === null || candidate.abilities.some((ability) => ability.text === null)
        || [...(candidate.rules ?? []), ...candidate.abilities.map((ability) => ability.text!)].some((text) => !isReplayAbilityLimitContextNeutral(text, normalizeText(source.name) === normalizeText(name), effect, targetEvidence)));
    })) return false;
    return attackRouteHistory.every((entry) => {
      const found = hp.resolve(entry.card);
      if (found?.coverage !== "complete" || !found.candidates.length) return entry.kind === "trainer";
      return found.candidates.every((candidate) => {
        const texts = entry.kind === "trainer" ? candidate.rules ?? [] : (entry.kind === "ability" ? candidate.abilities : candidate.attacks)
          .filter((effect) => normalizeText(effect.name) === normalizeText(entry.effect ?? "")).map((effect) => effect.text);
        return (entry.kind === "trainer" || texts.length > 0) && texts.every((text) => text !== null && isReplayAbilityLimitContextNeutral(text, normalizeText(entry.card.name) === normalizeText(name), effect, targetEvidence));
      });
    });
  };
  const attackPrintingEvidence = (card: ReplayCard, name: string, state: ReplayState) => hp.attackPrintingEvidence(card, name, state, attackRouteHistory);
  const activeAbilityPredicateSafe = (state: ReplayState, actor: ReplayActor, sourceName: string, ability: string) => {
    // Absence of a repeat/grant/suppression source needs a complete physical
    // passive inventory on both sides, not just the visible Active predicate.
    if (!replayPassiveInventoriesComplete(state)) return false;
    const side = state[actor]; const active = side.active;
    const activeEvidence = active ? hp.resolve(active) : undefined;
    const sourceEvidence = hp.resolve({ name: sourceName, definitionOwner: actor });
    return supportsReplayActiveAbilityPredicate({ active, activeUncertain: side.activeUncertain, sourceName, ability, activeEvidence, sourceEvidence });
  };
  const enteredPlay = new Map<string, number>();
  const lastEvolution = new Map<string, number>();
  const handEvolutionEntries = new Map<string, { actor: ReplayActor; name: string; event: number; ordinal: number; section: number }>();
  // Original top printing and complete attached-component history survive a
  // positional projection. These references are not extra physical inventory.
  const retainedTops = new Map<string, { actor: ReplayActor; memberIds: string[]; top: ReplayZoneCard; components?: string[] }>();
  const pendingTopDepartures: Array<{ actor: ReplayActor; destination: "discard"; id: string; topIds: string[] }> = [];
  let currentSection = -1;
  let currentAction = -1;
  let currentLine = "";
  let currentLineOrdinal = -1;
  const selectedCopies = new Map<string, string>();
  let pendingPrizeAnnotations: Record<ReplayActor, { section: number; remaining: number } | null> = { self: null, opponent: null };
  const earlyPrizeAnnotations = new Map<number, { amount: number; names: string[] }>();
  let pendingBenchTriggers: Array<{ actor: ReplayActor; cardId: string; section: number; stadium: string }> = [];
  const futureHistoryConsumers: Array<ReadonlySet<string>> = [];
  const sameHistory = (left: ReplayCard, right: ReplayCard) => {
    const consumers = futureHistoryConsumers[currentAction];
    // History is a live constraint only while this section can consume it.
    // Current source lines are included, so the operation itself cannot erase
    // its evolution/activation preconditions by declaring copies equivalent.
    if (consumers && !consumers.has("*") && !consumers.has(normalizeText(left.name))) return true;
    return [enteredPlay, lastEvolution].every((history) => (history.get(left.id) === currentSection) === (history.get(right.id) === currentSection));
  };
  const boundCard = (side: ReplaySide, name: string, position?: string) => {
    const pool = (position === "Active Spot" ? [side.active] : position === "Bench" ? [...side.bench, ...(side.unplaced ?? [])] : allCards(side)).filter((card): card is ReplayCard => card?.name === name);
    const actor = pool.find((card) => card.definitionOwner)?.definitionOwner;
    const key = actor && replayCopyKey(currentAction, actor, currentLine, name, position, currentLineOrdinal);
    const reference = key && proof.copies?.relations.get(key);
    const bound = key && (proof.copies?.bindings.get(key) ?? proof.referenceSelections?.get(key) ?? (reference ? selectedCopies.get(reference) : undefined));
    return bound ? pool.find((card) => card.id === bound && !card.instanceUncertain) : undefined;
  };
  const recordSelectedCopy = (card: ReplayCard, name: string, position?: string) => {
    if (card.definitionOwner && !card.instanceUncertain) selectedCopies.set(replayCopyKey(currentAction, card.definitionOwner, currentLine, name, position, currentLineOrdinal), card.id);
    return card;
  };
  const findCard = (side: ReplaySide, name: string, position?: string) => recordSelectedCopy(boundCard(side, name, position) ?? findBoardCard(side, name, position, hp, undefined, sameHistory), name, position);
  const findAbilityCard = (side: ReplaySide, name: string, effect: string, context: ReplayState) => {
    const texts = hp.abilityTexts(name, effect, allCards(side).find((card) => card.name === name)?.definitionOwner);
    const activation = resolveReplayAbilityActivation(texts);
    const oncePerCopy = activation.once;
    if (activation.kind === "active_has_ability") {
      const actor = allCards(side).find((card) => card.name === name)?.definitionOwner;
      if (!actor || actions[currentAction].actor !== actor || actions[currentAction].turn <= 0
        || !activeAbilityPredicateSafe(context, actor, name, activation.ability) || !abilityLimitContextSafe(context, name, effect, actor)) {
        throw new BoardCardUnresolved("The Ability's named Active predicate is not established independently of the source copy.");
      }
    }
    if (activation.kind === "from_hand_evolution") {
      if (actions[currentAction].actor !== (allCards(side).find((card) => card.name === name)?.definitionOwner) || actions[currentAction].turn <= 0) throw new BoardCardUnresolved("The recorded Ability is outside its own-turn evolution trigger.");
      const eligible = allCards(side).filter((card) => {
        const entry = card.physicalCardId && handEvolutionEntries.get(card.physicalCardId);
        return card.name === name && entry && entry.name === name && entry.actor === card.definitionOwner && entry.section === currentSection
          && lastEvolution.get(card.id) === currentSection && (entry.event === currentAction - 1 || entry.event === currentAction && entry.ordinal + 1 === currentLineOrdinal)
          && (!oncePerCopy || !card.abilityUsed);
      });
      if (eligible.length !== 1) throw new BoardCardUnresolved("The Ability's from-hand evolution trigger does not identify one currently eligible top.");
      // Its freshly played physical top is known even when the old underlying
      // stack is unidentified. This never selects that old physical stack.
      return eligible[0];
    }
    if (activation.kind === "unmodelled" && texts?.some((text) => /^(?:Once during your turn, )?(?:if|when|whenever|while|as long as)\b/i.test(text)) && allCards(side).filter((card) => card.name === name).length > 1) throw new BoardCardUnresolved("The Ability activation predicate does not establish one eligible physical copy.");
    const energyTypes: Record<string, string> = { D: "Darkness", F: "Fighting", G: "Grass", L: "Lightning", M: "Metal", P: "Psychic", R: "Fire", W: "Water", Y: "Fairy", N: "Dragon", C: "Colorless" };
    const requirements = texts?.map((text) => /if this Pok[eé]mon has any \{([A-Z])\} Energy attached/i.exec(text)?.[1]);
    const required = requirements?.length && requirements.every((symbol) => symbol === requirements[0]) ? energyTypes[requirements[0] ?? ""] : undefined;
    const canHaveRequiredEnergy = (card: ReplayCard) => !required || card.instanceUncertain || openComponents(side, card) || card.energy.some((energy) => energy === required || energy === `Basic ${required} Energy`
      // Special Energy can supply several types; absence is conclusive only
      // for a complete stack of recorded basic Energy.
      || /Energy$/i.test(energy));
    const bound = boundCard(side, name);
    if (bound && (!oncePerCopy || !bound.abilityUsed) && canHaveRequiredEnergy(bound)) return recordSelectedCopy(bound, name);
    return recordSelectedCopy(findBoardCard(side, name, undefined, hp, (card) => (!oncePerCopy || !card.abilityUsed) && canHaveRequiredEnergy(card), sameHistory), name);
  };
  const printedAttackTargetsActive = (attacker: ReplayCard, effect: string) => {
    const evidence = hp.resolve({ ...attacker, observedEffects: [...(attacker.observedEffects ?? []), effect] });
    if (evidence?.coverage !== "complete" || !evidence.candidates.length) return false;
    return evidence.candidates.every((candidate) => {
      const attacks = candidate.attacks.filter((attack) => normalizeText(attack.name) === normalizeText(effect));
      if (attacks.length !== 1) return false;
      const attack = attacks[0];
      if (attack.damage === null || !/^\d+\+?$/.test(attack.damage) || attack.text === null) return false;
      // These complete clauses affect quantity or independent side effects,
      // never the ordinary defending target. Recorded damage is authoritative.
      const clauses: Array<{ pattern: RegExp; additive?: boolean }> = [
        { pattern: /^If this Pok[eé]mon moved from your Bench to (?:the )?Active Spot (?:this turn|during this turn), this attack does [1-9]\d* more damage\./i, additive: true },
        { pattern: /^Flip [1-9]\d* coins\. This attack does [1-9]\d* more damage for each heads\./i, additive: true },
        { pattern: /^Flip a coin until you get tails\. This attack does [1-9]\d* more damage for each heads\./i, additive: true },
        { pattern: /^This attack does [1-9]\d* more damage for each \{[DFGLMPRWYNC]\} Energy attached to (?:all of your Pok[eé]mon|this Pok[eé]mon)\./i, additive: true },
        { pattern: /^Flip a coin\. If tails, this attack does nothing\./i },
        { pattern: /^Put (?:a|[1-9]\d*) damage counters? on (?:1 of |each of )?your opponent['’]s (?:Benched )?Pok[eé]mon(?: in any way you like)?\./i },
        { pattern: /^During your opponent['’]s next turn, they can['’]t play any Item cards from their hand\./i },
        { pattern: /^(?:You may )?[Ss]earch your deck for a card and put it into your hand\. Then, shuffle your deck\./ },
        { pattern: /^Attach up to [1-9]\d* Basic \{[DFGLMPRWYNC]\} Energy cards from your discard pile to your Benched Pok[eé]mon in any way you like\./i },
        { pattern: /^During your next turn, this Pok[eé]mon can't attack\./i },
        { pattern: /^During your next turn, this Pok[eé]mon can't use ([^.]+)\./i },
        { pattern: /^Switch this Pok[eé]mon with 1 of your Benched Pok[eé]mon\./i },
      ];
      let remaining = attack.text.normalize("NFC").replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
      let additive = 0;
      while (remaining) {
        const understood = clauses.find(({ pattern }) => pattern.test(remaining));
        if (!understood) return false;
        const clause = understood.pattern.exec(remaining)!;
        if (clause[1] && normalizeText(clause[1]) !== normalizeText(effect)) return false;
        if (understood.additive) additive++;
        remaining = remaining.slice(clause[0].length).trim();
      }
      return additive === (attack.damage.endsWith("+") ? 1 : 0);
    });
  };
  const sourceAttackTargetsActive = (attacker: ReplayCard, effect: string, state: ReplayState) => {
    const route = attackPrintingEvidence(attacker, effect, state);
    const definition = route.status === "copied" ? route.definitionCard : attacker;
    const evidence = hp.resolve({ ...definition, observedEffects: [...(definition.observedEffects ?? []), effect] });
    // Source damage defaults to the defending Active (§6). A known printed
    // choice/Bench selector overrides that default; missing prose proves no
    // effect or printing, but does not erase the source's ordinary target.
    const possible = [...(evidence?.candidates ?? []), ...(evidence?.unverifiedCandidates ?? [])];
    return !possible.some((card) => card.attacks.some((attack) => {
      if (normalizeText(attack.name) !== normalizeText(effect) || attack.text === null) return false;
      // An explicitly additional Bench receipt does not redirect the base
      // attack. Remove only that clause before checking every other selector,
      // including those after a cost, conjunction or conditional prefix. A
      // secondary clause cannot consume another explicit attack clause.
      const primary = attack.text.replace(/\bthis attack also does (?:(?!\bthis attack\b)[^.])*?\bdamage\b(?:(?!\bthis attack\b)[^.])*?\bto (?:(?!\bthis attack\b)[^.])*?Pok[eé]mon(?: that (?:(?!\bthis attack\b)[^.])*?)?\./gi, "");
      return /\bdamage\b[^.]*?\bto (?:(?:[1-9]\d*|one|any|both|each(?: of (?:[1-9]\d*|one|any))?)(?: of)? your opponent['’]s (?:Benched )?Pok[eé]mon|your opponent['’]s Benched Pok[eé]mon)|\bchoose\b[^.]*?your opponent['’]s (?:Benched )?Pok[eé]mon(?!['’]s attacks)/i.test(primary);
    }));
  };
  const ordinaryAttackTargetsActive = (attacker: ReplayCard, effect: string, state: ReplayState) => {
    const route = attackPrintingEvidence(attacker, effect, state);
    if (route.status === "unmodelled") return false;
    return printedAttackTargetsActive(route.status === "copied" ? route.definitionCard : attacker, effect);
  };
  const initial: ReplayState = { self: emptySide(input.selfDeckName), opponent: emptySide(input.opponentDeckName), stadium: null, playedCard: null };
  const program: ReplayProgram = {
    id: input.id, label: `${input.selfDeckName} vs ${input.opponentDeckName}`,
    source: { logId: input.id, playedOn: input.date, result: input.result, format: input.format,
      selfDeck: input.selfDeckName, opponentDeck: input.opponentDeckName,
      selfPrizesTaken: input.selfPrizesTaken, opponentPrizesTaken: input.opponentPrizesTaken, turns: input.totalTurns },
    events: [], frames: [initial], status: "unsupported",
    diagnostics: { evidencedActions: 0, unresolvedMutations: 0, unresolvedActions: [], messages: [] },
  };
  const sections = decodeLogSections(input.sections);
  if (!sections?.length || !input.selfPlayerName?.trim() || !input.opponentPlayerName?.trim()
    || input.selfPlayerName === input.opponentPlayerName) {
    program.diagnostics.messages.push("This saved Battle Log has no usable player identities or action sections.");
    return program;
  }
  const actionCount = sections.reduce((total, section) => total + section.actions.length, 0);
  // Bound work before allocating a frame per action. Never silently truncate a saved log.
  if (actionCount > 600 || JSON.stringify(sections).length > 120_000) {
    program.diagnostics.messages.push("This Battle Log exceeds the beta replay limit. Its original source is still available in Battle Logs.");
    return program;
  }
  const actorFor = (name: string): ReplayActor => {
    if (name === input.selfPlayerName) return "self";
    if (name === input.opponentPlayerName) return "opponent";
    throw new Unresolved("The affected player is not identified in the saved Battle Log.");
  };
  const actions = flattenReplaySourceActions(sections, input.selfPlayerName);
  let futureConsumers = new Set<string>(); let consumerSection = -1;
  for (let index = actions.length - 1; index >= 0; index--) {
    const action = actions[index];
    if (action.sourceSectionIndex !== consumerSection) { futureConsumers = new Set(); consumerSection = action.sourceSectionIndex; }
    for (const raw of [action.sourceTitle, ...action.details]) {
      const line = clean(raw);
      const evolution = /^.+? evolved (.+?) to .+$/i.exec(line);
      const use = /^.+?['’]s (.+?) used .+$/i.exec(line);
      const placement = /^.+? played (.+?) to (?:the )?(?:Active Spot|Bench)$/i.exec(line);
      if (evolution || use || placement) futureConsumers.add(normalizeText((evolution ?? use ?? placement)![1]));
      // An unsupported evolution/history operation has no safe name scope.
      else if (/\b(?:evolv(?:e|ed|es|ing)|evolution|devolv\w*|re-?enter\w*)\b/i.test(line)) futureConsumers.add("*");
    }
    futureHistoryConsumers[index] = new Set(futureConsumers);
  }
  const recordedKnockoutBindings = new Map<number, string>();
  let counterEliminations: Array<{ actionIndex: number; actor: ReplayActor; name: string; ids: string[]; batchSafe: boolean }> = [];
  const setup = sections[0];
  const implicitMulligans = new Set(setup.actions.filter((action, index) => {
    const match = /^(.+?) took (?:a |an |\d+ )?mulligans?$/i.exec(clean(action.title));
    if (!match || !action.details.some((line) => /^Cards revealed from Mulligan\s*\d+:?$/i.test(clean(line)))) return false;
    const nextOpeningOrPlacement = setup.actions.slice(index + 1).find((following) => clean(following.title).startsWith(`${match[1]} drew `) && / for the opening hand$/.test(clean(following.title)) || clean(following.title).startsWith(`${match[1]} played `) && / to (?:the )?(?:Active Spot|Bench)$/.test(clean(following.title)));
    return Boolean(nextOpeningOrPlacement && !/ for the opening hand$/.test(clean(nextOpeningOrPlacement.title)));
  }).map((action) => clean(action.title)));
  const setupLines = setup.actions.flatMap((action) => [action.title, ...action.details]).map(clean);
  const completeSetup = setup.player === "" && [input.selfPlayerName, input.opponentPlayerName].every((name) => {
    // The normal 60-card game boundary requires both opening hands, Active
    // placements and six setup Prizes. A partial log cannot supply that baseline.
    let opening = false;
    let needsRedraw = false;
    let placedCard = false;
    let activePlaced = false;
    for (const line of setupLines) {
      if (line.startsWith(`${name} drew `) && line.endsWith(" for the opening hand")) {
        if (line !== `${name} drew 7 cards for the opening hand` || opening && !needsRedraw) return false;
        opening = true; needsRedraw = false;
      } else if (line.startsWith(`${name} took `) && /mulligans?$/i.test(line)) {
        if (!opening || needsRedraw || placedCard) return false;
        needsRedraw = !implicitMulligans.has(line);
      } else if (line.startsWith(`${name} played `) && / to (?:the )?(?:Active Spot|Bench)$/.test(line)) {
        if (!opening || needsRedraw) return false;
        if (/ to (?:the )?Active Spot$/.test(line)) {
          if (activePlaced) return false;
          activePlaced = true;
        }
        placedCard = true;
      }
    }
    return opening && !needsRedraw && activePlaced && setup.prizesAfterTurn[name] === 6;
  });
  if (completeSetup) for (const actor of ["self", "opponent"] as const) {
    Object.assign(initial[actor], { deckCount: 60, handCount: 0, inPlayCount: 0, discardCount: 0, discardIdentitiesKnown: true, prizesRemaining: 0 });
  }
  const sectionEnds = new Map<number, (typeof sections)[number]>();
  let offset = 0;
  for (const section of sections) { offset += section.actions.length; sectionEnds.set(offset - 1, section); }
  // Internal history is keyed by physical stack, not its evolving top name.
  let understoodMutations = 0;
  let previousSectionIndex = -1;
  actions.forEach((action, actionIndex) => {
    currentAction = actionIndex;
    currentSection = action.sourceSectionIndex;
    if (currentSection !== previousSectionIndex) attackRouteHistory.length = 0;
    for (const actor of ["self", "opponent"] as const) {
      const pending = pendingPrizeAnnotations[actor]; const player = actor === "self" ? input.selfPlayerName : input.opponentPlayerName;
      if (pending && (pending.section !== currentSection || clean(action.sourceTitle).startsWith(`${player} `) && /^(?:drew|played|attached|evolved|discarded|shuffled|moved)\b/i.test(clean(action.sourceTitle).slice(player.length + 1)))) pendingPrizeAnnotations[actor] = null;
    }
    const previous = program.frames.at(-1)!;
    let next = structuredClone(previous);
    const expireHandEvolutionEntries = () => {
      for (const [physicalId, entry] of handEvolutionEntries) if (entry.section !== currentSection || !allCards(next[entry.actor]).some((card) => card.physicalCardId === physicalId && card.name === entry.name)) handEvolutionEntries.delete(physicalId);
    };
    expireHandEvolutionEntries();
    next.playedCard = null;
    const stages: ReplayTransactionStage[] = [];
    const copiedAttackContexts = new Map<string, ReplayZoneCard>();
    const attackContextKey = (actor: ReplayActor | undefined, card: ReplayZoneCard, effect: string) => JSON.stringify([actor, card.id, card.name, effect]);
    let label = "Action";
    let mutationCount = 0;
    let cardCounter = 0;
    let physicalCounter = 0;
    let prizeAction = false;
    let prizeCardsAdded = 0;
    let prizeAmount = 0;
    let bonusDraw: { actor: ReplayActor; amount: number; annotated: number; numericAnnotated?: boolean } | null = null;
    let attackDamage: number | null = null;
    let retreating: ReplayCard | null = null;
    let knockedOut: ReplayCard | null = null;
    let aggregateKnockout: { actor: ReplayActor; name: string; belowTop: number | null; reportedBelowTop: number; memberIds?: string[]; evidencedNames?: string[] } | null = null;
    const recordedAttacks = [action.sourceTitle, ...action.details].map(clean).map((line, index) => ({ index: index - 1, match: /^(.+?)['’]s (.+?) used (.+?) on (.+?)['’]s (.+?) for (\d+)\+? damage/.exec(line) })).filter((entry) => entry.match);
    const breakdownDamage = (index: number) => (recordedAttacks.findLast((entry) => entry.index < index) ?? recordedAttacks.find((entry) => entry.index > index))?.match?.[6];
    let expectedBreakdownDamage: number | null = null;
    let boardShuffleActivation: { actor: ReplayActor; cardId: string; name: string; effect: string; drawAmount: number } | null = null;
    let healed: { actor: ReplayActor; id: string } | null = null;
    let devolutionActor: ReplayActor | null = null;
    let devolutionReturned: string[] = [];
    const consumed = new Set<number>();
    const errors: string[] = [];
    const discardedThisAction: Array<{ actor: ReplayActor; name: string }> = [];
    const changedCountZones = { self: new Set<CountZone>(), opponent: new Set<CountZone>() };
    const damageApplied = new Map<string, number>();
    let damageBreakdown = false;
    let lastPromotionActor: ReplayActor | null = null;
    const effectTag = (raw: string) => {
      const recorded = input.effectTags?.[raw] ?? input.effectTags?.[clean(raw)] ?? input.effectTags?.[`${clean(raw)}.`];
      if (recorded) return recorded;
      const played = /^(.+?) played (.+)$/i.exec(clean(raw));
      if (!played || ![input.selfPlayerName, input.opponentPlayerName].includes(played[1])) return undefined;
      const evidence = hp.resolve({ name: played[2], definitionOwner: actorFor(played[1]) });
      const kinds = evidence?.candidates.map((card) => card.category === "Trainer" ? card.trainerType?.toLowerCase() : undefined);
      const kind = kinds?.[0];
      return evidence?.coverage === "complete" && kinds?.length && kind && kinds.every((value) => value === kind)
        && ["item", "supporter", "tool", "stadium"].includes(kind) ? kind as ReplayEffectKind : undefined;
    };
    const effectOrigin = (raw: string, detailIndex: number) => {
      const recorded = (detailIndex >= 0 ? input.effectDetailOrigins?.[`${actionIndex}:${detailIndex}`] : undefined)
        ?? input.effectOrigins?.[raw] ?? input.effectOrigins?.[clean(raw)] ?? input.effectOrigins?.[`${clean(raw)}.`] ?? input.effectOrigins?.[action.sourceTitle];
      if (recorded || detailIndex < 0) return recorded;
      const context = effectContext();
      const movement = context ? hp.effectConstraints(context.card, context.name, context.kind, "move_energy") : null;
      if (movement?.status === "known" && movement.operation === "move_energy" && context) {
        const attachments = action.details.map(clean).map((line) => /^(.+?) attached (Basic .+ Energy) to (.+?) (?:in|on) the (Active Spot|Bench)$/.exec(line)).filter((match) => match !== null);
        if (attachments.length !== movement.quantity.value || attachments.some((match) => actorFor(match[1]) !== context.actor)) throw new CountConflict("The Basic Energy movement details conflict with the verified board-to-board quantity.", ["board"]);
        if (attachments.some((match) => match[0] === clean(raw))) return "board";
      }
      const plan = context ? hp.effectConstraints(context.card, context.name, context.kind, "attach_energy") : null;
      if (plan?.status !== "known" || plan.operation !== "attach_energy" || !context) return undefined;
      const attachments = action.details.map(clean).map((line) => /^(.+?) attached (.+?) to (.+?) (?:in|on) the (Active Spot|Bench)$/.exec(line)).filter((match) => match !== null);
      if (!attachments.some((match) => clean(raw) === match[0])) return undefined;
      if (plan.quantity.value !== undefined && (attachments.length > plan.quantity.value || plan.quantity.kind === "exact" && attachments.length !== plan.quantity.value)
        || attachments.some((match) => actorFor(match[1]) !== context.actor || match[2] !== `Basic ${plan.basicEnergyType} Energy`
          || plan.target.namePrefix && !normalizeText(match[3]).startsWith(normalizeText(plan.target.namePrefix)))) throw new Unresolved("The recorded attachments conflict with the verified Energy-search constraint.");
      return plan.origin;
    };
    const markUncertain = (actor: ReplayActor, zones: NonNullable<ReplaySide["uncertainZones"]>, countsUnknown = true) => {
      const side = next[actor];
      side.uncertainZones = [...new Set([...(side.uncertainZones ?? []), ...zones])];
      if (zones.includes("hand")) { if (countsUnknown) side.handCount = null; side.knownHand = []; }
      if (countsUnknown && zones.includes("deck")) side.deckCount = null;
      if (countsUnknown && zones.includes("prizes")) side.prizesRemaining = null;
      if (zones.includes("board")) side.hpModifiersKnown = false;
      if (countsUnknown && zones.includes("board")) side.inPlayCount = null;
      if (countsUnknown && zones.includes("discard")) { side.discardCount = null; side.discardIdentitiesKnown = false; }
    };
    const clearUncertain = (actor: ReplayActor, zone: NonNullable<ReplaySide["uncertainZones"]>[number]) => {
      if (next[actor].uncertainZones) next[actor].uncertainZones = next[actor].uncertainZones!.filter((item) => item !== zone);
    };
    // Hand/deck/Prize arithmetic already belongs to the recorded grammar below.
    // Track the remaining physical-card boundaries independently of identity lists.
    const transferCounts = (actor: ReplayActor, origin: CountZone, destination: CountZone, amount: number) => {
      const zones = [...new Set([origin, destination])];
      for (const zone of zones) changedCountZones[actor].add(zone);
      if (origin === destination) return;
      for (const [zone, delta] of [[origin, -amount], [destination, amount]] as const) {
        if (zone === "board") next[actor].inPlayCount = changeCount(next[actor].inPlayCount ?? null, delta, zones);
        if (zone === "discard") next[actor].discardCount = changeCount(next[actor].discardCount ?? null, delta, zones);
      }
    };
    const addDiscard = (actor: ReplayActor, cards: ReplayZoneCard[], origin: CountZone = "hand", amount = cards.length) => {
      transferCounts(actor, origin, "discard", amount);
      next[actor].discard.unshift(...cards);
      discardedThisAction.push(...cards.map((card) => ({ actor, name: card.name })));
    };
    const takeDiscard = (actor: ReplayActor, names: string[], complete = next[actor].discardIdentitiesKnown === true || next[actor].discardIdentitiesKnown === undefined && next[actor].discardCount === next[actor].discard.length) => {
      const side = next[actor];
      const missing = names.some((name) => names.filter((value) => value === name).length > side.discard.filter((card) => card.name === name).length);
      const evidence = removeKnownZone(side.discard, names, complete);
      if (missing) { side.discardIdentitiesKnown = false; markUncertain(actor, ["discard"], false); next.partial = true; }
      return evidence;
    };
    const ownerAndName = (value: string, fallback?: ReplayActor): { actor: ReplayActor; name: string } => {
      for (const [player, actor] of [[input.selfPlayerName, "self"], [input.opponentPlayerName, "opponent"]] as const) {
        for (const apostrophe of ["'", "’"]) if (value.startsWith(`${player}${apostrophe}s `)) return { actor, name: value.slice(player.length + 3) };
      }
      if (fallback) return { actor: fallback, name: value };
      const owners = (["self", "opponent"] as const).filter((actor) => allCards(next[actor]).some((card) => card.name === value));
      if (owners.length === 1) return { actor: owners[0], name: value };
      throw new Unresolved("The affected Pokémon's owner is not identified.");
    };
    const id = () => `action-${actionIndex}-card-${cardCounter++}`;
    // Physical creation cannot depend on how many presentation pool objects a
    // previous ambiguous branch happened to allocate in this source action.
    const physicalId = () => `action-${actionIndex}-physical-${physicalCounter++}`;
    const stage = (kind: ReplayTransactionStage["kind"], title: string, cards: ReplayZoneCard[], actor?: ReplayActor, hiddenCount?: number) => {
      if (kind === "bench") cards.forEach((card) => {
        if (!enteredPlay.has(card.id)) enteredPlay.set(card.id, action.sourceSectionIndex);
        if (actor && next[actor].bench.some((candidate) => candidate.id === card.id) && next.stadium && action.turn > 0 && action.actor === actor) {
          const source = { name: next.stadium.name, definitionOwner: next.stadium.actor };
          const plan = hp.effectConstraints(source, undefined, "stadium", "put_counters");
          if (plan.status === "known" && plan.operation === "put_counters" && plan.trigger) pendingBenchTriggers.push({ actor, cardId: card.id, section: action.sourceSectionIndex, stadium: next.stadium.name });
        }
      });
      if (kind === "evolve" && actor && cards.some((card) => next[actor].active === card)) {
        next[actor].active!.activeEpisodeId = `active:${actor}:${actionIndex}:${currentLineOrdinal}:top`;
        delete next[actor].active!.activePrintingEffects;
      }
      if (proof.printing && actor) cards.forEach((card) => {
        if (!card.definitionOwner) card.definitionOwner = actor;
        hp.applyPrintingProofToCard(card, actor, kind === "before" ? actionIndex : actionIndex + 1, proof.printing!);
      });
      if (proof.printing) hp.applyPrintingProofs(next, kind === "before" ? actionIndex : actionIndex + 1, proof.printing);
      hp.update(next);
      const snapshots = structuredClone(cards);
      hp.copySnapshotHpProvenance(cards, snapshots);
      stages.push({ kind, label: title, cards: snapshots, ...(actor ? { actor } : {}), ...(hiddenCount ? { hiddenCount } : {}) });
    };
    const weaknessTargetsActive = (state: ReplayState, attacker: ReplayCard, effect: string) => {
      const attackEvidence = hp.resolve({ ...attacker, observedEffects: [...(attacker.observedEffects ?? []), effect] });
      if (attackEvidence?.coverage !== "complete" || !attackEvidence.candidates.length
        || attackEvidence.candidates.some((printing) => {
          const attacks = printing.attacks.filter((attack) => normalizeText(attack.name) === normalizeText(effect));
          return attacks.length !== 1 || attacks[0].text === null;
        })) return false;
      const sources: Array<ReplayZoneCard & { executedEffect?: string }> = [];
      const withoutBenchReminder = (text: string) => text.replace(/\(?Don['’]t apply Weakness and Resistance for Benched Pok[eé]mon\.\)?/gi, "")
        .replace(/\(?\b(?:before|after) applying Weakness and Resistance\)?/gi, "");
      const persistentWeakness = (source: ReplayZoneCard & { executedEffect?: string }) => hp.resolve(source)?.candidates.some((printing) => {
        const texts = source.executedEffect
          ? [...printing.attacks, ...printing.abilities].filter((entry) => normalizeText(entry.name) === normalizeText(source.executedEffect!)).map((entry) => entry.text)
          : printing.rules ?? [];
        return texts.some((text) => text !== null && /Weakness/i.test(withoutBenchReminder(text)) && /Bench/i.test(withoutBenchReminder(text))
          && /\b(?:until|during|for the rest of|as long as)\b/i.test(text));
      });
      sources.push({ ...attacker, observedEffects: [...(attacker.observedEffects ?? []), effect], executedEffect: effect });
      for (const owner of ["self", "opponent"] as const) {
        for (const card of allCards(state[owner])) {
          sources.push({ ...card, definitionOwner: owner });
          for (const name of [...(card.tool ? [card.tool] : []), ...card.energy.filter((energy) => /Energy$/i.test(energy) && !/^Basic /i.test(energy))]) sources.push({ ...zoneCard("", name), definitionOwner: owner });
        }
        for (const pool of state[owner].boardPools ?? []) if (pool.memberIds.length) sources.push(...[...pool.cards, ...(pool.uncertainCards ?? []).flatMap((group) => group.cards)]
          .filter((card) => card.boardRole !== "evolution" && !/^Basic .+ Energy$/i.test(card.name)).map((card) => ({ ...card, definitionOwner: owner })));
      }
      if (state.stadium) sources.push({ ...zoneCard("", state.stadium.name), definitionOwner: state.stadium.actor });
      for (const previousEvent of program.events) {
        const played = /^(.+?) played (.+)$/.exec(clean(previousEvent.sourceTitle));
        if (played && [input.selfPlayerName, input.opponentPlayerName].includes(played[1]) && !/ to (?:the )?(?:Active Spot|Bench|Stadium spot)$/.test(played[2])) {
          const source = { ...zoneCard("", played[2]), definitionOwner: actorFor(played[1]) };
          if (persistentWeakness(source)) sources.push(source);
        }
        const used = /^(.+?)['’]s (.+?) used (?:its Ability:\s*)?(.+?)(?: on .+)?$/.exec(clean(previousEvent.sourceTitle));
        if (used && [input.selfPlayerName, input.opponentPlayerName].includes(used[1])) {
          const source = { ...zoneCard("", used[2]), definitionOwner: actorFor(used[1]), observedEffects: [used[3]], executedEffect: used[3] };
          if (persistentWeakness(source)) sources.push(source);
        }
      }
      // Ordinary rules apply Weakness only to Active damage. A recorded suffix
      // cannot establish that position when a live or verified lasting effect
      // could change Bench Weakness. Missing prose on a past discarded Item
      // does not itself establish a lasting effect on the current board.
      return sources.every((source) => {
        const found = hp.resolve(source);
        return found?.coverage === "complete" && found.candidates.length > 0 && found.candidates.every((printing) => {
          const executed = source.executedEffect ? [...printing.attacks, ...printing.abilities].filter((entry) => normalizeText(entry.name) === normalizeText(source.executedEffect!)) : [];
          if ((printing.category !== "Pokemon" && printing.rules === null) || printing.abilities.some((ability) => ability.text === null)
            || source.executedEffect && (executed.length !== 1 || executed[0].text === null)) return false;
          const texts = [...(printing.rules ?? []), ...printing.abilities.map((ability) => ability.text ?? ""), ...executed.map((entry) => entry.text ?? "")];
          // This exact negative reminder restates the ordinary rule; it is not
          // an override permitting Weakness on the Bench. Unused attacks have
          // no passive effect and cannot change the current damage domain.
          return texts.every((text) => {
            const effects = withoutBenchReminder(text);
            return !(/Weakness/i.test(effects) && /Bench/i.test(effects))
              && (!source.executedEffect || !/choose 1 of .+? attacks? and use it as this attack|use .+? attack as this attack/i.test(effects));
          });
        });
      });
    };
    const cardList = (index: number) => {
      let nextIndex = index + 1;
      if (/^\d+ (?:drawn |discarded )?cards?:?$/i.test(clean(action.details[nextIndex] ?? ""))) { consumed.add(nextIndex); nextIndex++; }
      const raw = action.details[nextIndex];
      if (!raw) return [];
      const rawContent = raw.trim().replace(/^[-•]\s*/, "");
      const value = clean(raw);
      // Player-led sentences are operations regardless of their verb. Inspect
      // the original punctuation before clean() removes a sentence terminator;
      // an unbulleted sentence must never become a made-up card identity.
      const playerLed = [input.selfPlayerName, input.opponentPlayerName].some((player) =>
        [" ", "'s ", "’s "].some((separator) => rawContent.startsWith(`${player}${separator}`)));
      if (!value || /^Cards revealed from Mulligan/i.test(value) || playerLed || !/^[-•]\s*/.test(raw.trim()) && /[.!?]$/.test(rawContent)
        || /\b(?:was|were|is now|is no longer)\b/i.test(value)
        || /^(?:Damage breakdown|Total damage|Base damage):/i.test(value)
        || /^[^:]+:\s*[+−-]?\d/.test(value)) return [];
      consumed.add(nextIndex);
      return value.split(",").map((name) => name.trim()).filter(Boolean);
    };
    const draw = (actor: ReplayActor, amount: number, names: string[], opening = false) => {
      if (!Number.isSafeInteger(amount) || amount < 1 || amount > 60 || names.length > amount) throw new Unresolved("The recorded draw count does not match its card list.");
      const side = next[actor];
      if (opening) { side.handCount = amount; side.knownHand = []; clearUncertain(actor, "hand"); }
      else side.handCount = changeCount(side.handCount, amount);
      side.deckCount = changeCount(side.deckCount, -amount);
      transferCounts(actor, "deck", "hand", amount);
      const cards = names.map((name) => zoneCard(id(), name));
      side.knownHand.push(...cards);
      stage("draw", opening ? "Opening hand" : "Draw", cards, actor, amount - cards.length);
    };
    const addBoardPool = (actor: ReplayActor, members: ReplayCard[], cards: ReplayZoneCard[], memberEvidence: ReplayZoneCard[] = []) => {
      const ids = new Set(members.map((card) => card.id));
      const side = next[actor];
      if (!cards.length && !memberEvidence.length) return;
      side.boardPools ??= [];
      if (cards.length && ids.size > 1) members.forEach((card) => { delete card.knownStackSize; });
      side.boardPools.push({ id: id(), memberIds: [...ids], cards: [...new Map(cards.map((card) => [card.id, card])).values()],
        ...(memberEvidence.length ? { memberEvidence: [...new Map(memberEvidence.map((card) => [JSON.stringify([card.id, card.name, card.setId, card.localId, card.observedEffects]), card])).values()] } : {}) });
    };
    const takePooledCards = (actor: ReplayActor, memberIds: string[], names: string[], destination?: "deck" | "discard" | "hand") => {
      const moved: ReplayZoneCard[] = [];
      for (const name of names) {
        const eligible = (next[actor].boardPools ?? []).filter((pool) => pool.memberIds.some((id) => memberIds.includes(id)));
        const alternatives = eligible.flatMap((pool) => [...pool.cards, ...(pool.possiblyReturnedCards ?? []), ...(pool.uncertainCards ?? []).flatMap((group) => group.cards)]).filter((card) => card.name === name);
        if (destination && alternatives.length > 1) for (const pool of eligible) {
          for (const group of pool.uncertainCards ?? []) if (group.cards.some((card) => card.name === name)) group.destinations = [...new Set([...group.destinations, destination])];
          if (destination !== "hand" && pool.possiblyReturnedCards?.some((card) => card.name === name)) pool.possibleReturnedDestinations = [...new Set([...(pool.possibleReturnedDestinations ?? []), destination])];
        }
        const previousLength = moved.length;
        const matches = eligible.filter((pool) => pool.cards.some((card) => card.name === name));
        const pool = matches.find((pool) => pool.memberIds.length === 1) ?? matches[0];
        if (pool) moved.push(...pool.cards.splice(pool.cards.findIndex((card) => card.name === name), 1));
        else {
          const conditional = next[actor].boardPools?.filter((pool) => pool.memberIds.some((id) => memberIds.includes(id)))
            .flatMap((pool) => pool.uncertainCards ?? []).find((group) => group.cards.some((card) => card.name === name));
          if (conditional) moved.push(...conditional.cards.splice(conditional.cards.findIndex((card) => card.name === name), 1));
          else {
            const returned = next[actor].boardPools?.find((pool) => pool.memberIds.some((id) => memberIds.includes(id)) && pool.possiblyReturnedCards?.some((card) => card.name === name));
            if (returned) moved.push(...returned.possiblyReturnedCards!.splice(returned.possiblyReturnedCards!.findIndex((card) => card.name === name), 1));
          }
        }
        const representative = moved[previousLength];
        if (representative && matches.length > 1) {
          // The source names the departing component, not which same-name
          // physical object it was. Preserve every surviving object's possible
          // carriers instead of treating our removed representative as proof.
          const carrierIds = [...new Set(matches.flatMap((pool) => pool.memberIds))];
          const remaining = matches.flatMap((pool) => {
            const cards = pool.cards.filter((card) => card.name === name);
            pool.cards = pool.cards.filter((card) => card.name !== name);
            return cards;
          });
          if (remaining.length) {
            next[actor].boardPools!.push({ id: id(), memberIds: carrierIds, cards: remaining,
              memberEvidence: [...new Map(matches.flatMap((pool) => pool.memberEvidence ?? []).map((card) => [JSON.stringify(card), card])).values()] });
            if (carrierIds.length > 1) allCards(next[actor]).filter((card) => carrierIds.includes(card.id)).forEach((card) => { delete card.knownStackSize; });
          }
        }
        if (destination && representative && alternatives.length > 1) {
          if (!alternatives.every((card) => card.setId === alternatives[0].setId && card.localId === alternatives[0].localId)) { delete representative.setId; delete representative.localId; representative.imageUrl = ""; }
          representative.observedEffects = (alternatives[0].observedEffects ?? []).filter((effect) => alternatives.every((card) => card.observedEffects?.includes(effect)));
          delete representative.definitionKey;
        }
      }
      return moved;
    };
    const recordedZoneCards = (names: string[], available: ReplayZoneCard[] = []) => names.map((name) => {
      const index = available.findIndex((card) => card.name === name);
      return index >= 0 ? available.splice(index, 1)[0] : zoneCard(id(), name);
    });
    const takeSoleMemberCards = (actor: ReplayActor, memberId: string) => (next[actor].boardPools ?? [])
      .filter((pool) => pool.memberIds.length === 1 && pool.memberIds[0] === memberId).flatMap((pool) => pool.cards.splice(0));
    const refreshBoardPools = (actor: ReplayActor, destination: "deck" | "discard" | "hand" = "discard", pooledDepartureResolved = false, quantityKnown = false) => {
      const ids = new Set(allCards(next[actor]).map((card) => card.id));
      for (const pool of next[actor].boardPools ?? []) {
        const departed = pool.memberIds.some((id) => !ids.has(id));
        if (departed && pool.cards.length && !pooledDepartureResolved) {
          // An unknown departing allocation cannot certify every component as
          // still attached to the survivors. Preserve the original inventory
          // with its newly conditional location instead.
          pool.uncertainCards ??= [];
          pool.uncertainCards.push({ cards: pool.cards.splice(0), destinations: [destination] });
        }
        if (departed && !pooledDepartureResolved && pool.uncertainCards?.some((group) => group.cards.length)) {
          const modifiers = next[actor].hpModifiersKnown;
          markUncertain(actor, ["board", destination], !quantityKnown); next[actor].hpModifiersKnown = modifiers;
          for (const group of pool.uncertainCards) if (group.cards.length) group.destinations = [...new Set([...group.destinations, destination])];
          next.partial = true; errors.push("A pooled component's departing assignment has multiple source-compatible locations.");
        }
        if (departed && !pooledDepartureResolved && pool.possiblyReturnedCards?.length && destination !== "hand") {
          const locations = new Set(pool.possibleReturnedDestinations ?? []);
          if (!locations.has(destination)) {
            locations.add(destination); markUncertain(actor, [destination], !quantityKnown);
            next.partial = true; errors.push("A conditional Evolution card may have followed a departed Pokémon to another zone.");
          }
          pool.possibleReturnedDestinations = [...locations];
        }
        pool.memberIds = pool.memberIds.filter((id) => ids.has(id));
        if (!pool.memberIds.length && pool.possiblyReturnedCards?.length && !pool.possibleReturnedDestinations?.length) {
          next[actor].knownHand.push(...pool.possiblyReturnedCards); delete pool.possiblyReturnedCards;
        }
      }
      for (const pool of next[actor].boardPools ?? []) if (!pool.memberIds.length) {
        // Normal departures consume these components in their originating
        // transfer. An unsupported orphan must not retain false known totals.
        if (pool.cards.length) {
          const modifiers = next[actor].hpModifiersKnown;
          markUncertain(actor, ["board", destination]); next[actor].hpModifiersKnown = modifiers;
          next.partial = true; errors.push("A pooled component's departure was not included in its originating physical transfer.");
          if (destination === "discard") next[actor].discard.push(...pool.cards);
          else if (destination === "hand") next[actor].knownHand.push(...pool.cards);
          stage(destination === "deck" ? "shuffle" : destination === "hand" ? "return" : "discard", "Unresolved pooled departure", pool.cards, actor);
        }
        pool.cards = [];
        if (pool.uncertainCards) {
          const resolved = pool.uncertainCards.filter((group) => group.destinations.length === 1);
          for (const group of resolved) {
            if (group.destinations[0] === "discard") next[actor].discard.push(...group.cards);
            else if (group.destinations[0] === "hand") next[actor].knownHand.push(...group.cards);
            stage(group.destinations[0] === "deck" ? "shuffle" : group.destinations[0] === "hand" ? "return" : "discard", "Resolved pooled location", group.cards, actor);
          }
          pool.uncertainCards = pool.uncertainCards.filter((group) => group.destinations.length > 1 && group.cards.length);
        }
      }
      next[actor].boardPools = (next[actor].boardPools ?? []).filter((pool) => pool.memberIds.length && (pool.cards.length || pool.possiblyReturnedCards?.length || pool.memberEvidence?.length || pool.uncertainCards?.some((group) => group.cards.length)) || Boolean(pool.possiblyReturnedCards?.length || pool.uncertainCards?.some((group) => group.cards.length)));
      const side = next[actor]; const pools = side.boardPools ?? [];
      const represented = allCards(side).reduce((sum, card) => sum + physicalCardCount(card), 0) + pools.reduce((sum, pool) => sum + pool.cards.length, 0) + Number(next.stadium?.actor === actor);
      if (side.inPlayCount !== null && side.inPlayCount === represented) for (const card of allCards(side)) {
        const possible = pools.filter((pool) => pool.memberIds.includes(card.id) && pool.cards.length);
        if (card.instanceUncertain && possible.every((pool) => pool.memberIds.length === 1)) card.knownStackSize = physicalCardCount(card) + possible.reduce((sum, pool) => sum + pool.cards.length, 0);
      }
    };
    const uncertainCopy = (card: ReplayCard) => {
      card.instanceUncertain = true; card.damageKnown = false; card.energy = []; card.underlying = []; delete card.tool;
      card.conditions = []; delete card.abilityUsed;
    };
    const uncertainCopies = (actor: ReplayActor, cards: ReplayCard[], preserveSharedUsage = false) => {
      const memberIds = cards.map((card) => card.id);
      for (const retained of retainedTops.values()) if (retained.actor === actor && retained.memberIds.some((id) => memberIds.includes(id))) {
        retained.memberIds = [...new Set([...retained.memberIds, ...memberIds])];
      }
      for (const card of cards) if (card.physicalCardId && !card.instanceUncertain) {
        retainedTops.set(card.physicalCardId, { actor, memberIds: [...memberIds], top: topCardEvidence(card.id, card),
          components: openComponents(next[actor], card) ? undefined : [...card.underlying.map((layer) => layer.name),
            ...card.energy.map((energy) => /Energy$/i.test(energy) ? energy : `Basic ${energy} Energy`), ...(card.tool ? [card.tool] : [])].sort() });
      }
      const common = cards[0] && structuredClone(cards[0]);
      const same = (value: (card: ReplayCard) => unknown) => cards.every((card) => JSON.stringify(value(card)) === JSON.stringify(value(common)));
      const size = common && cards.map((card) => exactStackSize(next[actor], card));
      const sharedSize = size?.every((value) => value !== null && value === size[0]) ? size[0] ?? undefined : undefined;
      const sharedDamage = common && cards.every((card) => card.damageKnown !== false && card.damage === common.damage);
      // Every carrier already used an Ability this turn. A permutation cannot
      // erase that shared fact; mixed/unused markers remain unidentified.
      const sharedUsed = preserveSharedUsage && cards.length > 0 && cards.every((card) => card.abilityUsed === true);
      const sharedEnergy = common && same((card) => [...card.energy].sort());
      const sharedLayers = common && same((card) => card.underlying.map((item) => [item.name, item.setId, item.localId, item.observedEffects]));
      const sharedTool = common && same((card) => card.tool);
      const sharedConditions = common && same((card) => [...(card.conditions ?? [])].sort());
      const originalLayers = cards.map((card) => structuredClone(card.underlying));
      const pooled: ReplayZoneCard[] = cards.flatMap((card) => [
        ...(!sharedLayers ? card.underlying.map((layer) => ({ ...layer, boardRole: "evolution" as const })) : []),
        ...(!sharedEnergy ? card.energy.map((energy) => ({ ...zoneCard(id(), /Energy$/i.test(energy) ? energy : `Basic ${energy} Energy`), boardRole: "energy" as const })) : []),
        ...(!sharedTool && card.tool ? [{ ...zoneCard(id(), card.tool), boardRole: "tool" as const }] : []),
      ]);
      // A real namesake ambiguity operation permutes these presentation
      // carriers. Existing components retain their physical objects, but any
      // intersecting carrier domain must follow that permutation too.
      for (const pool of next[actor].boardPools ?? []) if (pool.memberIds.some((id) => memberIds.includes(id))) {
        pool.memberIds = [...new Set([...pool.memberIds, ...memberIds])];
      }
      addBoardPool(actor, cards, pooled, cards.filter((card) => card.physicalCardId).map((card) => topCardEvidence(card.id, card)));
      // Pooled attachment uncertainty is derived from the live pool, so its
      // removal recovers HP. Preserve only independent existing flag evidence.
      const modifierUncertain = cards.some((card) => card.hpModifierUncertain);
      const sharedEffects = (cards[0]?.observedEffects ?? []).filter((effect) => cards.every((card) => card.observedEffects?.includes(effect)));
      const sameSet = cards.every((card) => card.setId === cards[0]?.setId && card.localId === cards[0]?.localId);
      for (const history of [enteredPlay, lastEvolution]) {
        const values = cards.map((card) => history.get(card.id));
        if (!values.every((value) => value === values[0])) cards.forEach((card) => history.delete(card.id));
      }
      cards.forEach((card, index) => {
        uncertainCopy(card); delete card.physicalCardId; if (modifierUncertain) card.hpModifierUncertain = true; else delete card.hpModifierUncertain; card.observedEffects = [...sharedEffects]; delete card.definitionKey;
        if (!sameSet) { delete card.setId; delete card.localId; }
        if (sharedSize !== undefined) card.knownStackSize = sharedSize; else delete card.knownStackSize;
        if (sharedDamage) { card.damage = common.damage; card.damageKnown = true; }
        if (sharedUsed) card.abilityUsed = true;
        if (sharedEnergy) card.energy = [...common.energy];
        if (sharedLayers) card.underlying = originalLayers[index];
        if (sharedTool && common.tool) card.tool = common.tool;
        if (sharedConditions) card.conditions = [...(common.conditions ?? [])];
      });
    };
    const evolutionOverride = () => {
      const sources = [...allCards(next.self), ...allCards(next.opponent), ...(next.stadium ? [{ name: next.stadium.name }] : [])];
      for (let index = program.events.length - 1; index >= 0 && program.events[index].sourceSectionIndex === action.sourceSectionIndex; index--) {
        const played = program.frames[index + 1].playedCard; if (played) sources.push(played.card as ReplayCard);
      }
      return sources.some((source) => hp.resolve(source)?.candidates.some((candidate) => {
        const texts = [...(candidate.rules ?? []), ...candidate.abilities.map((effect) => effect.text ?? ""), ...candidate.attacks.map((effect) => effect.text ?? "")];
        return texts.some((text) => text.split(/(?<=[.!?])\s+/).some((sentence) => !/\b(?:can['’]t|cannot|may not)\b/i.test(sentence)
          && /(?:evolv(?:e|ed|ing)|evolution)[\s\S]*?(?:first turn|turn (?:you|it|they)|put (?:it|this Pok[eé]mon|that Pok[eé]mon) into play|just (?:put|played))/i.test(sentence)));
      }));
    };
    const findEvolutionCard = (actor: ReplayActor, name: string, position: string) => {
      const side = next[actor]; const pool = (position === "Active Spot" ? [side.active] : side.bench).filter((card): card is ReplayCard => card?.name === name);
      const overridden = evolutionOverride();
      const eligible = (card: ReplayCard) => enteredPlay.get(card.id) !== action.sourceSectionIndex && lastEvolution.get(card.id) !== action.sourceSectionIndex;
      const bound = boundCard(side, name, position);
      if (bound && (overridden || action.actor !== actor || action.turn > 1 && eligible(bound))) return recordSelectedCopy(bound, name, position);
      if (action.turn > 1 && action.actor === actor && !overridden && pool.length > 1 && pool.some(eligible)) return recordSelectedCopy(findBoardCard(side, name, position, hp, eligible, sameHistory), name, position);
      const target = findCard(side, name, position);
      if (!overridden && action.actor === actor && (action.turn <= 1 || !eligible(target))) {
        const message = "A recorded evolution overrides ordinary turn timing; no timing exception is established by the available card text.";
        if (!program.diagnostics.messages.includes(message)) program.diagnostics.messages.push(message);
      }
      return target;
    };
    const grantsAttack = /\b(?:copy|copies|copied|VSTAR Power)\b|\b(?:use|uses|using|has|have|choose|chooses)\b[^.]*\battacks?\b/i;
    const understoodPassive = (card: Pick<ReplayZoneCard, "name"> & Partial<ReplayZoneCard>, forbid: RegExp | ((text: string) => boolean)) => {
      if (/^Basic .+ Energy$/i.test(card.name)) return true;
      const evidence = hp.resolve(card);
      return evidence?.coverage === "complete" && evidence.candidates.length > 0 && evidence.candidates.every((candidate) => {
        // Provider-null ordinary Pokemon rules do not record a rule box. An
        // actual Tool/Special Energy/Stadium needs its complete rules instead.
        if (candidate.category !== "Pokemon" && candidate.rules === null || candidate.abilities.some((ability) => ability.text === null)) return false;
        return [...(candidate.rules ?? []), ...candidate.abilities.map((ability) => stripReplayNamedAbilityLimits(ability.text!))].every((text) => !(forbid instanceof RegExp ? forbid.test(text) : forbid(text)));
      });
    };
    const nativeAttackRouteSafe = (attacker: ReplayCard, effect: string, context: ReplayState) => {
      // Check the wider immutable domain BEFORE using this attack as native
      // evidence. A candidate copy permission cannot disappear by pre-narrowing.
      const unseeded = { ...attacker, observedEffects: (attacker.observedEffects ?? []).filter((name) => normalizeText(name) !== normalizeText(effect)) };
      const passiveSources: Array<Pick<ReplayZoneCard, "name"> & Partial<ReplayZoneCard>> = [unseeded];
      for (const actor of ["self", "opponent"] as const) {
        for (const card of allCards(context[actor])) {
          if (card.id !== attacker.id) passiveSources.push(card);
          if (card.tool) passiveSources.push({ name: card.tool });
          passiveSources.push(...card.energy.map((energy) => ({ name: /Energy$/i.test(energy) ? energy : `Basic ${energy} Energy` })));
        }
        for (const pool of context[actor].boardPools ?? []) if (pool.memberIds.length) {
          if (pool.possiblyReturnedCards?.length || pool.uncertainCards?.some((group) => group.cards.length)) return false;
          passiveSources.push(...pool.cards.filter((component) => component.boardRole !== "evolution"));
        }
      }
      if (context.stadium) passiveSources.push({ name: context.stadium.name });
      const retaliationOrHp = /\bHP\b|(?:Abilit(?:y|ies)|Pok[eé]mon Tools?)[\s\S]*(?:no effect|stop working|ignored|can't use)|attacking Pok[eé]mon[^.]*\b(?:damage|counters?|Knocked Out)\b|\b(?:damage|counters?)\b[^.]*attacking Pok[eé]mon|\b(?:when|whenever|if)\b[^.]*\b(?:is|was|are|were) (?:Knocked Out|damaged)\b[^.]*[.,][\s\S]*\b(?:damage|counters?|Knocked Out)\b/i;
      const foreignTopIds = new Set([...allCards(context.self), ...allCards(context.opponent)].filter((card) => card.id !== attacker.id).map((card) => card.id));
      return passiveSources.every((source) => {
        const applicableGrant = (text: string) => grantsAttack.test(text) && !(source.id && foreignTopIds.has(source.id) && isReplaySelfAttackPermission(text, source.name));
        if (!understoodPassive(source, applicableGrant) || !understoodPassive(source, retaliationOrHp)) return false;
        const evidence = hp.resolve(source);
        return /^Basic .+ Energy$/i.test(source.name) || evidence?.candidates.every((candidate) => candidate.category === "Pokemon" || !candidate.attacks.length);
      });
    };
    const departureHpNeutral = (cards: ReplayZoneCard[]) => cards.every((card) => understoodPassive(card,
      /\bHP\b|(?:no|without) (?:effect|Abilities)|(?:Abilit(?:y|ies)|Pok[eé]mon Tools?)[\s\S]*(?:no effect|stop working|ignored|can't use)/i));
    let knockoutRecipientId: string | undefined;
    const attackDamageRecipients = (actor: ReplayActor): Set<string> | null => {
      for (let index = program.events.length - 1; index >= 0 && program.events[index].sourceSectionIndex === action.sourceSectionIndex; index--) {
        const previous = program.events[index]; const stages = previous.transaction?.stages ?? [];
        if (previous.unresolved?.length || stages.some((entry) => entry.targetResolved === false)) return null;
        const title = clean(previous.sourceTitle);
        const knockout = /^(.+?)['’]s (.+?) was Knocked Out$/i.exec(title);
        if (knockout) {
          if (!departureHpNeutral(stages.flatMap((entry) => entry.cards)) || stages.some((entry) => !["before", "discard"].includes(entry.kind))
            || previous.sourceDetails.some((raw) => { const line = clean(raw); return !/ (?:was|were) discarded from /i.test(line) && !/^\s*[•]/.test(raw)
              && !/^Damage to .+? was prevented$|^Effects of .+? did not affect .+$/i.test(line); })) return null;
          continue;
        }
        if (!stages.length && /^Damage to .+? was prevented$|^Effects of .+? did not affect .+$/i.test(title)
          && previous.sourceDetails.map(clean).every((line) => /^Damage to .+? was prevented$|^Effects of .+? did not affect .+$/i.test(line))) continue;
        // "<Stadium> was activated." with only prevention notices records no
        // mutation. It is skippable only when that Stadium is still in play
        // (the backward walk refuses any intervening non-KO event) and every
        // printing's complete rules contain only passive prevention; the
        // empty stage alone is never treated as proof.
        const activated = !stages.length && /^(.+?) was activated$/i.exec(title);
        // The same Stadium (name and controller) must be in play before and
        // after the activation and at this KO, so its text is the one that acted.
        const sameStadium = (state: ReplayState | undefined) => Boolean(state?.stadium && next.stadium && state.stadium.name === next.stadium.name && state.stadium.actor === next.stadium.actor);
        if (activated && previous.sourceDetails.length > 0 && next.stadium?.name === activated[1] && sameStadium(program.frames[index]) && sameStadium(program.frames[index + 1])
          && previous.sourceDetails.map(clean).every((line) => /^Damage to .+? was prevented$|^Effects of .+? did not affect .+$/i.test(line))) {
          const evidence = hp.resolve({ name: activated[1] });
          // Detail lines show only prevention; the printed text must also be
          // pure passive prevention, because an unmodelled printed mutation
          // would not necessarily appear as a stage.
          if (evidence?.coverage === "complete" && evidence.candidates.length > 0 && evidence.candidates.every((candidate) => candidate.category === "Trainer"
            && candidate.trainerType === "Stadium" && !candidate.attacks.length && !candidate.abilities.length
            && isReplayPurePreventionStadiumRules(candidate.rules))) continue;
        }
        if (previous.label !== "Attack" || stages.some((entry) => !["attack", "damage"].includes(entry.kind))) return null;
        const attacks = stages.filter((entry) => entry.kind === "attack");
        if (attacks.length !== 1 || attacks[0].cards.length !== 1) return null;
        const attack = attacks[0]; const attacker = attack.cards[0];
        if (!nativeAttackRouteSafe(attacker as ReplayCard, attack.label, program.frames[index])) return null;
        const evidence = hp.resolve({ ...attacker, observedEffects: [...(attacker.observedEffects ?? []), attack.label] });
        if (evidence?.coverage !== "complete" || !evidence.candidates.length) return null;
        if (!evidence.candidates.every((candidate) => {
          const matches = candidate.attacks.filter((entry) => normalizeText(entry.name) === normalizeText(attack.label));
          if (matches.length !== 1 || matches[0].text === null || /Knock(?:ed)? Out|\bHP\b|discard|Tool|Special Condition|Poison|Burn/i.test(matches[0].text)) return false;
          return printedAttackTargetsActive(attacker as ReplayCard, attack.label)
            || /^Put (?:a|[1-9]\d*) damage counters? on your opponent['’]s (?:Benched )?Pok[eé]mon in any way you like\.$/i.test(matches[0].text.trim());
        })) return null;
        const recipients = stages.filter((entry) => entry.kind === "damage" && entry.actor === actor).flatMap((entry) => entry.cards);
        // A stage can be historical after an intervening KO. Every surviving
        // recipient must still denote the same recorded top, not a replacement.
        const current = allCards(next[actor]);
        if (recipients.some((card) => current.some((now) => now.id === card.id && (now.name !== card.name || now.physicalCardId && card.physicalCardId && now.physicalCardId !== card.physicalCardId)))) return null;
        return new Set(recipients.filter((card) => current.some((now) => now.id === card.id && now.name === card.name)).map((card) => card.id));
      }
      return null;
    };
    // In a complete PTCGL KO action the discarded-from annotations are the
    // exhaustive below-top bundle. Missing annotations are not an empty
    // receipt; only an explicit zero can establish that. Unknown or
    // unrelated mutations cannot supply this certificate.
    const recordedKnockoutBundle = (player: string, name: string): string[] | null => {
      if (clean(action.sourceTitle) !== `${player}'s ${name} was Knocked Out` && clean(action.sourceTitle) !== `${player}’s ${name} was Knocked Out`) return null;
      const names: string[] = []; let explicitZero = false;
      for (let index = 0; index < action.details.length; index++) {
        const raw = action.details[index]; const line = clean(raw);
        const removal = /^(.+?) (?:was|were) discarded from (.+?)['’]s (.+)$/i.exec(line);
        if (removal) {
          if (removal[2] !== player || removal[3] !== name) return null;
          const numeric = /^(a|\d+) cards?$/i.exec(removal[1]);
          if (numeric?.[1] === "0") { explicitZero = true; continue; }
          const listed = numeric ? action.details[++index]?.trim() : undefined;
          if (numeric && (!listed || !/^[•-]/.test(listed))) return null;
          const entries = clean(numeric ? listed! : removal[1]).split(",").map((entry) => entry.trim()).filter(Boolean);
          if (!entries.length || entries.some((entry) => /^(?:a|an|\d+) cards?$|^(?:a|an) Energy$/i.test(entry)) || numeric && entries.length !== count(numeric[1])) return null;
          names.push(...entries); continue;
        }
        if (!/^Damage to .+? was prevented$|^Effects of .+? did not affect .+$/i.test(line)) return null;
      }
      return explicitZero && names.length ? null : names.length || explicitZero ? names : null;
    };
    const findKnockoutCard = (actor: ReplayActor, name: string) => {
      knockoutRecipientId = undefined;
      const side = next[actor]; const pool = allCards(side).filter((card) => card.name === name);
      const bundle = recordedKnockoutBundle(actor === "self" ? input.selfPlayerName : input.opponentPlayerName, name);
      const compatible = (card: ReplayCard) => !bundle || !stackComplete(side, card) || JSON.stringify([...card.underlying.map((entry) => entry.name), ...card.energy.map((energy) => /Energy$/i.test(energy) ? energy : `Basic ${energy} Energy`), ...(card.tool ? [card.tool] : []), ...(side.boardPools ?? []).filter((entry) => entry.memberIds.length === 1 && entry.memberIds[0] === card.id).flatMap((entry) => entry.cards.map((component) => component.name))].sort()) === JSON.stringify([...bundle].sort());
      const compatiblePool = pool.filter(compatible);
      if (bundle && compatiblePool.length === 1) { knockoutRecipientId = compatiblePool[0].id; return compatiblePool[0]; }
      if (bundle && !compatiblePool.length) throw new BoardCardUnresolved("The complete KO bundle conflicts with the represented physical stacks.");
      const selected = boundCard(side, name);
      const bound = compatiblePool.find((card) => card.id === recordedKnockoutBindings.get(actionIndex) || card.id === selected?.id);
      if (bound) { knockoutRecipientId = bound.id; return bound; }
      const knownDamage = (card: ReplayCard) => card.hpBasis === "known" && card.hp !== null && card.damageKnown !== false && !card.instanceUncertain && !card.hpModifierUncertain && card.hpModifierBasis !== "unverified_attachment";
      if (compatiblePool.length > 1 && compatiblePool.every(knownDamage)) {
        const lethal = compatiblePool.filter((card) => card.damage >= card.hp!);
        if (lethal.length === 1) { knockoutRecipientId = lethal[0].id; return lethal[0]; }
      }
      if (compatiblePool.length > 1) {
        const recipients = attackDamageRecipients(actor);
        const hit = recipients ? compatiblePool.filter((card) => recipients.has(card.id)) : [];
        if (hit.length === 1) { knockoutRecipientId = hit[0].id; return hit[0]; }
      }
      return findCard({ ...side, active: side.active && compatiblePool.includes(side.active) ? side.active : null, bench: side.bench.filter((card) => compatiblePool.includes(card)), unplaced: side.unplaced?.filter((card) => compatiblePool.includes(card)) }, name);
    };
    const sourceProvenAttachmentSupply = (actor: ReplayActor, name: string) => {
      const side = next[actor]; const current = allCards(side);
      const player = actor === "self" ? input.selfPlayerName : input.opponentPlayerName;
      const other = actor === "self" ? input.opponentPlayerName : input.selfPlayerName;
      // Strings on a top have no source-card provenance. A matching total must
      // not conceal one missing component with another counted twice.
      if (current.some((top) => top.tool === name || top.energy.some((energy) => (/Energy$/i.test(energy) ? energy : `Basic ${energy} Energy`) === name))) return false;
      const pools = side.boardPools ?? [];
      if (pools.some((pool) => pool.possiblyReturnedCards?.some((card) => card.name === name)
        || pool.uncertainCards?.some((group) => group.cards.some((card) => card.name === name)))) return false;
      const supplied = pools.flatMap((pool) => pool.cards.filter((card) => card.name === name).map((card) => ({ pool, card })));
      if (!supplied.length || new Set(supplied.map(({ card }) => card.id)).size !== supplied.length) return false;
      const witnessed = new Set<string>();
      for (let index = 0; index < actionIndex; index++) {
        const raw = [actions[index].sourceTitle, ...actions[index].details];
        let attachments = 0;
        for (let ordinal = 0; ordinal < raw.length; ordinal++) {
          const line = clean(raw[ordinal]);
          if (line.startsWith(`${player} attached `) && /^(?:a card|\d+ cards|an? Energy|\d+ Energy)\b/i.test(line.slice(player.length + 10))) return false;
          if (!line.includes(name)) continue;
          if (/^\s*•/.test(raw[ordinal])) {
            const header = clean(raw[ordinal - 1] ?? "");
            if ([`${player} drew `, `${player} shuffled `, `${player} discarded `].some((prefix) => header.startsWith(prefix))
              && /(?:a|\d+) cards?(?: into their deck)?$/i.test(header)) continue;
            if (header.startsWith(`${other} `) && !header.includes(player)) continue;
            return false;
          }
          if (line === `${player} drew ${name}` || line === `${name} was added to ${player}'s hand` || line === `${name} was added to ${player}’s hand` || line === `${player} discarded ${name}`) continue;
          const attachment = /^(.+?) attached (.+?) to (.+?) (?:in|on) the (Active Spot|Bench)(?: from (?:their |the )?(hand|deck|discard pile))?$/i.exec(line);
          const otherActor = actor === "self" ? "opponent" : "self";
          if (!line.includes(player) && (line === `${other} drew ${name}` || line === `${other} discarded ${name}`
            || line.startsWith(`${name} was discarded from ${other}'s `) || line.startsWith(`${name} was discarded from ${other}’s `)
            || attachment?.[1] === other && allCards(program.frames[index][otherActor]).some((top) => top.name === attachment[3]))) continue;
          // The narrow proof accepts a named manual attachment or an explicit
          // origin. Other movements/departures cannot borrow this ledger.
          if (!attachment || attachment[1] !== player || attachment[2] !== name || ordinal > 0 && !attachment[5] || ++attachments !== 1) return false;
          const born = program.frames[index + 1]?.[actor];
          const holders = born && allCards(program.frames[index][actor]).filter((top) => top.name === attachment[3]
            && (attachment[4] === "Active Spot" ? program.frames[index][actor].active?.id === top.id : program.frames[index][actor].bench.some((bench) => bench.id === top.id)));
          const matches = supplied.filter(({ pool, card }) => {
            const original = born?.boardPools?.find((candidate) => candidate.id === pool.id && candidate.cards.some((component) => component.id === card.id && component.name === name));
            return card.id.startsWith(`action-${index}-card-`) && (card.boardRole === "energy" || card.boardRole === "tool") && original && holders?.length
              && original.memberIds.length === holders.length && original.memberIds.every((id) => holders.some((holder) => holder.id === id) && current.some((holder) => holder.id === id))
              && pool.memberIds.every((id) => original.memberIds.includes(id));
          });
          if (matches.length !== 1 || witnessed.has(matches[0].card.id)) return false;
          witnessed.add(matches[0].card.id);
        }
      }
      return witnessed.size === supplied.length && supplied.every(({ card }) => witnessed.has(card.id));
    };
    const slotProvenKnockoutComponents = (actor: ReplayActor, card: ReplayCard, sameName: ReplayCard[]): ReplayZoneCard[] | null => {
      if (sameName.length !== 1 && knockoutRecipientId !== card.id) return null;
      const side = next[actor]; const current = allCards(side);
      const pools = (side.boardPools ?? []).filter((pool) => pool.memberIds.includes(card.id));
      if (pools.some((pool) => pool.possiblyReturnedCards?.length || pool.uncertainCards?.some((group) => group.cards.length)
        || pool.cards.length && pool.memberIds.some((id) => !current.some((member) => member.id === id && member.name === card.name))
          && !(pool.memberIds.every((id) => current.some((member) => member.id === id))
            && pool.cards.every((entry) => (entry.boardRole === "energy" || entry.boardRole === "tool") && sourceProvenAttachmentSupply(actor, entry.name))))) return null;
      const lines = action.details.map(clean);
      const player = actor === "self" ? input.selfPlayerName : input.opponentPlayerName;
      const completeBundle = recordedKnockoutBundle(player, card.name);
      const indices = lines.flatMap((line, index) => [`'s ${card.name}`, `’s ${card.name}`].some((suffix) => line.endsWith(` discarded from ${player}${suffix}`)) ? [index] : []);
      const own = [...card.underlying, ...card.energy.map((energy) => zoneCard(id(), /Energy$/i.test(energy) ? energy : `Basic ${energy} Energy`)), ...(card.tool ? [zoneCard(id(), card.tool)] : [])];
      // A named list alone is a lower bound. Require its explicit numeric total
      // or an independently established complete physical stack size.
      let recorded: string[];
      if (completeBundle === null && !indices.length) return !own.length && card.knownStackSize === 1 && pools.every((pool) => !pool.cards.length) ? [] : null;
      if (completeBundle === null && indices.length !== 1) return null;
      const detail = indices[0]; const head = (lines[detail] ?? "").replace(/ (?:was|were) discarded from .+$/i, "");
      const numeric = /^(a|\d+) cards?$/i.exec(head);
      if (completeBundle !== null) recorded = completeBundle;
      else if (numeric) {
        const listed = action.details[detail + 1]?.trim() ?? "";
        if (count(numeric[1]) === 0) recorded = [];
        else {
          if (!/^[•-]/.test(listed)) return null;
          recorded = clean(listed.replace(/^[-•]\s*/, "")).split(",").map((value) => value.trim()).filter(Boolean);
        }
        if (recorded.length !== count(numeric[1])) return null;
      } else {
        recorded = head.split(",").map((value) => value.trim()).filter(Boolean);
        if (card.knownStackSize !== recorded.length + 1) return null;
      }
      if (card.knownStackSize !== undefined && card.knownStackSize !== recorded.length + 1) return null;
      const needed = [...recorded];
      for (const component of own) { const index = needed.indexOf(component.name); if (index < 0) return null; needed.splice(index, 1); }
      const evolvedNames = new Set(pools.filter((pool) => pool.cards.length && pool.memberIds.some((id) => current.some((member) => member.id === id && member.name !== card.name)))
        .flatMap((pool) => pool.cards.map((component) => component.name)));
      // The recorded bundle must exhaust these source-proven copies. Otherwise
      // their names establish the quantity, but not which source card departed.
      for (const name of evolvedNames) {
        const supply = (side.boardPools ?? []).flatMap((pool) => pool.cards).filter((component) => component.name === name);
        if (needed.filter((component) => component === name).length !== supply.length) return null;
      }
      const available = new Map(pools.map((pool) => [pool, [...pool.cards]]));
      const chosen: Array<{ pool: (typeof pools)[number]; component: ReplayZoneCard }> = [];
      for (const name of needed) {
        const suppliers = pools.filter((pool) => available.get(pool)!.some((entry) => entry.name === name));
        if (!suppliers.length || suppliers.some((pool) => JSON.stringify([...pool.memberIds].sort()) !== JSON.stringify([...suppliers[0].memberIds].sort()))) return null;
        const entries = available.get(suppliers[0])!; const at = entries.findIndex((entry) => entry.name === name);
        chosen.push({ pool: suppliers[0], component: entries.splice(at, 1)[0] });
      }
      for (const { pool, component } of chosen) pool.cards.splice(pool.cards.findIndex((entry) => entry.id === component.id), 1);
      return [...own, ...chosen.map(({ component }) => component)];
    };
    const resolveDepartedPrintingMultisets = (actor: ReplayActor) => {
// If individual KO order remains unresolved, the whole original
// multiset still becomes known once every possible top is in discard.
// New presentation IDs avoid claiming an arbitrary KO ordinal.
for (const pending of [...pendingTopDepartures].filter((entry) => entry.actor === actor)) {
  const originalIds = pending.topIds.filter((key) => retainedTops.has(key));
  const related = pendingTopDepartures.filter((entry) => entry.actor === actor && entry.topIds.some((key) => originalIds.includes(key)));
  const originals = originalIds.map((key) => retainedTops.get(key)!);
  if (!originals.length || originals.some((entry) => entry.memberIds.length) || related.length !== originals.length
    || related.some((entry) => !next[actor].discard.some((card) => card.id === entry.id))) continue;
  const moved = originals.map((entry) => ({ ...structuredClone(entry.top), id: id() }));
  const replaced = new Set(related.map((entry) => entry.id));
  next[actor].discard = [...moved, ...next[actor].discard.filter((card) => !replaced.has(card.id))];
  for (const key of originalIds) retainedTops.delete(key);
  for (let index = pendingTopDepartures.length - 1; index >= 0; index--) if (related.includes(pendingTopDepartures[index])) pendingTopDepartures.splice(index, 1);
  for (const pool of next[actor].boardPools ?? []) pool.memberEvidence = pool.memberEvidence?.filter((card) => !card.physicalCardId || !originalIds.includes(card.physicalCardId));
  stage("discard", "Resolved printing multiset", moved, actor);
}
    };
    const restoreCounterSurvivors = (actor: ReplayActor, name: string, candidates: ReplayCard[], removedId: string) => {
      const unchangedKnockoutBatch = (from: number) => {
        if (from >= actionIndex || actions[from].sourceSectionIndex !== action.sourceSectionIndex) return false;
        for (let index = from + 1; index < actionIndex; index++) {
          const event = program.events[index]; const title = clean(event?.sourceTitle ?? "");
          const record = /^(.+?)['’]s (.+?) was Knocked Out$/i.exec(title);
          const stages = event?.transaction?.stages ?? [];
          if (!record || record[2] === name || event.sourceSectionIndex !== action.sourceSectionIndex || event.unresolved?.length
            || stages.some((entry) => entry.targetResolved === false || !["before", "discard"].includes(entry.kind))) return false;
          const owner = actorFor(record[1]);
          const tops = stages.filter((entry) => entry.kind === "before" && entry.actor === owner).flatMap((entry) => entry.cards);
          const discarded = stages.filter((entry) => entry.kind === "discard" && entry.actor === owner).flatMap((entry) => entry.cards);
          if (tops.length !== 1 || tops[0].name !== record[2] || !discarded.length || discarded[0].name !== record[2]) return false;
          const top = tops[0] as ReplayCard; const prior = program.frames[index][owner];
          const expected = exactStackSize(prior, top);
          // A complete departure is necessary: an omitted Tool or Special
          // Energy could change HP, suppression, or on-KO retaliation.
          if (expected === null || expected !== discarded.length || !departureHpNeutral([top, ...discarded])) return false;
          const components = [top, ...top.underlying,
            ...top.energy.map((energy) => ({ name: /Energy$/i.test(energy) ? energy : `Basic ${energy} Energy`, definitionOwner: owner })),
            ...(top.tool ? [{ name: top.tool, definitionOwner: owner }] : []), ...discarded];
          if (components.some((card) => !understoodPassive(card, /\bHP\b|(?:Abilit(?:y|ies)|Pok[eé]mon Tools?)[\s\S]*(?:no effect|stop working|ignored|can't use)|attacking Pok[eé]mon[^.]*\b(?:damage|counters?|Knocked Out)\b|\b(?:damage|counters?)\b[^.]*attacking Pok[eé]mon|\b(?:when|whenever|if)\b[^.]*\b(?:is|was|are|were) (?:Knocked Out|damaged)\b[^.]*[.,][\s\S]*\b(?:damage|counters?|Knocked Out)\b/i))) return false;
          if (event.sourceDetails.some((raw) => !/ (?:was|were) discarded from /i.test(clean(raw)) && !/^\s*[•]/.test(raw))) return false;
        }
        return true;
      };
      const counters = counterEliminations.find((pool) => (pool.actionIndex === actionIndex - 1 || pool.batchSafe && unchangedKnockoutBatch(pool.actionIndex)) && pool.actor === actor && pool.name === name
        && pool.ids.length === candidates.length && candidates.every((card) => pool.ids.includes(card.id)));
      if (counters) candidates.filter((card) => card.id !== removedId).forEach((card) => { card.damage = 0; card.damageKnown = true; });
    };
    const confirmedHpUpperBound = (card: ReplayCard) => {
      const evidence = hp.resolve(card);
      if (evidence?.coverage !== "complete" || !evidence.candidates.length || card.maxHp == null || card.baseHp == null || card.hpModifierUncertain) return null;
      const values = evidence.candidates.map((candidate) => candidate.hp);
      if (values.some((value) => value === null || !Number.isFinite(value))) return null;
      return Math.max(...values as number[]) + card.maxHp - card.baseHp;
    };
    const promotionFromRecordedKnockout = (actor: ReplayActor, name: string, pool: ReplayCard[]) => {
      if (pool.length < 2 || pool.some((card) => card.instanceUncertain)) return null;
      const player = actor === "self" ? input.selfPlayerName : input.opponentPlayerName;
      let attacked = false; const discarded: string[] = [];
      const hpOrSuppression = /\bHP\b|(?:no|without) (?:effect|Abilities)|(?:Abilit(?:y|ies)|Pok[eé]mon Tools?)[\s\S]*(?:no effect|stop working|ignored|can't use)/i;
      const stableHpSource = (name: string) => {
        if (/^Basic .+ Energy$/i.test(name)) return true;
        const evidence = hp.resolve({ name });
        return evidence?.coverage === "complete" && evidence.candidates.length > 0 && evidence.candidates.every((candidate) =>
          (candidate.category === "Pokemon" || candidate.rules !== null) && candidate.abilities.every((ability) => ability.text !== null)
          && [...(candidate.rules ?? []), ...candidate.abilities.map((ability) => ability.text ?? ""), ...candidate.attacks.map((attack) => attack.text ?? "")].every((text) => !hpOrSuppression.test(text)));
      };
      for (let index = actionIndex + 1; index < Math.min(actions.length, actionIndex + 65); index++) {
        const following = actions[index]; const lines = [following.sourceTitle, ...following.details].map(clean);
        for (let detail = 0; detail < lines.length; detail++) {
          const line = lines[detail].replace(/^(.*?) attached (.+?) from (?:their |the )?(hand|deck|discard pile) to (.+)$/i, "$1 attached $2 to $4 from $3");
          const attachment = /^(.+?) attached (.+?) to (.+?)(?= (?:in|on) (?:the )?(?:Active Spot|Bench)| from (?:their |the )?(?:hand|deck|discard pile)|$)/i.exec(line);
          const evolution = /^(.+?) evolved (.+?) to (.+?) (?:in|on) the (?:Active Spot|Bench)$/i.exec(line);
          if (/^.+? evolved /i.test(line) && !evolution) return null;
          const placement = /^(.+?) played (.+?) to (?:the )?(?:Active Spot|Bench)$/i.exec(line);
          const moved = /^(.+?) (?:moved|returned|shuffled|put) (.+)/i.exec(line);
          const position = /^(.+?)['’]s .+? (?:is now in the Active Spot|was switched with)/i.exec(line);
          const retreat = /^(.+?) retreated /i.exec(line);
          const played = /^(.+?) played (.+?)(?: to (?:the )?(?:Active Spot|Bench))?$/i.exec(line);
          if (/ to the Stadium spot$/i.test(line) || effectTag(following.sourceTitle) === "stadium" && played) return null;
          if (attachment && (!stableHpSource(attachment[2]) || !stableHpSource(attachment[3])) || evolution && (!stableHpSource(evolution[2]) || !stableHpSource(evolution[3]))) return null;
          if (played) {
            const evidence = hp.resolve({ name: played[2], definitionOwner: played[1] === input.selfPlayerName ? "self" : "opponent" });
            if (evidence?.coverage !== "complete" || !stableHpSource(played[2])) return null;
          }
          const heal = /^(.+?)['’]s (.+?) healed \d+ damage$/i.exec(line);
          if (heal?.[1] === player && heal[2] === name || /^.+? healed \d+ damage from /i.test(line) && (line.endsWith(`${player}'s ${name}`) || line.endsWith(`${player}’s ${name}`))) return null;
          const sourceAbility = /^(.+?)['’]s (.+?) used /i.exec(line);
          if (sourceAbility && !stableHpSource(sourceAbility[2])) return null;
          if (position?.[1] === player || retreat?.[1] === player || attachment?.[1] === player && attachment[3] === name
            || evolution?.[1] === player && evolution[2] === name || placement?.[1] === player && placement[2] === name
            || played?.[1] === player && played[2] === name || sourceAbility?.[1] === player && sourceAbility[2] === name && hp.abilityTexts(name, line.replace(/^.+? used (?:its Ability:\s*)?/i, ""), actor)?.some((text) => /(?:shuffle|return|put) this Pok[eé]mon/i.test(text))
            || moved && (moved[2].includes(`${player}'s ${name}`) || moved[2].includes(`${player}’s ${name}`) || moved[1] === player && moved[2].startsWith(`${name} `))) return null;
          const attack = /^.+? used .+? on (.+?)['’]s (.+?) for (\d+)\+? damage/i.exec(line);
          if (attack?.[1] === player && attack[2] === name) {
            const bounds = pool.map(confirmedHpUpperBound);
            if (bounds.some((bound) => bound === null || Number(attack[3]) < bound)) return null;
            attacked = true;
          }
          const removal = /^(.+?) (?:was|were) discarded from (.+?)['’]s (.+)$/i.exec(line);
          if (removal) {
            const numeric = /^(a|\d+) cards?$/i.exec(removal[1]);
            const names = (numeric ? lines[detail + 1] ?? "" : removal[1]).split(",").map((value) => value.trim());
            if (!names.length || !stableHpSource(removal[3]) || names.some((value) => !stableHpSource(value))) return null;
          }
          const knockout = /^(.+?)['’]s (.+?) was Knocked Out$/i.exec(line);
          if (knockout && !stableHpSource(knockout[2])) return null;
          const returned = /^.+? (?:moved|returned) (.+?) to (?:their |the )?(?:hand|deck)$/i.exec(line);
          if (returned) {
            const cardName = returned[1].replace(/^.+?['’]s /, "");
            if (!stableHpSource(cardName)) return null;
          }
          if (removal?.[2] === player && removal[3] === name) {
            if (!attacked) return null;
            const numeric = /^(a|\d+) cards?$/i.exec(removal[1]);
            const names = numeric ? (lines[detail + 1] ?? "").split(",").map((value) => value.trim()) : removal[1].split(",").map((value) => value.trim());
            if (numeric && (names.length !== count(numeric[1]) || names.some((value) => !value || /\b(?:was|were|drew|played)\b/.test(value)))) return null;
            discarded.push(...names);
          }
        }
        if (clean(following.sourceTitle) === `${player}'s ${name} was Knocked Out` || clean(following.sourceTitle) === `${player}’s ${name} was Knocked Out`) {
          if (!attacked || !discarded.length) return null;
          // A direct attack whose lower bound is lethal must KO the Active.
          // With two same-name KOs in that bundle, attachment evidence cannot
          // establish which KO denotes the Active rather than a spread target.
          for (let later = index + 1; later < actions.length && actions[later].sourceSectionIndex === following.sourceSectionIndex; later++) {
            const lines = [actions[later].sourceTitle, ...actions[later].details].map(clean);
            if (lines.some((line) => line === `${player}'s ${name} was Knocked Out` || line === `${player}’s ${name} was Knocked Out`)) return null;
            if (lines.some((line) => / used .+? on .+? for \d+\+? damage/i.test(line) || line.startsWith(`${player}'s `) && /is now in the Active Spot$/i.test(line))) break;
          }
          const matches = pool.filter((card) => {
            const available = [...card.underlying.map((layer) => layer.name), ...card.energy.map((energy) => /Energy$/i.test(energy) ? energy : `Basic ${energy} Energy`), ...(card.tool ? [card.tool] : [])];
            return discarded.length === available.length && discarded.every((value) => { const at = available.indexOf(value); if (at < 0) return false; available.splice(at, 1); return true; });
          });
          if (matches.length !== 1) return null;
          recordedKnockoutBindings.set(index, matches[0].id); return matches[0];
        }
      }
      return null;
    };
    const promote = (actor: ReplayActor, name: string, confirmation = false) => {
      const side = next[actor];
      if (confirmation && lastPromotionActor === actor && side.active?.name === name) return;
      if (side.active?.name === name && !side.bench.some((card) => card.name === name) && !side.unplaced?.some((card) => card.name === name)) return;
      const pool = [...side.bench, ...(side.unplaced ?? [])].filter((card) => card.name === name && card.id !== retreating?.id);
      let target: ReplayCard;
      try { target = findCard({ ...side, bench: pool, unplaced: [] }, name, "Bench"); }
      catch (error) {
        if (!(error instanceof BoardCardUnresolved) || !pool.length) throw error;
        const evidenced = promotionFromRecordedKnockout(actor, name, pool);
        if (evidenced) target = evidenced;
        else { uncertainCopies(actor, pool); target = pool[0]; next.partial = true; errors.push("The promoted Pokémon's physical copy is unidentified."); }
      }
      side.bench = side.bench.filter((card) => card.id !== target.id);
      side.unplaced = side.unplaced?.filter((card) => card.id !== target.id);
      if (side.active) { side.active.conditions = []; delete side.active.activeEpisodeId; delete side.active.activePrintingEffects; side.bench.unshift(side.active); }
      side.active = target; side.activeUncertain = false; lastPromotionActor = actor;
      target.activeEpisodeId = `active:${actor}:${actionIndex}:${currentLineOrdinal}`; delete target.activePrintingEffects;
      // Once the sole Active is established, all surviving in-play copies have
      // a known Bench position even if their attachment/damage assignment does not.
      side.bench.push(...(side.unplaced ?? [])); side.unplaced = [];
      stage("move", "Promote", [target], actor);
    };
    const transfer = (actor: ReplayActor, names: string[], amount: number, origin: string, destination: string) => {
      if (names.length > amount || amount < 1 || amount > 60) throw new Unresolved("The moved card list conflicts with its count.");
      const side = next[actor];
      const zones: CountZone[] = [origin as CountZone, destination as CountZone];
      const cards = names.map((name) => zoneCard(id(), name));
      try {
        transferCounts(actor, origin as CountZone, destination as CountZone, amount);
        if (origin === "discard") {
          const recovered = takeDiscard(actor, names, side.discardIdentitiesKnown === true || side.discardIdentitiesKnown === undefined && side.discardCount != null && side.discardCount + amount === side.discard.length);
          cards.forEach((card, index) => Object.assign(card, recovered[index]));
          if (names.length < amount) {
            side.discardIdentitiesKnown = false;
            markUncertain(actor, ["discard"], false); next.partial = true;
            errors.push("Some recovered discard card identities are not recorded.");
          }
        } else if (origin === "hand") { const removed = removeHand(side, names, amount, destination as CountZone); cards.forEach((card, index) => Object.assign(card, removed[index])); }
        else if (origin === "deck") side.deckCount = changeCount(side.deckCount, -amount, zones);
        else throw new Unresolved("The moved cards' origin is not supported.");
        if (destination === "hand") { side.handCount = changeCount(side.handCount, amount, zones); side.knownHand.push(...cards); }
        else side.deckCount = changeCount(side.deckCount, amount, zones);
      } catch (error) {
        if (error instanceof CountConflict) throw new CountConflict(error.message, zones);
        throw error;
      }
      stage(destination === "hand" ? "return" : "shuffle", destination === "hand" ? "To hand" : "Shuffle", cards, actor, amount - names.length); mutationCount++;
    };
    const effectContext = () => {
      const title = clean(action.sourceTitle);
      const used = /^(.+?)['’]s (.+?) used (?:its Ability:\s*)?(.+)$/.exec(title);
      if (used && [input.selfPlayerName, input.opponentPlayerName].includes(used[1])) {
        const actor = actorFor(used[1]);
        const attack = recordedAttacks.at(-1)?.match;
        const stageSource = stages.findLast((entry) => entry.actor === actor && entry.kind === (attack ? "attack" : "ability") && entry.cards.length === 1 && entry.cards[0].name === used[2])?.cards[0];
        const card = allCards(next[actor]).find((card) => card.id === stageSource?.id) ?? (attack && next[actor].active?.name === used[2] ? next[actor].active : undefined)
          ?? allCards(next[actor]).find((card) => card.name === used[2]) ?? { ...pokemon("effect-source", used[2]), definitionOwner: actor };
        const attackEvidence = attack ? attackPrintingEvidence(card, attack[3], next) : null;
        return { actor, card: attackEvidence?.status === "copied" ? attackEvidence.definitionCard : card, name: attack?.[3] ?? used[3], kind: attack ? "attack" as const : effectTag(action.sourceTitle) ?? "ability" as const };
      }
      const played = /^(.+?) played (.+)$/.exec(title);
      if (played && [input.selfPlayerName, input.opponentPlayerName].includes(played[1])) return { actor: actorFor(played[1]), card: { ...pokemon("effect-source", played[2]), definitionOwner: actorFor(played[1]) }, name: undefined, kind: effectTag(action.sourceTitle) ?? "supporter" as const };
      const activated = /^(.+?) was activated$/.exec(title);
      if (activated && next.stadium?.name === activated[1]) return { actor: next.stadium.actor, card: { ...pokemon("effect-source", activated[1]), definitionOwner: next.stadium.actor }, name: undefined, kind: "stadium" as const };
      return null;
    };
    const returnAttachedEnergy = (actor: ReplayActor, names: string[], amount: number, destination: "hand" | "deck") => {
      const context = effectContext();
      const plan = context && hp.effectConstraints(context.card, context.name, context.kind, "return_attached_energy");
      if (!context || context.actor !== actor || plan?.status !== "known" || plan.operation !== "return_attached_energy" || plan.destination !== destination) return false;
      if (plan.quantity.kind !== "exact" || plan.quantity.value !== amount || names.length !== amount || names.some((name) => !/Energy$/i.test(name))) throw new Unresolved("The recorded attached Energy return does not match its verified quantity.");
      const source = allCards(next[actor]).find((card) => card.id === context.card.id && card.name === context.card.name);
      const sourceStage = stages.findLast((entry) => entry.actor === actor && entry.kind === context.kind
        && entry.targetResolved !== false && normalizeText(entry.label) === normalizeText(context.name ?? "")
        && entry.cards.length === 1 && entry.cards[0].id === source?.id);
      if (!source || !sourceStage) throw new BoardCardUnresolved("The Energy return's source Pokémon is not identified.");
      const sourceEvidence = hp.resolve(source);
      if (plan.energyType && names.some((name) => {
        if (name === `Basic ${plan.energyType} Energy`) return false;
        const evidence = hp.resolve({ name, definitionOwner: actor });
        return evidence?.coverage !== "complete" || !evidence.candidates.length || evidence.candidates.some((card) => card.category !== "Energy" || !card.rules?.length
          || !sourceEvidence?.candidates.length || sourceEvidence.coverage !== "complete" || sourceEvidence.candidates.some((top) => top.stage !== "Stage2")
          || !card.rules.every((text) => /^As long as this card is attached to a Pok[eé]mon, it provides \{C\} Energy\.\s+If this card is attached to a Stage 2 Pok[eé]mon, this card provides every type of Energy but provides only 2 Energy at a time\.$/i.test(text.trim())));
      })) throw new Unresolved("The returned Energy's required type is not established by complete card evidence.");
      const side = next[actor]; const pools = (side.boardPools ?? []).filter((pool) => pool.memberIds.length === 1 && pool.memberIds[0] === source.id && !pool.possiblyReturnedCards?.length && !pool.uncertainCards?.some((group) => group.cards.length));
      const available = [...source.energy.map((energy) => /Energy$/i.test(energy) ? energy : `Basic ${energy} Energy`), ...pools.flatMap((pool) => pool.cards.filter((card) => card.boardRole === "energy").map((card) => card.name))];
      for (const name of names) { const index = available.indexOf(name); if (index < 0) throw new BoardCardUnresolved("The returned Energy is not a confirmed attachment of the source Pokémon."); available.splice(index, 1); }
      const cards: ReplayZoneCard[] = [];
      for (const name of names) {
        const energy = name.replace(/^Basic (.+) Energy$/i, "$1"); const index = source.energy.indexOf(energy);
        if (index >= 0) { source.energy.splice(index, 1); cards.push(zoneCard(id(), name)); }
        else {
          const pool = pools.find((pool) => pool.cards.some((card) => card.boardRole === "energy" && card.name === name))!;
          cards.push(pool.cards.splice(pool.cards.findIndex((card) => card.boardRole === "energy" && card.name === name), 1)[0]);
        }
      }
      if (source.knownStackSize !== undefined) source.knownStackSize -= amount;
      transferCounts(actor, "board", destination, amount);
      if (destination === "hand") { side.handCount = changeCount(side.handCount, amount, ["board", "hand"]); side.knownHand.push(...cards); }
      else side.deckCount = changeCount(side.deckCount, amount, ["board", "deck"]);
      stage(destination === "hand" ? "return" : "shuffle", destination === "hand" ? "To hand" : "Shuffle", cards, actor); mutationCount++; return true;
    };
    const constrainedCandidates = (name: string, literalOwner: ReplayActor, actor: ReplayActor, constraint?: ReplayEffectTarget) => {
      const owners: ReplayActor[] = constraint?.owner === "effect_actor" ? [actor] : constraint?.owner === "opponent" ? [actor === "self" ? "opponent" : "self"] : constraint?.owner === "trigger" ? [literalOwner] : ["self", "opponent"];
      const position = constraint?.zone === "active" ? "Active Spot" : constraint?.zone === "bench" ? "Bench" : undefined;
      const matches = owners.flatMap((owner) => {
        const side = next[owner]; const cards = position === "Active Spot" ? [side.active] : position === "Bench" ? side.bench : allCards(side);
        return cards.filter((card): card is ReplayCard => Boolean(card?.name === name)).map((card) => ({ actor: owner, card }));
      });
      return matches;
    };
    const secondaryDamagePosition = (actor: ReplayActor, amount: number) => {
      const context = effectContext();
      const plan = context && hp.effectConstraints(context.card, context.name, context.kind, "return_attached_energy");
      if (!context || context.actor === actor || context.kind !== "attack" || plan?.status !== "known" || plan.operation !== "return_attached_energy" || plan.destination !== "deck"
        || recordedAttacks.length !== 1 || Number(recordedAttacks[0].match![6]) === amount) return undefined;
      const evidence = hp.resolve({ ...context.card, observedEffects: [...(context.card.observedEffects ?? []), context.name ?? ""] });
      if (evidence?.coverage !== "complete" || !evidence.candidates.length || !evidence.candidates.every((card) => {
        const attacks = card.attacks.filter((attack) => normalizeText(attack.name) === normalizeText(context.name ?? ""));
        return attacks.length === 1 && attacks[0].text !== null && /If you do, this attack also does (\d+) damage to 1 of your opponent['’]s Benched Pok[eé]mon\./i.exec(attacks[0].text)?.[1] === String(amount);
      })) return undefined;
      const player = context.actor === "self" ? input.selfPlayerName : input.opponentPlayerName;
      return action.details.map(clean).some((line) => line === `${player} shuffled ${plan.quantity.value} cards into their deck`) ? "Bench" : undefined;
    };
    const departingBenchLimit = () => {
      if (!/^.+? played a card$/i.test(clean(action.sourceTitle)) || !program.events.length) return null;
      const previous = program.events.at(-1)!; const departed = program.frames.at(-2)?.stadium;
      if (!departed || previous.sourceSectionIndex !== action.sourceSectionIndex || next.stadium?.name === departed.name
        || previous.unresolved?.length || ![previous.sourceTitle, ...previous.sourceDetails].map(clean).some((line) => line === `${departed.actor === "self" ? input.selfPlayerName : input.opponentPlayerName} discarded ${departed.name}`)
        || !previous.transaction?.stages.some((entry) => entry.kind === "discard" && entry.actor === departed.actor)) return null;
      const evidence = hp.resolve({ name: departed.name, definitionOwner: departed.actor });
      if (evidence?.coverage !== "complete" || !evidence.candidates.length) return null;
      const limits = evidence.candidates.map((card) => card.category === "Trainer" && card.trainerType === "Stadium" && card.rules?.length === 1
        ? /(?:^|\. )When this card leaves play, both players discard Pok[eé]mon from their Bench until they have ([1-9]\d*), and the player who played this card discards first\.$/i.exec(card.rules[0].replace(/\s+/g, " ").trim())?.[1] : undefined);
      if (!limits[0] || !limits.every((limit) => limit === limits[0])) return null;
      const limit = Number(limits[0]); const details = action.details.map(clean);
      for (let index = 0; index < details.length; index++) {
        const discard = /^(.+?) discarded (a|\d+) cards?$/i.exec(details[index]);
        if (discard) {
          if (![input.selfPlayerName, input.opponentPlayerName].includes(discard[1])) return null;
          const names = action.details[++index]?.trim();
          if (!names || !/^[•-]/.test(names) || clean(names).split(",").length !== count(discard[2])) return null;
        } else if (!/^.+? (?:was|were) discarded from (.+?)['’]s (.+)$/i.test(details[index])) return null;
      }
      return limit;
    };
    const benchLimit = departingBenchLimit();
    const discardBenchTops = (actor: ReplayActor, names: string[], amount: number) => {
      const side = next[actor];
      if (names.length !== amount || side.activeUncertain || side.unplaced?.length || side.bench.length - amount !== benchLimit) throw new BoardCardUnresolved("The recorded Bench reduction does not match the departed Stadium's limit.");
      for (const name of names) {
        const card = findCard(side, name, "Bench");
        if (!stackComplete(side, card)) throw new BoardCardUnresolved("The discarded Bench Pokémon's complete stack is not established.");
        const cards = [topCardEvidence(id(), card), ...card.underlying, ...card.energy.map((energy) => zoneCard(id(), /Energy$/i.test(energy) ? energy : `Basic ${energy} Energy`)), ...(card.tool ? [zoneCard(id(), card.tool)] : []), ...takeSoleMemberCards(actor, card.id)];
        side.bench = side.bench.filter((entry) => entry.id !== card.id);
        if (card.physicalCardId) retainedTops.delete(card.physicalCardId);
        for (const retained of retainedTops.values()) if (retained.actor === actor) retained.memberIds = retained.memberIds.filter((member) => member !== card.id);
        addDiscard(actor, cards, "board"); stage("discard", "Discard", cards, actor);
      }
      refreshBoardPools(actor, "discard", true, true); mutationCount++; return true;
    };
    const parseLine = (raw: string, detailIndex: number): boolean => {
      const line = clean(raw).replace(/^(.+?)['’]s (.+?) healed (\d+) damage$/i, "$1 healed $3 damage from $1's $2").replace(/^(.*?) attached (.+?) from (?:their |the )?(hand|deck|discard pile) to (.+)$/i, "$1 attached $2 to $4 from $3");
      let match: RegExpMatchArray | null;
      if (/^Cards revealed from Mulligan\s*\d+:?$/i.test(line)) { cardList(detailIndex); return true; }
      if ((match = line.match(/^(.+?) drew (a|\d+) more cards? because (.+?) took at least (a|\d+) mulligans?$/i))) {
        actorFor(match[3]); const actor = actorFor(match[1]); const amount = count(match[2]); draw(actor, amount, []); bonusDraw = { actor, amount, annotated: 0 }; mutationCount++; return true;
      }
      if (/^.+? chose /i.test(line)) { actorFor(line.split(" chose ")[0]); return true; }
      if ((match = line.match(/^(.+?) drew (a|\d+) cards? and played them to (?:the )?Bench$/i))) {
        const actor = actorFor(match[1]); const names = cardList(detailIndex); const amount = count(match[2]);
        if (names.length > amount) throw new Unresolved("The Pokémon list exceeds the recorded Bench search count.");
        if (names.length < amount) { markUncertain(actor, ["board"], false); next.partial = true; errors.push("Some Pokémon placed on the Bench are not identified."); }
        const cards = names.map((name) => pokemon(physicalId(), name)); next[actor].bench.push(...cards);
        next[actor].deckCount = changeCount(next[actor].deckCount, -amount, ["deck"]);
        transferCounts(actor, "deck", "board", amount);
        stage("bench", "Bench", cards, actor, amount - cards.length); mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?) drew (.+?) and played (?:it|them) to (?:the )?Bench$/i))) {
        const actor = actorFor(match[1]); const cards = match[2].split(",").map((name) => pokemon(physicalId(), name.trim()));
        next[actor].bench.push(...cards); next[actor].deckCount = changeCount(next[actor].deckCount, -cards.length, ["deck"]);
        transferCounts(actor, "deck", "board", cards.length);
        stage("bench", "Bench", cards, actor); mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?) took (?:a |an |\d+ )?mulligans?$/i))) {
        const actor = actorFor(match[1]); const side = next[actor];
        side.deckCount = side.handCount === null ? null : changeCount(side.deckCount, side.handCount);
        changedCountZones[actor].add("hand"); changedCountZones[actor].add("deck");
        stage("shuffle", "Mulligan", side.knownHand, actor, side.handCount === null ? undefined : side.handCount - side.knownHand.length);
        side.handCount = 0; side.knownHand = []; clearUncertain(actor, "hand");
        if (implicitMulligans.has(line)) draw(actor, 7, [], true); mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?) was switched with (.+?) to become the Active Pok[eé]mon$/i))) {
        const outgoing = ownerAndName(match[2]); const incoming = ownerAndName(match[1], outgoing.actor);
        if (incoming.actor !== outgoing.actor) throw new Unresolved("A switch cannot exchange opposing Pokémon.");
        findCard(next[outgoing.actor], outgoing.name, "Active Spot");
        promote(incoming.actor, incoming.name); label = "Switch"; mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?) is now in the Active Spot$/i))) {
        const target = ownerAndName(match[1], lastPromotionActor ?? undefined);
        promote(target.actor, target.name, true); mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?)['’]s (.+?) took (\d+) damage(?: from .+)?$/i))) {
        const actor = actorFor(match[1]); const amount = Number(match[3]);
        const annotation = allCards(next[actor]).filter((card) => card.name === match![2] && damageApplied.get(card.id) === amount);
        const position = secondaryDamagePosition(actor, amount);
        const card = !position && annotation.length === 1 ? annotation[0] : findCard(next[actor], match[2], position);
        if (damageApplied.has(card.id)) {
          if (damageApplied.get(card.id) !== amount) throw new Unresolved("The damage detail contradicts the recorded attack.");
          return true;
        }
        card.damage += amount; damageApplied.set(card.id, amount); attackDamage = amount;
        stage("damage", `${amount} damage`, [card], actor); mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?) (?:was|were) added to (.+?)['’]s hand$/i))) {
        const actor = actorFor(match[2]);
        const numeric = /^(a|\d+) cards?$/i.exec(match[1]);
        const names = numeric ? cardList(detailIndex) : match[1].split(",").map((name) => name.trim());
        const amount = numeric ? count(numeric[1]) : names.length;
        if (names.length > amount) throw new Unresolved("The added cards exceed their recorded count.");
        const origin = effectOrigin(raw, detailIndex);
        const pending = pendingPrizeAnnotations[actor];
        const prizeAnnotation = !prizeAction && !origin && pending?.section === action.sourceSectionIndex && pending.remaining >= amount;
        if (!prizeAction && !prizeAnnotation && !origin) {
          const following = actions[actionIndex + 1]; const take = following && /^(.+?) took (a|\d+) Prize cards?$/i.exec(clean(following.sourceTitle));
          if (following?.sourceSectionIndex === action.sourceSectionIndex && take && actorFor(take[1]) === actor) {
            const earlier = earlyPrizeAnnotations.get(actionIndex + 1) ?? { amount: 0, names: [] };
            if (earlier.amount + amount > count(take[2])) throw new Unresolved("Prize identities preceding the count exceed its recorded quantity.");
            earlyPrizeAnnotations.set(actionIndex + 1, { amount: earlier.amount + amount, names: [...earlier.names, ...names.filter((name) => !/^a card$/i.test(name))] }); return true;
          }
        }
        if (prizeAction || prizeAnnotation) {
          if (prizeAction && prizeCardsAdded + amount > prizeAmount) throw new Unresolved("The recorded Prize card list exceeds the Prize count.");
          if (prizeAction) prizeCardsAdded += amount;
          if (pendingPrizeAnnotations[actor]) pendingPrizeAnnotations[actor]!.remaining -= amount;
        } else {
          if (origin === "deck" || origin === "discard") {
            transferCounts(actor, origin, "hand", amount);
            if (origin === "deck") next[actor].deckCount = changeCount(next[actor].deckCount, -amount);
            else takeDiscard(actor, names);
          } else {
            // An addition proves its destination quantity, but not which of
            // the other physical zones supplied those cards.
            markUncertain(actor, ["deck", "board", "discard", "prizes"]); next.partial = true;
            errors.push("The added cards' source zone is not established.");
          }
          changedCountZones[actor].add("hand");
          next[actor].handCount = changeCount(next[actor].handCount, amount, ["hand"]);
        }
        const cards = names.filter((name) => !/^a card$/i.test(name)).map((name) => zoneCard(id(), name));
        next[actor].knownHand.push(...cards);
        const prizeStage = prizeAction ? stages.find((item) => item.label === "Take Prize" && item.actor === actor) : undefined;
        if (prizeStage) {
          prizeStage.cards.push(...cards);
          if (prizeAmount > prizeStage.cards.length) prizeStage.hiddenCount = prizeAmount - prizeStage.cards.length;
          else delete prizeStage.hiddenCount;
        } else stage("return", "To hand", cards, actor, amount - cards.length);
        mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?) (?:moved|returned|put) (.+?) from (?:their |the )?(discard pile|hand|deck) (?:in|into|to) (?:their |the )?(hand|deck)$/i))) {
        const actor = actorFor(match[1]); const item = ownerAndName(match[2], actor);
        const numeric = /^(a|\d+) cards?$/i.exec(item.name);
        const names = numeric ? cardList(detailIndex) : item.name.split(",").map((name) => name.trim());
        const amount = numeric ? count(numeric[1]) : names.length;
        if (item.actor !== actor) throw new Unresolved("The source and destination owners of the recovery disagree.");
        transfer(actor, names, amount, match[3] === "discard pile" ? "discard" : match[3], match[4]); return true;
      }
      if ((match = line.match(/^(.+?) put (a|\d+) cards? on top of their deck$/i))) {
        const actor = actorFor(match[1]); const context = effectContext();
        const plan = context ? hp.effectConstraints(context.card, context.name, context.kind, "stadium_activation") : null;
        const amount = count(match[2]);
        if (!context || context.actor !== actor || next.stadium?.name !== context.card.name || plan?.status !== "known" || plan.operation !== "stadium_activation"
          || plan.movements.length !== 1 || plan.movements[0].origin !== "hand" || plan.movements[0].destination !== "deck" || plan.movements[0].quantity !== amount) throw new Unresolved("The top-deck placement's hand origin is not established by the current Stadium rules.");
        transfer(actor, [], amount, "hand", "deck"); mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?) moved (.+?) to (?:their |the )?(hand|deck)$/i))) {
        const mover = [input.selfPlayerName, input.opponentPlayerName].includes(match[1]) ? actorFor(match[1]) : undefined;
        const target = ownerAndName(match[2], mover);
        const origin = effectOrigin(raw, detailIndex);
        if (!origin && match[3] === "hand" && devolutionActor === target.actor && mover === target.actor) {
          const names = target.name.split(",").map((name) => name.trim()); const annotated = [...devolutionReturned];
          for (const name of names) { const index = annotated.indexOf(name); if (index < 0) throw new CountConflict("The named devolution return is not established by its layer alternatives.", ["board", "hand"]); annotated.splice(index, 1); }
          devolutionReturned = annotated; return true;
        }
        if (!origin && match[3] === "hand") {
          const context = effectContext(); const plan = context ? hp.effectConstraints(context.card, context.name, context.kind, "return_energy") : null;
          if (context && plan?.status === "known" && plan.operation === "return_energy" && healed?.actor === target.actor && context.actor === target.actor) {
            const card = allCards(next[target.actor]).find((card) => card.id === healed!.id);
            const numeric = /^(a|\d+) cards?$/i.exec(target.name); const names = numeric ? cardList(detailIndex) : target.name.split(",").map((name) => name.trim()); const amount = numeric ? count(numeric[1]) : names.length;
            if (!card) throw new Unresolved("The healed Pokémon is no longer in play.");
            const energyPools = (next[target.actor].boardPools ?? []).filter((pool) => pool.memberIds.includes(card.id) && pool.cards.some((component) => component.boardRole === "energy" || /Energy$/i.test(component.name)));
            const soleEnergy = energyPools.filter((pool) => pool.memberIds.length === 1).flatMap((pool) => pool.cards.filter((component) => component.boardRole === "energy" || /Energy$/i.test(component.name)));
            const knownAmount = card.energy.length + soleEnergy.length;
            if (amount < knownAmount || stackComplete(next[target.actor], card) && energyPools.every((pool) => pool.memberIds.length === 1) && amount !== knownAmount || names.some((name) => !/Energy$/i.test(name))) throw new CountConflict("The recorded Energy return conflicts with the healed Pokémon's confirmed attachments.", ["board", "hand"]);
            const available = [...card.energy, ...soleEnergy.map((component) => component.name.replace(/^Basic (.+) Energy$/i, "$1"))];
            for (const name of stackComplete(next[target.actor], card) ? names : []) {
              const energy = name.replace(/^Basic (.+) Energy$/i, "$1"); const index = available.indexOf(energy);
              if (index < 0) throw new Unresolved("The returned Energy names contradict the healed Pokémon's attachments.");
              available.splice(index, 1);
            }
            const remaining = [...names];
            for (const energy of card.energy) {
              const name = /Energy$/i.test(energy) ? energy : `Basic ${energy} Energy`; const index = remaining.indexOf(name);
              if (index >= 0) remaining.splice(index, 1);
            }
            const pooled = takePooledCards(target.actor, [card.id], remaining, "hand");
            // Numeric return-all details can hide names. The uniquely attached
            // Energy is still confirmed to have returned and retains its ID.
            for (const pool of energyPools.filter((pool) => pool.memberIds.length === 1)) {
              const extra = pool.cards.filter((component) => component.boardRole === "energy" || /Energy$/i.test(component.name));
              pool.cards = pool.cards.filter((component) => !extra.includes(component)); pooled.push(...extra);
            }
            card.energy = []; transferCounts(target.actor, "board", "hand", amount);
            if (card.knownStackSize !== undefined) card.knownStackSize -= amount;
            next[target.actor].handCount = changeCount(next[target.actor].handCount, amount, ["board", "hand"]);
            const annotated = [...names];
            const extraNames = pooled.filter((component) => { const index = annotated.indexOf(component.name); if (index < 0) return true; annotated.splice(index, 1); return false; }).map((component) => component.name);
            const cards = recordedZoneCards([...names, ...extraNames], pooled); next[target.actor].knownHand.push(...cards);
            stage("return", "Return Energy", cards, target.actor, amount - cards.length); mutationCount++; return true;
          }
        }
        const returnedCount = /^(a|\d+) cards?$/i.exec(target.name);
        const returnedNames = returnedCount ? cardList(detailIndex) : target.name.split(",").map((name) => name.trim());
        if ((!origin || origin === "board") && returnAttachedEnergy(target.actor, returnedNames, returnedCount ? count(returnedCount[1]) : returnedNames.length, match[3] as "hand" | "deck")) return true;
        if (!origin) throw new Unresolved("The recovered cards' origin is not recorded or established by effect metadata.");
        const numeric = /^(a|\d+) cards?$/i.exec(target.name);
        const names = numeric ? cardList(detailIndex) : target.name.split(",").map((name) => name.trim());
        transfer(target.actor, names, numeric ? count(numeric[1]) : names.length, origin, match[3]); return true;
      }
      if ((match = line.match(/^(.+?) shuffled (.+?)(?: from (?:their |the )?(hand|discard pile))? into their deck$/i))) {
        const actor = actorFor(match[1]);
        if (match[2] === "their hand") {
          const side = next[actor]; const names = cardList(detailIndex);
          if (names.length && side.handCount !== null && names.length !== side.handCount) throw new CountConflict("The full-hand shuffle list contradicts the hand count.");
          const amount = side.handCount ?? (names.length || null);
          stage("shuffle", "Shuffle hand", names.length ? names.map((name) => zoneCard(id(), name)) : side.knownHand, actor,
            amount === null ? undefined : amount - (names.length || side.knownHand.length));
          side.deckCount = amount === null ? null : changeCount(side.deckCount, amount);
          changedCountZones[actor].add("hand"); changedCountZones[actor].add("deck");
          side.handCount = 0; side.knownHand = []; clearUncertain(actor, "hand"); mutationCount++; return true;
        }
        const numeric = /^(a|\d+) cards?$/i.exec(match[2]);
        const names = numeric ? cardList(detailIndex) : match[2].split(",").map((name) => name.trim());
        const origin = match[3] === "discard pile" ? "discard" : match[3] ?? effectOrigin(raw, detailIndex);
        if ((!origin || origin === "board") && returnAttachedEnergy(actor, names, numeric ? count(numeric[1]) : names.length, "deck")) return true;
        if (!origin && boardShuffleActivation?.actor === actor) {
          const card = allCards(next[actor]).find((card) => card.id === boardShuffleActivation!.cardId);
          const amount = numeric ? count(numeric[1]) : names.length;
          if (!card || names.length > amount || !names.includes(card.name)) throw new Unresolved("The returned physical Pokémon stack is not established by the recorded card list.");
          const completeStack = stackComplete(next[actor], card);
          const physical = [topCardEvidence(id(), card), ...card.underlying, ...card.energy.map((energy) => zoneCard(id(), /Energy$/i.test(energy) ? energy : `Basic ${energy} Energy`)), ...(card.tool ? [zoneCard(id(), card.tool)] : []), ...takeSoleMemberCards(actor, card.id)];
          if (amount < physical.length) throw new CountConflict("The returned quantity is smaller than its confirmed physical components.", ["board", "deck"]);
          if (completeStack) {
            if (amount !== physical.length) throw new CountConflict("The returned stack quantity contradicts the known physical stack.", ["board", "deck"]);
            const available = physical.map((item) => item.name);
            for (const name of names) { const index = available.indexOf(name); if (index < 0) throw new Unresolved("The returned card names contradict the known physical stack."); available.splice(index, 1); }
          }
          next[actor].deckCount = changeCount(next[actor].deckCount, amount, ["board", "deck"]); transferCounts(actor, "board", "deck", amount);
          if (next[actor].active?.id === card.id) next[actor].active = null;
          next[actor].bench = next[actor].bench.filter((candidate) => candidate.id !== card.id);
          next[actor].unplaced = next[actor].unplaced?.filter((candidate) => candidate.id !== card.id);
          const remaining = [...names];
          for (const component of physical) { const index = remaining.indexOf(component.name); if (index >= 0) remaining.splice(index, 1); }
          const pooled = takePooledCards(actor, [card.id], remaining, "deck");
          const unmatched = [...names];
          const missing = physical.filter((item) => { const index = unmatched.indexOf(item.name); if (index < 0) return true; unmatched.splice(index, 1); return false; });
          const cards = !completeStack ? recordedZoneCards([...names, ...missing.map((item) => item.name)], [...physical, ...pooled]) : physical;
          refreshBoardPools(actor, "deck", names.length === amount && cards.length === amount, true);
          stage("shuffle", "Return Pokémon stack", cards, actor, amount - cards.length); mutationCount++; return true;
        }
        if (!origin) throw new Unresolved("The shuffled cards' origin is not recorded.");
        transfer(actor, names, numeric ? count(numeric[1]) : names.length, origin, "deck"); return true;
      }
      if ((match = line.match(/^(.+?) shuffled their hand$/i))) { actorFor(match[1]); return true; }
      if ((match = line.match(/^(.+?) put (a|\d+) cards? on the bottom of their deck$/i))) {
        const actor = actorFor(match[1]);
        const preceding = detailIndex > 0 ? clean(action.details[detailIndex - 1]) : "";
        const origin = preceding === `${match[1]} shuffled their hand` ? "hand" : effectOrigin(raw, detailIndex);
        if (origin !== "hand") throw new Unresolved("The cards placed on the bottom of the deck have no established hand origin.");
        transfer(actor, cardList(detailIndex), count(match[2]), origin, "deck"); return true;
      }
      if ((match = line.match(/^(.+?) shuffled their deck$/i))) { actorFor(match[1]); return true; }
      if ((match = line.match(/^(.+?) discarded (.+?)(?: from (?:their |the )?(hand|deck))?$/i)) && [input.selfPlayerName, input.opponentPlayerName].includes(match[1]) && !/^(?:a|\d+) cards?$/i.test(match[2])) {
        const actor = actorFor(match[1]); const names = match[2].split(",").map((name) => name.trim());
        const context = effectContext();
        const attackEvidence = context?.kind === "attack" ? hp.resolve({ ...context.card, observedEffects: [...(context.card.observedEffects ?? []), context.name ?? ""] }) : null;
        // A copied attack's printed source clause establishes the discarded
        // card's origin. A named detail alone cannot imply hand or deck.
        const printedDeckDiscard = detailIndex >= 0 && names.length === 1 && context?.actor === actor && context.kind === "attack"
          && attackEvidence?.coverage === "complete" && attackEvidence.candidates.length > 0
          && attackEvidence.candidates.every((candidate) => {
            const attacks = candidate.attacks.filter((attack) => normalizeText(attack.name) === normalizeText(context.name ?? ""));
              return attacks.length === 1 && attacks[0].text !== null && /^Discard the top card of your deck(?:,|\.)/i.test(attacks[0].text)
              && /choose 1 of (?:that card['’]s|its) attacks/i.test(attacks[0].text);
          });
        const origin: "hand" | "deck" = match[3] === "hand" || match[3] === "deck" ? match[3] : printedDeckDiscard ? "deck" : "hand";
        const cards: ReplayZoneCard[] = [];
        for (const name of names) {
          const already = discardedThisAction.findIndex((item) => item.actor === actor && item.name === name);
          if (already >= 0) { discardedThisAction.splice(already, 1); continue; }
          if (next.stadium?.name === name) {
            addDiscard(next.stadium.actor, [zoneCard(id(), name)], "board"); next.stadium = null; continue;
          }
          if (origin === "deck") { next[actor].deckCount = changeCount(next[actor].deckCount, -1, ["deck"]); cards.push(zoneCard(id(), name)); }
          else cards.push({ ...zoneCard(id(), name), ...removeHand(next[actor], [name], 1, "discard")[0] });
        }
        addDiscard(actor, cards, origin); stage("discard", "Discard", cards, actor); mutationCount++; return true;
      }
      if (/^Effects of .+? did not affect .+$/i.test(line) || /^Damage to .+? was prevented$/i.test(line)) return true;
      if (/\bwas activated$/i.test(line)) {
        // Activation identifies an effect boundary, not a new attachment or a
        // hidden rule. Only subsequent recorded details mutate state.
        label = "Effect"; return true;
      }
      if ((match = line.match(/^(.+?) played (.+?) to (?:the )?(Active Spot|Bench)$/i))) {
        const actor = actorFor(match[1]); const side = next[actor]; const card = pokemon(physicalId(), match[2]);
        if (match[3] === "Active Spot" && side.active) throw new Unresolved("The Active Spot is already occupied.");
        Object.assign(card, removeHand(side, [match[2]], 1, "board")[0]);
        transferCounts(actor, "hand", "board", 1);
        if (match[3] === "Active Spot") { side.active = card; card.activeEpisodeId = `active:${actor}:${actionIndex}:${currentLineOrdinal}`; } else side.bench.push(card);
        stage("bench", match[3], [card], actor); label = "Pokémon"; mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?) devolved (.+?)['’]s (.+?) to (.+?) (?:in|on) the (Active Spot|Bench)$/i))) {
        const actor = actorFor(match[1]); const owner = actorFor(match[2]); const context = effectContext();
        const plan = context ? hp.effectConstraints(context.card, context.name, context.kind, "devolve") : null;
        const candidates = allCards(next[owner]).filter((card) => card.name === match![3]);
        if (!context || context.actor !== actor || owner !== actor || plan?.status !== "known" || plan.operation !== "devolve" || !candidates.length
          || plan.pokemonType && candidates.some((card) => { const found = hp.resolve(card); return found?.coverage !== "complete" || !found.candidates.length || found.candidates.some((printing) => !printing.types?.includes(plan.pokemonType!)); })) throw new Unresolved("The recorded devolution's owner or Pokémon type is not established by complete effect evidence.");
        const options = candidates.map((card) => {
          const index = card.underlying.findLastIndex((layer) => layer.name === match![4]);
          return index < 0 ? null : { card, base: card.underlying[index], returned: [card.name, ...card.underlying.slice(index + 1).map((layer) => layer.name)] };
        });
        const ids = candidates.map((card) => card.id);
        if (options.some((option) => option === null) || (next[actor].boardPools ?? []).some((pool) => pool.memberIds.some((id) => ids.includes(id)) && (pool.possiblyReturnedCards?.length || pool.cards.some((card) => card.boardRole === "evolution")))) throw new CountConflict("The devolution's existing layer assignment is unresolved.", ["board", "hand"]);
        const complete = options.filter((option) => option !== null);
        if (complete.some((option) => { const found = hp.resolve(option.base); return found?.coverage !== "complete" || !found.candidates.length || found.candidates.some((printing) => printing.stage !== "Basic"); })) throw new CountConflict("A devolution to a non-Basic or unidentified endpoint needs an additional prefix-layer assignment model.", ["board", "hand"]);
        const commonReturned = [...complete[0].returned];
        for (const option of complete.slice(1)) {
          const remaining = [...option.returned];
          for (let index = commonReturned.length - 1; index >= 0; index--) { const at = remaining.indexOf(commonReturned[index]); if (at < 0) commonReturned.splice(index, 1); else remaining.splice(at, 1); }
        }
        const possibleReturned = [...commonReturned];
        for (const option of complete) {
          const remaining = [...possibleReturned];
          for (const name of option.returned) { const at = remaining.indexOf(name); if (at >= 0) remaining.splice(at, 1); else possibleReturned.push(name); }
        }
        const bases = complete.map((option) => option.base); const originalId = candidates[0].id;
        uncertainCopies(actor, candidates);
        // Every physical layer remains represented, while copy assignment is
        // pooled; devolution never removes attached Energy or Tools.
        const stillLocal = candidates.flatMap((card) => card.underlying.map((layer) => ({ ...layer, boardRole: "evolution" as const })));
        candidates.forEach((card) => { card.underlying = []; }); addBoardPool(actor, candidates, stillLocal);
        const basis = takePooledCards(actor, ids, [match[4]])[0];
        if (!basis) throw new CountConflict("The recorded devolution's base card is missing from its physical inventory.", ["board", "hand"]);
        const card = candidates[0]; const basisFields = { ...basis }; delete basisFields.boardRole;
        if (!bases.every((base) => base.setId === bases[0].setId && base.localId === bases[0].localId)) { delete basisFields.setId; delete basisFields.localId; }
        basisFields.observedEffects = (bases[0].observedEffects ?? []).filter((effect) => bases.every((base) => base.observedEffects?.includes(effect)));
        delete card.setId; delete card.localId; Object.assign(card, basisFields); delete card.physicalCardId; delete card.definitionKey; delete card.knownStackSize; card.damageKnown = false; card.instanceUncertain = true;
        for (const pool of next[actor].boardPools ?? []) pool.memberIds = pool.memberIds.map((id) => id === originalId ? card.id : id);
        const memberIds = candidates.map((card) => card.id);
        const commonLayers = [...commonReturned]; commonLayers.splice(commonLayers.indexOf(match[3]), 1);
        const moved = takePooledCards(actor, memberIds, commonLayers);
        const returned = [zoneCard(id(), match[3]), ...moved]; const priorHand = [...next[actor].knownHand];
        const optional = [...possibleReturned]; for (const name of commonReturned) optional.splice(optional.indexOf(name), 1);
        const optionalCards = takePooledCards(actor, memberIds, optional);
        if (optionalCards.length) {
          const pool = next[actor].boardPools!.find((pool) => pool.memberIds.some((id) => memberIds.includes(id)))!;
          pool.possiblyReturnedCards = [...(pool.possiblyReturnedCards ?? []), ...optionalCards];
        }
        // A confirmed Basic endpoint cannot hold the older Evolution layers.
        // Keep its unchanged Energy/Tool possibilities separate from the
        // layers that can still belong only to the surviving evolved copies.
        const evolutionPools: NonNullable<ReplaySide["boardPools"]> = [];
        for (const pool of next[actor].boardPools ?? []) {
          if (!pool.memberIds.some((id) => memberIds.includes(id))) continue;
          const evolutionCards = pool.cards.filter((component) => component.boardRole === "evolution");
          const possible = pool.possiblyReturnedCards ?? [];
          if (!evolutionCards.length && !possible.length) continue;
          pool.cards = pool.cards.filter((component) => component.boardRole !== "evolution"); delete pool.possiblyReturnedCards;
          evolutionPools.push({ id: id(), memberIds: candidates.slice(1).map((card) => card.id), cards: evolutionCards,
            ...(possible.length ? { possiblyReturnedCards: possible } : {}), ...(pool.memberEvidence?.length ? { memberEvidence: [...pool.memberEvidence] } : {}) });
        }
        next[actor].boardPools!.push(...evolutionPools);
        devolutionActor = actor; devolutionReturned = [...commonReturned];
        const quantityKnown = complete.every((option) => option.returned.length === commonReturned.length);
        const modifierKnowledge = next[actor].hpModifiersKnown;
        if (quantityKnown) { transferCounts(actor, "board", "hand", returned.length); next[actor].handCount = changeCount(next[actor].handCount, returned.length, ["board", "hand"]); }
        else { markUncertain(actor, ["board", "hand"]); next.partial = true; errors.push("The devolution's returned quantity has multiple source-compatible layer alternatives."); }
        markUncertain(actor, ["board"], false); next[actor].hpModifiersKnown = modifierKnowledge;
        next[actor].knownHand = [...priorHand, ...returned];
        stage("return", "Evolution return", returned, actor); stage("evolve", "Recorded devolution", [card], actor); label = "Devolve"; mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?) evolved (.+?) to (.+?) (?:in|on) the (Active Spot|Bench)$/i))) {
        const actor = actorFor(match[1]); const card = findEvolutionCard(actor, match[2], match[4]);
        stage("before", "From", [card], actor);
        const newTopId = physicalId();
        card.underlying.push(topCardEvidence(newTopId, card));
        if (card.knownStackSize !== undefined) card.knownStackSize++;
        delete card.setId; delete card.localId; delete card.definitionKey;
        Object.assign(card, zoneCard(card.id, match[3]), { physicalCardId: newTopId, hp: null, conditions: [], abilityUsed: false, observedEffects: [] });
        const evolutionContext = detailIndex >= 0 ? effectContext() : null;
        const evolutionRecipe = evolutionContext && hp.resolve(evolutionContext.card);
        const handRecipe = evolutionRecipe?.coverage === "complete" && evolutionRecipe.candidates.length > 0 && evolutionRecipe.candidates.every((candidate) => candidate.category === "Trainer" && candidate.rules?.length === 1 && isReplayHandEvolutionText(candidate.rules[0]));
        const evolutionOrigin = effectOrigin(raw, detailIndex) ?? (detailIndex < 0 || handRecipe ? "hand" : undefined);
        if (evolutionOrigin === "deck") next[actor].deckCount = changeCount(next[actor].deckCount, -1, ["deck", "board"]);
        else if (evolutionOrigin === "hand") Object.assign(card, removeHand(next[actor], [match[3]], 1, "board")[0]);
        else throw new Unresolved("The evolution card's source zone is not established.");
        transferCounts(actor, evolutionOrigin, "board", 1); lastEvolution.set(card.id, action.sourceSectionIndex); stage("evolve", "Evolve", [card], actor);
        // A normal standalone evolution is played from Hand. Effect-driven
        // evolution requires explicit Hand origin or a complete agreed native
        // Hand-evolution recipe. A deck/unsupported recipe cannot mint a token.
        const origin = effectOrigin(raw, detailIndex);
        const context = detailIndex >= 0 ? effectContext() : null;
        const recipe = context ? hp.resolve(context.card) : null;
        const verifiedHandRecipe = recipe?.coverage === "complete" && recipe.candidates.length > 0 && recipe.candidates.every((candidate) =>
          candidate.category === "Trainer" && candidate.rules?.length === 1 && isReplayHandEvolutionText(candidate.rules[0]));
        const fromHand = origin === "hand" || origin === undefined && (detailIndex < 0 || verifiedHandRecipe);
        if (fromHand && action.actor === actor && action.turn > 0 && card.physicalCardId) handEvolutionEntries.set(card.physicalCardId, { actor, name: card.name, event: actionIndex, ordinal: detailIndex, section: action.sourceSectionIndex });
        label = "Evolve"; mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?) attached (.+?) to (.+?) (?:in|on) the (Active Spot|Bench)(?: from (?:their |the )?(hand|deck|discard pile))?$/i))) {
        const actor = actorFor(match[1]); const side = next[actor]; const card = findCard(side, match[3], match[4]);
        const isEnergy = /Energy$/i.test(match[2]);
        const isTool = effectTag(raw) === "tool" || (effectTag(action.sourceTitle) === "tool" && clean(action.sourceTitle).includes(match[2]));
        if (!isEnergy && !isTool) throw new Unresolved("The attachment type is not recorded.");
        if (isTool && card.tool) throw new Unresolved("An existing Tool must be explicitly removed before replacement.");
        // A standalone manual attachment is from hand; an effect detail needs its origin stated.
        const origin = match[5] ?? effectOrigin(raw, detailIndex) ?? (detailIndex < 0 || next.playedCard?.actor === actor && next.playedCard.card.name === match[2] ? "hand" : undefined);
        if (!origin) throw new CountConflict("The effect's attachment origin is not recorded.", ["board", "hand", "deck", "discard"]);
        if (origin === "board") {
          const context = effectContext(); const plan = context ? hp.effectConstraints(context.card, context.name, context.kind, "move_energy") : null;
          if (!context || context.actor !== actor || plan?.status !== "known" || plan.operation !== "move_energy" || !/^Basic .+ Energy$/.test(match[2])) throw new CountConflict("The recorded board Energy movement is not established by complete effect evidence.", ["board"]);
          const energy = match[2].replace(/^Basic (.+) Energy$/i, "$1");
          const donors = allCards(side).filter((donor) => donor.id !== card.id && (donor.energy.includes(energy) || (side.boardPools ?? []).some((pool) => pool.memberIds.includes(donor.id) && pool.cards.some((component) => component.name === match![2]))));
          if (!donors.length) throw new CountConflict("The distinct donor of the recorded Basic Energy is not present in the board inventory.", ["board"]);
          if (donors.length === 1 && donors[0].energy.includes(energy)) {
            const donor = donors[0]; donor.energy.splice(donor.energy.indexOf(energy), 1); if (donor.knownStackSize !== undefined) donor.knownStackSize--;
            card.energy.push(energy); if (card.knownStackSize !== undefined) card.knownStackSize++;
          } else {
            const pooled: ReplayZoneCard[] = [];
            for (const donor of donors) {
              while (donor.energy.includes(energy)) { donor.energy.splice(donor.energy.indexOf(energy), 1); pooled.push({ ...zoneCard(id(), match[2]), boardRole: "energy" }); }
              donor.instanceUncertain = true; delete donor.knownStackSize;
            }
            addBoardPool(actor, donors, pooled);
            const moved = takePooledCards(actor, donors.map((donor) => donor.id), [match[2]]);
            addBoardPool(actor, [card], moved);
          }
          stage("attach", "Move Basic Energy", [zoneCard(id(), match[2])], actor); label = "Attach"; mutationCount++; return true;
        }
        if (origin === "hand") {
          if (!(detailIndex >= 0 && next.playedCard?.actor === actor && next.playedCard.card.name === match[2])) removeHand(side, [match[2]], 1, "board");
        } else if (origin === "deck") side.deckCount = changeCount(side.deckCount, -1, ["deck"]);
        else {
          takeDiscard(actor, [match[2]]);
        }
        if (!(origin === "hand" && detailIndex >= 0 && next.playedCard?.actor === actor && next.playedCard.card.name === match[2])) {
          transferCounts(actor, origin === "discard pile" ? "discard" : origin as CountZone, "board", 1);
        }
        if (isTool) card.tool = match[2]; else card.energy.push(match[2].replace(/^Basic (.+) Energy$/i, "$1"));
        if (card.knownStackSize !== undefined) card.knownStackSize++;
        stage("attach", "Attach", [zoneCard(id(), match[2])], actor); stage("move", `To ${card.name}`, [card], actor);
        label = "Attach"; mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?) retreated (.+?) to (?:the )?Bench$/i))) {
        const actor = actorFor(match[1]); const side = next[actor]; retreating = findCard(side, match[2], "Active Spot");
        stage("move", "Out", [retreating], actor); retreating.conditions = []; delete retreating.activeEpisodeId; delete retreating.activePrintingEffects;
        side.bench.push(retreating); side.active = null; label = "Retreat"; mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?)['’]s (.+?) is now in the Active Spot$/i))) {
        promote(actorFor(match[1]), match[2], true); mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?)['’]s (.+?) used (.+?) on (.+?)['’]s (.+?) for (\d+)\+? damage(?:\. (.+))?$/i))) {
        const actor = actorFor(match[1]); const targetActor = actorFor(match[4]);
        const attacker = findCard(next[actor], match[2], "Active Spot");
        attackDamage = Number(match[6]);
        const printingEvidence = attackPrintingEvidence(attacker, match[3], next);
        const definitionCard = printingEvidence.status === "copied" ? printingEvidence.definitionCard : attacker;
        // Rule contract §6: the source attack damage hits the defending Active
        // unless its named target differs. This target fact does not require
        // missing attack prose to be treated as empty or prove native printing.
        const targetPosition = actor !== targetActor && next[targetActor].active?.name === match[5] && !next[targetActor].activeUncertain && sourceAttackTargetsActive(attacker, match[3], next) ? "Active Spot"
          : actor !== targetActor && printingEvidence.status !== "unmodelled" && (ordinaryAttackTargetsActive(attacker, match[3], next)
            || match[7] && /^.+? took [−+-]?\d+ more damage because of .+? Weakness$/i.test(match[7]) && weaknessTargetsActive(next, definitionCard, match[3])) ? "Active Spot" : undefined;
        const target = findCard(next[targetActor], match[5], targetPosition);
        if (match[7] && !/^.+? took [−+-]?\d+ (?:more damage because of .+? Weakness|less damage because of .+? Resistance)$/i.test(match[7])) return false;
        if (printingEvidence.status !== "unmodelled" && printingEvidence.observedEffect) observeEffect(attacker, printingEvidence.observedEffect);
        else if (printingEvidence.status === "unmodelled" && hp.resolve(attacker)?.coverage === "complete") { next.partial = true; errors.push("The executed attack is recorded, but its native or copied printing provenance is not established."); }
        target.damage += attackDamage; damageApplied.set(target.id, attackDamage);
        stage("attack", match[3], [attacker], actor); stage("damage", `${attackDamage} damage`, [target], targetActor);
        if (printingEvidence.status === "copied") copiedAttackContexts.set(attackContextKey(actor, attacker, match[3]), printingEvidence.definitionCard);
        label = "Attack"; mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?)['’]s (.+?) used (?:its )?Ability(?::|\s)\s*(.+)$/i))) {
        const actor = actorFor(match[1]); const card = findAbilityCard(next[actor], match[2], match[3], next);
        card.abilityUsed = true; observeEffect(card, match[3]); stage("ability", match[3], [card], actor);
        label = "Ability"; mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?)['’]s (.+?) used (.+)$/i))) {
        const actor = actorFor(match[1]); const kind = effectTag(raw);
        if (kind !== "ability" && kind !== "attack") throw new Unresolved("The source does not identify a supported attack or a catalog-validated Ability.");
        const card = kind === "ability" ? findAbilityCard(next[actor], match[2], match[3], next) : findCard(next[actor], match[2], "Active Spot");
        if (kind === "ability") {
          card.abilityUsed = true;
          const texts = hp.abilityTexts(match[2], match[3], actor);
          const recipes = texts?.map((text) => /^Once during your turn, you may draw (\d+) cards\. If you drew any cards in this way, shuffle this Pok[eé]mon and all attached cards into your deck\.$/i.exec(text));
          if (recipes?.length && recipes.every((recipe) => recipe && recipe[1] === recipes[0]?.[1])
            && action.details.map(clean).filter((detail) => detail === `${match![1]} drew ${recipes[0]![1]} cards`).length === 1
            && action.details.some((detail) => clean(detail).startsWith(`${match![1]} shuffled `))) boardShuffleActivation = { actor, cardId: card.id, name: card.name, effect: match[3], drawAmount: Number(recipes[0]![1]) };
        }
        if (kind === "attack") {
          const evidence = attackPrintingEvidence(card, match[3], next);
          if (evidence.status !== "unmodelled" && evidence.observedEffect) observeEffect(card, evidence.observedEffect);
          else if (evidence.status === "unmodelled" && hp.resolve(card)?.coverage === "complete") { next.partial = true; errors.push("The attack's native or copied printing provenance is not established."); }
          if (evidence.status === "copied") copiedAttackContexts.set(attackContextKey(actor, card, match[3]), evidence.definitionCard);
        } else observeEffect(card, match[3]);
        stage(kind, match[3], [card], actor); label = kind === "ability" ? "Ability" : "Attack"; mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?)['’]s (.+?) was Knocked Out$/i))) {
        const actor = actorFor(match[1]); const side = next[actor]; knockedOut = findKnockoutCard(actor, match[2]);
        const candidates = allCards(side).filter((card) => card.name === knockedOut!.name);
        const provenComponents = !stackComplete(side, knockedOut) ? slotProvenKnockoutComponents(actor, knockedOut, candidates) : null;
        if (!stackComplete(side, knockedOut) && !provenComponents) throw new BoardCardUnresolved("The knocked-out physical stack is not identified.");
        const retainedGroup = provenComponents ? [...retainedTops.values()].filter((entry) => entry.actor === actor && entry.top.name === knockedOut!.name
          && entry.memberIds.some((id) => candidates.some((card) => card.id === id))) : [];
        const covered = retainedGroup.length >= candidates.length && candidates.every((card) => retainedGroup.some((entry) => entry.top.id === card.id));
        const signature = provenComponents?.map((component) => component.name).sort();
        const signatures = covered && retainedGroup.every((entry) => entry.components !== undefined)
          ? retainedGroup.filter((entry) => JSON.stringify(entry.components) === JSON.stringify(signature)) : [];
        const identified = covered && retainedGroup.length === 1 && candidates.length === 1 ? retainedGroup[0].top : signatures.length === 1 ? signatures[0].top : undefined;
        if (identified && !knockedOut.physicalCardId) {
          knockedOut.physicalCardId = identified.physicalCardId;
          knockedOut.observedEffects = identified.observedEffects ? [...identified.observedEffects] : undefined;
          knockedOut.setId = identified.setId; knockedOut.localId = identified.localId;
          delete knockedOut.definitionKey;
        }
        stage("before", "Knocked Out", [knockedOut], actor);
        const discardedTop = topCardEvidence(id(), knockedOut);
        // The KO bundle can identify its components without identifying which
        // source evolution created this top. Keep those two proofs separate.
        if (knockedOut.instanceUncertain && !identified) delete discardedTop.physicalCardId;
        const layerIds = new Set(knockedOut.underlying.map((layer) => layer.id));
        const rekeyLayer = (component: ReplayZoneCard): ReplayZoneCard => knockedOut!.instanceUncertain && !identified && layerIds.has(component.id)
          ? { ...component, id: id() } : component;
        const discarded = [discardedTop, ...(provenComponents?.map(rekeyLayer) ?? [...knockedOut.underlying.map(rekeyLayer),
          ...knockedOut.energy.map((energy) => zoneCard(id(), /Energy$/i.test(energy) ? energy : `Basic ${energy} Energy`)),
          ...(knockedOut.tool ? [zoneCard(id(), knockedOut.tool)] : []), ...takeSoleMemberCards(actor, knockedOut.id)])];
        addDiscard(actor, discarded, "board");
        aggregateKnockout = { actor, name: knockedOut.name, belowTop: discarded.length - 1, reportedBelowTop: 0 };
        if (side.active?.id === knockedOut.id) side.active = null;
        else side.bench = side.bench.filter((card) => card.id !== knockedOut!.id);
        side.unplaced = side.unplaced?.filter((card) => card.id !== knockedOut!.id);
        if (discardedTop.physicalCardId) {
          retainedTops.delete(discardedTop.physicalCardId);
          for (const pool of side.boardPools ?? []) pool.memberEvidence = pool.memberEvidence?.filter((card) => card.physicalCardId !== discardedTop.physicalCardId);
        } else if (retainedGroup.length) pendingTopDepartures.push({ actor, destination: "discard", id: discardedTop.id, topIds: retainedGroup.map((entry) => entry.top.physicalCardId!) });
        for (const retained of retainedTops.values()) if (retained.actor === actor) retained.memberIds = retained.memberIds.filter((id) => id !== knockedOut!.id);
        resolveDepartedPrintingMultisets(actor);
        refreshBoardPools(actor, "discard", true, true);
        restoreCounterSurvivors(actor, knockedOut.name, candidates, knockedOut.id);
        stage("discard", "Discard", discarded, actor); label = "KO"; mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?) drew (a|\d+) cards?( for the opening hand)?$/i))) {
        const actor = actorFor(match[1]); const amount = count(match[2]);
        if (detailIndex >= 0 && !match[3] && bonusDraw?.actor === actor) {
          if (amount !== bonusDraw.amount || bonusDraw.numericAnnotated) throw new CountConflict("The numeric bonus annotation contradicts the recorded mulligan bonus.", ["hand", "deck"]);
          const names = cardList(detailIndex);
          if (names.length > bonusDraw.amount - bonusDraw.annotated) throw new Unresolved("The bonus draw identities exceed its recorded quantity.");
          bonusDraw.numericAnnotated = true; bonusDraw.annotated += names.length;
          const cards = names.map((name) => zoneCard(id(), name)); next[actor].knownHand.push(...cards);
          const bonusStage = stages.findLast((entry) => entry.kind === "draw" && entry.actor === actor);
          if (bonusStage) { bonusStage.cards.push(...cards); bonusStage.hiddenCount = bonusDraw.amount - bonusDraw.annotated; if (!bonusStage.hiddenCount) delete bonusStage.hiddenCount; }
          return true;
        }
        draw(actorFor(match[1]), count(match[2]), cardList(detailIndex), Boolean(match[3]));
        label = detailIndex < 0 ? "Draw" : label; mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?) drew (.+)$/i))) {
        const actor = actorFor(match[1]);
        if (detailIndex >= 0 && bonusDraw?.actor === actor && bonusDraw.annotated < bonusDraw.amount) {
          const names = match[2].split(",").map((name) => name.trim());
          if (names.length > bonusDraw.amount - bonusDraw.annotated) throw new Unresolved("The bonus draw identities exceed its recorded quantity.");
          const cards = names.map((name) => zoneCard(id(), name)); next[actor].knownHand.push(...cards); bonusDraw.annotated += cards.length;
          const bonusStage = stages.findLast((entry) => entry.kind === "draw" && entry.actor === actor);
          if (bonusStage) { bonusStage.cards.push(...cards); bonusStage.hiddenCount = bonusDraw.amount - bonusDraw.annotated; if (!bonusStage.hiddenCount) delete bonusStage.hiddenCount; }
          return true;
        }
        draw(actorFor(match[1]), 1, [match[2]]); label = detailIndex < 0 ? "Draw" : label; mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?) took (a|\d+) Prize cards?$/i))) {
        const actor = actorFor(match[1]); prizeAmount = count(match[2]); prizeAction = true;
        if (prizeAmount > 6) throw new Unresolved("The recorded Prize count exceeds six cards.");
        next[actor].prizesRemaining = changeCount(next[actor].prizesRemaining, -prizeAmount, ["hand", "prizes"]);
        next[actor].handCount = changeCount(next[actor].handCount, prizeAmount, ["hand", "prizes"]);
        transferCounts(actor, "prizes", "hand", prizeAmount);
        const earlier = earlyPrizeAnnotations.get(actionIndex);
        const cards = (earlier?.names ?? []).map((name) => zoneCard(id(), name)); next[actor].knownHand.push(...cards);
        prizeCardsAdded = earlier?.amount ?? 0; pendingPrizeAnnotations[actor] = { section: action.sourceSectionIndex, remaining: prizeAmount - prizeCardsAdded };
        stage("draw", "Take Prize", cards, actor, prizeAmount - cards.length); label = "Prize"; mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?) discarded (a|\d+) cards?(?: from (?:their |the )?(hand|deck))?$/i))) {
        const actor = actorFor(match[1]); const names = cardList(detailIndex); const amount = count(match[2]);
        if (benchLimit !== null && !match[3]) return discardBenchTops(actor, names, amount);
        if (names.length > amount) throw new Unresolved("The discarded list exceeds its recorded count.");
        if (names.length < amount) { next[actor].discardIdentitiesKnown = false; markUncertain(actor, ["discard"], false); next.partial = true; errors.push("Some discarded card identities are not recorded."); }
        const context = detailIndex >= 0 ? effectContext() : null;
        const plan = context && hp.effectConstraints(context.card, context.name, context.kind, "discard_cards");
        const printedOwner = plan?.status === "known" && plan.operation === "discard_cards" ? plan.owner === "effect_actor" ? context!.actor : context!.actor === "self" ? "opponent" : "self" : undefined;
        const origin = match[3] ?? effectOrigin(raw, detailIndex) ?? (printedOwner === actor ? "deck" : "hand");
        if (printedOwner === actor && plan?.status === "known" && plan.operation === "discard_cards" && (plan.quantity.kind !== "exact" || plan.quantity.value !== amount)) throw new Unresolved("The deck discard quantity contradicts the verified effect.");
        if (origin !== "hand" && origin !== "deck") throw new Unresolved("The discard's physical source is not established.");
        const removed = origin === "deck" ? [] : removeHand(next[actor], names, amount, "discard");
        if (origin === "deck") next[actor].deckCount = changeCount(next[actor].deckCount, -amount, ["deck"]);
        const cards = names.map((name, index) => ({ ...zoneCard(id(), name), ...removed[index] }));
        addDiscard(actor, cards, origin, amount); stage("discard", "Discard", cards, actor, amount - names.length); mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?) (?:was|were) discarded from (.+?)['’]s (.+)$/i))) {
        const actor = actorFor(match[2]); const side = next[actor];
        const numeric = /^(a|\d+) cards?$/i.exec(match[1]);
        const names = numeric ? cardList(detailIndex) : match[1].split(",").map((name) => name.trim());
        if (numeric && names.length > count(numeric[1])) throw new CountConflict("The discarded card list exceeds its recorded count.", ["board", "discard"]);
        if (numeric && knockedOut?.name === match[3] && !knockedOut.instanceUncertain
          && count(numeric[1]) !== aggregateKnockout?.belowTop) {
          throw new CountConflict("The recorded KO card count contradicts the previously known physical stack.", ["board", "discard"]);
        }
        if (aggregateKnockout?.actor === actor && aggregateKnockout.name === match[3] && !knockedOut) {
          aggregateKnockout.reportedBelowTop += numeric ? count(numeric[1]) : names.length;
          if (aggregateKnockout.belowTop !== null && aggregateKnockout.reportedBelowTop > aggregateKnockout.belowTop) throw new CountConflict("The KO detail exceeds its recorded physical stack.", ["board", "discard"]);
          const evidenced = [...(aggregateKnockout.evidencedNames ?? [])];
          const additional = names.filter((name) => { const index = evidenced.indexOf(name); if (index < 0) return true; evidenced.splice(index, 1); return false; });
          aggregateKnockout.evidencedNames = evidenced;
          const moved = takePooledCards(actor, aggregateKnockout.memberIds ?? allCards(side).filter((card) => card.name === match![3]).map((card) => card.id), additional);
          side.discard.push(...recordedZoneCards(additional, moved)); return true;
        }
        if (!names.length) throw new Unresolved("The discarded attachments are not identified.");
        if (knockedOut?.name === match[3]) {
          for (const name of names) {
            const index = discardedThisAction.findIndex((item) => item.actor === actor && item.name === name);
            if (index >= 0) discardedThisAction.splice(index, 1);
            else {
              const card = zoneCard(id(), name); side.discard.push(card);
              markUncertain(actor, ["board", "discard"]);
              stage("discard", "Recorded attachment", [card], actor);
            }
          }
          return true; // Known attachments already moved; newly revealed ones are evidence too.
        }
        if (benchLimit !== null && names.every((name) => discardedThisAction.some((entry) => entry.actor === actor && entry.name === name))) {
          for (const name of names) discardedThisAction.splice(discardedThisAction.findIndex((entry) => entry.actor === actor && entry.name === name), 1);
          return true;
        }
        const boundId = [...recordedKnockoutBindings].find(([index]) => index >= actionIndex && index <= actionIndex + 3)?.[1]; const targetName = match[3];
        const boundCard = allCards(side).find((card) => card.name === targetName && card.id === boundId);
        const card = retreating?.name === match[3] ? retreating : boundCard ?? findCard(side, match[3]);
        for (const name of names) {
          const energy = name.replace(/^Basic (.+) Energy$/i, "$1"); const index = card.energy.indexOf(energy);
          if (card.tool === name) delete card.tool;
          else if (index >= 0) card.energy.splice(index, 1);
          else {
            const pooled = takePooledCards(actor, [card.id], [name]);
            if (!pooled.length) throw new Unresolved("A discarded attachment was not previously evidenced.");
            if (card.knownStackSize !== undefined) card.knownStackSize--;
            addDiscard(actor, pooled, "board"); continue;
          }
          if (card.knownStackSize !== undefined) card.knownStackSize--;
          addDiscard(actor, [zoneCard(id(), name)], "board");
        }
        stage("discard", "Discard", names.map((name) => zoneCard(id(), name)), actor); mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?) put (a|\d+) damage counters? on (.+?)['’]s (.+)$/i))) {
        const controller = actorFor(match[1]); const context = effectContext();
        const plan = context ? hp.effectConstraints(context.card, context.name, context.kind, "put_counters") : null;
        if (plan && plan.status !== "known" && plan.status !== "neutral") throw new Unresolved("The counter target domain is not established by card rules.");
        if (plan?.status === "known" && plan.operation === "put_counters" && plan.quantity.value !== undefined && !plan.quantity.perTarget) {
          const total = action.details.map(clean).reduce((sum, detail) => { const amount = /^.+? put (a|\d+) damage counters? on /.exec(detail); return sum + (amount ? count(amount[1]) : 0); }, 0);
          if (total > plan.quantity.value || plan.quantity.kind === "exact" && total !== plan.quantity.value) throw new Unresolved("The counter distribution contradicts the verified effect total.");
        }
        const constraint = plan?.status === "known" && plan.operation === "put_counters" ? plan.target : undefined;
        let boundOwner = actorFor(match[3]); let triggerTarget: { actor: ReplayActor; card: ReplayCard } | null = null;
        if (constraint?.owner === "trigger") {
          const targetName = match[4];
          const candidates = pendingBenchTriggers.filter((trigger) => trigger.section === action.sourceSectionIndex && trigger.actor === controller && trigger.stadium === next.stadium?.name)
            .flatMap((trigger) => next[trigger.actor].bench.filter((card) => card.id === trigger.cardId && card.name === targetName).map((card) => ({ actor: trigger.actor, card })));
          if (!candidates.length || candidates.some(({ card }) => replayBenchTriggerMatches(plan!, hp.resolve(card)) !== true)) throw new Unresolved("The stadium counter detail has no verified matching Bench trigger.");
          const target = findBoardCard({ ...next[controller], active: null, bench: candidates.map(({ card }) => card), unplaced: [] }, match[4], "Bench", hp, undefined, sameHistory);
          boundOwner = controller; triggerTarget = { actor: controller, card: target };
          pendingBenchTriggers = pendingBenchTriggers.filter((trigger) => trigger.cardId !== target.id);
        }
        if (plan?.status === "known" && plan.operation === "put_counters" && plan.quantity.value !== undefined && count(match[2]) > plan.quantity.value) throw new Unresolved("The counter quantity exceeds the verified effect.");
        let targets = triggerTarget ? [triggerTarget] : constrainedCandidates(match[4], boundOwner, context?.actor ?? controller, constraint);
        const oneGameplayFamily = (card: ReplayCard) => {
          const evidence = hp.resolve(card);
          if (evidence?.coverage !== "complete" || !evidence.candidates.length) return false;
          const keys = evidence.candidates.map((printing) => JSON.stringify([printing.hp, printing.category, printing.trainerType, printing.stage, printing.types,
            printing.evolvesFrom, printing.rules, printing.abilities, printing.attacks]));
          return keys.every((key) => key === keys[0]) && evidence.candidates.every((printing) => printing.hp !== null && printing.hp > 0
            && printing.abilities.every((ability) => ability.text !== null)
            && (evidence.candidates.length === 1 || printing.attacks.every((attack) => attack.text !== null)));
        };
        if (targets.length > 1 && constraint?.zone === "bench" && targets.every(({ actor, card }) => actor === targets[0].actor && !card.instanceUncertain && card.damageKnown !== false
          && !next[actor].boardPools?.some((pool) => pool.memberIds.includes(card.id) && (pool.cards.length || pool.possiblyReturnedCards?.length || pool.uncertainCards?.some((group) => group.cards.length)))
          && oneGameplayFamily(card))) {
          try {
            const actor = targets[0].actor;
            const card = findBoardCard({ ...next[actor], active: null, bench: targets.map(({ card }) => card), unplaced: [] }, match[4], "Bench", hp, undefined, sameHistory);
            targets = [{ actor, card }];
          } catch (error) { if (!(error instanceof BoardCardUnresolved)) throw error; }
        }
        if (targets.length > 1) {
          const source = context && hp.resolve(context.card);
          const pureCounters = context?.kind === "attack" && source?.coverage === "complete" && source.candidates.length > 0 && source.candidates.every((candidate) => {
            const attack = candidate.attacks.find((attack) => attack.name === context.name);
            return attack?.text && /^Put \d+ damage counters on your opponent's (?:Benched )?Pok[eé]mon in any way you like\.$/i.test(attack.text);
          });
          const recipientLines = action.details.map(clean).filter((line) => /^.+? put (a|\d+) damage counters? on /i.test(line) && (line.endsWith(`'s ${match![4]}`) || line.endsWith(`’s ${match![4]}`)));
          if (pureCounters && recipientLines.length === 1 && targets.every(({ card, actor }) => {
            const evidence = hp.resolve(card);
            return actor === targets[0].actor && card.damageKnown !== false && card.damage === 0 && card.maxHp != null && card.maxHp > 0
              && evidence?.coverage === "complete" && evidence.candidates.length > 0 && evidence.candidates.every((candidate) => candidate.hp !== null && candidate.hp > 0);
          })) {
            const batchSafe = Boolean(context?.name && nativeAttackRouteSafe(context.card as ReplayCard, context.name, next)) && targets.every(({ card }) => {
              const evidence = hp.resolve(card);
              return !card.instanceUncertain && card.hpBasis === "known" && !card.hpModifierUncertain && card.hpModifierBasis !== "unverified_attachment"
                && evidence?.coverage === "complete" && evidence.candidates.length > 0
                && evidence.candidates.every((candidate) => candidate.hp === evidence.candidates[0].hp);
            });
            counterEliminations.push({ actionIndex, actor: targets[0].actor, name: match[4], ids: targets.map(({ card }) => card.id), batchSafe });
          }
          targets.forEach(({ card }) => { card.damageKnown = false; });
          next.partial = true; errors.push("The counter recipient's physical copy is unidentified within its verified target domain."); mutationCount++; return true;
        }
        if (!targets.length) throw new BoardCardUnresolved("The counter recipient is not present in its evidenced target domain.");
        const { actor, card } = targets[0];
        card.damage += count(match[2]) * 10; stage("damage", `${count(match[2]) * 10} damage`, [card], actor); mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?) moved (a|\d+) damage counters? from (.+?)['’]s (.+?) to (.+?)['’]s (.+)$/i))) {
        const controller = actorFor(match[1]); const context = effectContext();
        const plan = context ? hp.effectConstraints(context.card, context.name, context.kind, "move_counters") : null;
        if (plan && plan.status !== "known" && plan.status !== "neutral") throw new Unresolved("The moved counter target domains are not established by card rules.");
        const constraints = plan?.status === "known" && plan.operation === "move_counters" ? plan : null;
        if (constraints?.quantity.value !== undefined) {
          const total = action.details.map(clean).reduce((sum, detail) => { const amount = /^.+? moved (a|\d+) damage counters? from /.exec(detail); return sum + (amount ? count(amount[1]) : 0); }, 0);
          if (total > constraints.quantity.value || constraints.quantity.kind === "exact" && total !== constraints.quantity.value) throw new Unresolved("The damage movement exceeds the verified effect total.");
        }
        const amount = count(match[2]) * 10;
        const origins = constrainedCandidates(match[4], actorFor(match[3]), context?.actor ?? controller, constraints?.from)
          .filter(({ card }) => card.damageKnown === false || card.damage >= amount);
        const destinations = constrainedCandidates(match[6], actorFor(match[5]), context?.actor ?? controller, constraints?.to);
        if (!origins.length || !destinations.length) throw new BoardCardUnresolved("A recorded damage counter target is not present in the evidenced domain.");
        if (constraints?.distinctTargets && origins.length === 1 && destinations.length === 1 && origins[0].card.id === destinations[0].card.id) throw new Unresolved("The verified effect requires distinct damage targets.");
        if (origins.length === 1) {
          const { actor, card } = origins[0];
          if (card.damageKnown !== false && card.damage < amount) throw new Unresolved("The recorded damage movement exceeds the evidenced damage.");
          card.damage = Math.max(0, card.damage - amount); stage("move", "Move damage from", [card], actor);
        } else origins.forEach(({ card }) => { card.damageKnown = false; });
        if (destinations.length === 1) { const { actor, card } = destinations[0]; card.damage += amount; stage("damage", `${amount} damage`, [card], actor); }
        else destinations.forEach(({ card }) => { card.damageKnown = false; });
        if (origins.length !== 1 || destinations.length !== 1) { next.partial = true; errors.push("A damage counter endpoint's physical copy is unidentified; the independent endpoint remains evidenced."); }
        mutationCount++; return true;
      }
      if ((match = line.match(/^(a|\d+) damage counters? (?:was|were) placed on (.+?)['’]s (.+?) for the Special Condition (Poisoned|Burned)$/i))) {
        const actor = actorFor(match[2]); const card = findCard(next[actor], match[3]);
        card.damage += count(match[1]) * 10; stage("damage", `${count(match[1]) * 10} damage`, [card], actor); label = "Damage"; mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?) healed (\d+) damage from (.+?)['’]s (.+)$/i))) {
        actorFor(match[1]); const actor = actorFor(match[3]); const amount = Number(match[2]); const context = effectContext();
        if (!Number.isSafeInteger(amount) || amount < 0 || amount > 6000) throw new Unresolved("The recorded healing is outside the supported damage bounds.");
        const evidence = context && hp.resolve(context.card);
        const healsAll = evidence?.coverage === "complete" && evidence.candidates.length > 0 && evidence.candidates.every((candidate) => candidate.rules?.some((text) => /^Heal all damage from 1 of your /i.test(text)));
        const plan = context && hp.effectConstraints(context.card, context.name, context.kind, "heal");
        let capped = Boolean(context && plan?.status === "known" && plan.operation === "heal" && plan.amount === amount
          && (plan.target.owner === "effect_actor" ? context.actor === actor : plan.target.owner === "opponent" ? context.actor !== actor : plan.target.owner === "either"));
        let attachedId: string | undefined;
        if (capped && plan?.status === "known" && plan.operation === "heal" && plan.afterAttachment) {
          const destination = stages.at(-1); const attachment = stages.at(-2);
          const priorAttachment = action.details.slice(0, Math.max(0, detailIndex)).map((raw, index) => ({ raw, index,
            match: /^(.+?) attached (.+?) to (.+?) (?:in|on) the (Active Spot|Bench)(?: from (?:their |the )?(hand|deck|discard pile))?$/i.exec(clean(raw).replace(/^(.*?) attached (.+?) from (?:their |the )?(hand|deck|discard pile) to (.+)$/i, "$1 attached $2 to $4 from $3")) })).findLast((entry) => entry.match);
          const origin = priorAttachment?.match?.[5] ?? (priorAttachment && effectOrigin(priorAttachment.raw, priorAttachment.index));
          attachedId = destination?.kind === "move" && destination.actor === actor && destination.targetResolved !== false && destination.cards.length === 1
            && destination.cards[0].name === match[4] && attachment?.kind === "attach" && attachment.actor === actor && attachment.cards.length === 1
            && attachment.cards[0].name === `Basic ${plan.afterAttachment.basicEnergyType} Energy` && origin === plan.afterAttachment.origin ? destination.cards[0].id : undefined;
          capped = attachedId !== undefined;
        }
        const position = capped && plan?.status === "known" && plan.operation === "heal" ? plan.target.zone === "active" ? "Active Spot" : plan.target.zone === "bench" ? "Bench" : undefined : undefined;
        const card = findBoardCard(next[actor], match[4], position, hp, (candidate) => (!attachedId || candidate.id === attachedId)
          && (candidate.damageKnown === false || (healsAll ? candidate.damage === amount : capped || candidate.damage >= amount)), sameHistory);
        if (!capped && card.damageKnown !== false && amount > card.damage) throw new Unresolved("The recorded healing exceeds the evidenced damage.");
        const removed = card.damageKnown === false ? null : Math.min(card.damage, amount);
        // Heal-all's positive recorded amount is actual removal evidence;
        // a fixed nominal capacity on an undamaged/unknown target is not.
        card.damage = Math.max(0, card.damage - amount); healed = healsAll && amount > 0 || removed !== null && removed > 0 ? { actor, id: card.id } : null;
        stage("heal", `Heal ${amount}`, [card], actor); mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?)['’]s (.+?) (?:is now|was|became|is) (Poisoned|Burned|Asleep|Paralyzed|Confused)$/i))) {
        const actor = actorFor(match[1]); const card = findCard(next[actor], match[2], "Active Spot");
        const condition = (["Poisoned", "Burned", "Asleep", "Paralyzed", "Confused"] as ReplayCondition[]).find((value) => value.toLowerCase() === match![3].toLowerCase())!;
        if (["Asleep", "Paralyzed", "Confused"].includes(condition)) card.conditions = (card.conditions ?? []).filter((item) => !["Asleep", "Paralyzed", "Confused"].includes(item));
        card.conditions = [...new Set([...(card.conditions ?? []), condition])]; label = "Condition"; mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?)['’]s (.+?) (?:recovered from|is no longer) (Poisoned|Burned|Asleep|Paralyzed|Confused|Poison|Burn|Sleep|Paralysis|Confusion)$/i))) {
        const actor = actorFor(match[1]); const card = findCard(next[actor], match[2], "Active Spot");
        const condition: ReplayCondition = /^poison/i.test(match[3]) ? "Poisoned" : /^burn/i.test(match[3]) ? "Burned" : /^paral/i.test(match[3]) ? "Paralyzed" : /^confus/i.test(match[3]) ? "Confused" : "Asleep";
        card.conditions = (card.conditions ?? []).filter((value) => value !== condition); mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?)['’]s (.+?) (woke up|recovered from all Special Conditions)$/i))) {
        const card = findCard(next[actorFor(match[1])], match[2], "Active Spot");
        card.conditions = /^woke/i.test(match[3]) ? (card.conditions ?? []).filter((value) => value !== "Asleep") : [];
        mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?) played (.+?) to the Stadium spot$/i))) {
        const actor = actorFor(match[1]); removeHand(next[actor], [match[2]], 1, "board");
        if (next.stadium) addDiscard(next.stadium.actor, [zoneCard(id(), next.stadium.name)], "board");
        transferCounts(actor, "hand", "board", 1);
        next.stadium = { actor, name: match[2], imageUrl: zoneCard(id(), match[2]).imageUrl };
        stage("stadium", "Stadium", [zoneCard(id(), match[2])], actor); label = "Stadium"; mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?) played (.+)$/i))) {
        const player = match[1]; const name = match[2]; const actor = actorFor(player); const kind = effectTag(raw);
        if (name === "a card" && benchLimit !== null && detailIndex < 0) { label = "Discard"; return true; }
        const copies = allCards(next[actor]).filter((card) => card.name === name);
        if (copies.length) {
          const plans = copies.flatMap((card) => (hp.resolve(card)?.candidates ?? []).flatMap((candidate) => candidate.abilities.flatMap((ability) => {
            const recipe = ability.text && /^Once during your turn, you may draw (\d+) cards\. If you drew any cards in this way, shuffle this Pok[eé]mon and all attached cards into your deck\.$/i.exec(ability.text);
            return recipe ? [{ effect: ability.name, drawAmount: Number(recipe[1]) }] : [];
          })));
          const drawDetails = action.details.map(clean).filter((detail) => detail === `${player} drew ${plans[0]?.drawAmount} cards`);
          if (plans.length && plans.every((plan) => plan.effect === plans[0].effect && plan.drawAmount === plans[0].drawAmount) && drawDetails.length === 1 && action.details.some((detail) => /^.+? shuffled (?:a|\d+) cards? into their deck$/.test(clean(detail)))) {
            const card = findAbilityCard(next[actor], match[2], plans[0].effect, next);
            const narrowed = hp.resolve({ ...card, observedEffects: [...(card.observedEffects ?? []), plans[0].effect] });
            if (narrowed?.coverage !== "complete" || !narrowed.candidates.length || !narrowed.candidates.every((candidate) => candidate.abilities.some((ability) => ability.name === plans[0].effect))) throw new Unresolved("The draw-and-return activation is not established by complete card evidence.");
            observeEffect(card, plans[0].effect); card.abilityUsed = true;
            boardShuffleActivation = { actor, cardId: card.id, name: card.name, effect: plans[0].effect, drawAmount: plans[0].drawAmount };
            stage("ability", plans[0].effect, [card], actor); label = "Ability"; mutationCount++; return true;
          }
        }
        if (kind === "stadium") {
          if (next.stadium?.name === name) {
            const plan = hp.effectConstraints({ name, definitionOwner: actor }, undefined, "stadium", "stadium_activation");
            const details = action.details.map(clean);
            if (plan.status === "known" && plan.operation === "stadium_activation" && "switch" in plan) {
              const switched = details.map((detail) => /^(.+?) was switched with (.+?) to become the Active Pok[eé]mon$/.exec(detail)).find((value) => value !== null);
              if (!switched) throw new Unresolved("The switch Stadium activation has no recorded switch.");
              const outgoing = ownerAndName(switched[2]); const incoming = ownerAndName(switched[1], outgoing.actor);
              const requiredType = plan.switch!.pokemonType;
              const targets = [next[actor].active, ...next[actor].bench.filter((card) => card.name === incoming.name)];
              if (outgoing.actor !== actor || incoming.actor !== actor || next[actor].active?.name !== outgoing.name || targets.length < 2 || targets.some((card) => {
                const found = card && hp.resolve(card); return !found || found.coverage !== "complete" || !found.candidates.length || found.candidates.some((printing) => !printing.types?.includes(requiredType));
              })) throw new Unresolved("The switch Stadium targets do not satisfy the verified owner and type constraint.");
              stage("stadium", "Stadium effect", [zoneCard(id(), name)], actor); label = "Stadium"; mutationCount++; return true;
            }
            if (plan.status === "known" && plan.operation === "stadium_activation" && !("switch" in plan) && plan.movements.length && plan.movements.every((movement) => details.some((detail) => {
              if (movement.destination === "discard") return detail === `${player} discarded ${movement.quantity} cards` || movement.quantity === 1 && detail === `${player} discarded a card`;
              if (movement.destination === "hand") {
                const draw = /^(.+?) drew (.+)$/.exec(detail); const numeric = draw && /^(a|\d+) cards?$/.exec(draw[2]);
                if (plan.search) {
                  if (!draw || draw[1] !== player || numeric || movement.quantity !== 1 || !normalizeText(draw[2]).startsWith(`${normalizeText(plan.search.namePrefix)} `)) return false;
                  const found = hp.resolve({ name: draw[2], definitionOwner: actor });
                  return found?.coverage === "complete" && !!found.candidates.length && found.candidates.every((printing) => printing.category === plan.search!.category);
                }
                return draw?.[1] === player && (numeric ? count(numeric[1]) === movement.quantity : movement.quantity === 1 && !draw[2].includes(","));
              }
              const put = /^(.+?) put (a|\d+) cards? on top of their deck$/.exec(detail);
              return put?.[1] === player && count(put[2]) === movement.quantity;
            }))) {
              stage("stadium", "Stadium effect", [zoneCard(id(), name)], actor); label = "Stadium"; mutationCount++; return true;
            }
            throw new Unresolved("The current Stadium's activation does not match its verified movement recipe.");
          }
          removeHand(next[actor], [match[2]], 1, "board");
          if (next.stadium) addDiscard(next.stadium.actor, [zoneCard(id(), next.stadium.name)], "board");
          transferCounts(actor, "hand", "board", 1);
          next.stadium = { actor, name: match[2], imageUrl: zoneCard(id(), match[2]).imageUrl };
          stage("stadium", "Stadium", [zoneCard(id(), match[2])], actor); label = "Stadium"; mutationCount++; return true;
        }
        const fieldAgreement = !kind ? getCardDefinitionTrainerFieldAgreement(hp.resolve({ name, definitionOwner: actor })) : null;
        // The source rule sends a used Item/Supporter to discard. This
        // classification certificate does not assert missing prose is empty;
        // a known printed or recorded different disposition still overrides it.
        const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const selfReturn = new RegExp(`(?:return|shuffle|put)[^.]*\\bthis (?:card|${escapedName})\\b[^.]*\\b(?:hand|deck)\\b`, "i");
        const classifiedDefault = fieldAgreement && ["item", "supporter"].includes(fieldAgreement.trainerType)
          && !fieldAgreement.candidateRules.some((candidate) => candidate.rules?.some((rule) =>
            /instead of discarding|play this card as if it were|(?:play|put|place|remain)[^.]*\b(?:Bench|Active Spot|in play)\b/i.test(rule)
            || selfReturn.test(rule)));
        const playedEvidence = removeHand(next[actor], [match[2]], 1, kind === "tool" ? "board" : "discard")[0];
        next.playedCard = { actor, card: { ...zoneCard(id(), match[2]), ...playedEvidence } };
        stage("play", "Play", [next.playedCard.card], actor);
        const disposition = !kind ? hp.trainerDisposition({ name, definitionOwner: actor }) : null;
        if (["item", "supporter"].includes(kind ?? "") || classifiedDefault || disposition?.status === "known" && disposition.destination === "discard") addDiscard(actor, [structuredClone(next.playedCard.card)]);
        else if (kind === "tool") transferCounts(actor, "hand", "board", 1);
        else { markUncertain(actor, ["board", "discard"]); next.partial = true; errors.push("The played card's final zone is not established by card-type metadata."); }
        label = "Play"; mutationCount++; return true;
      }
      if (/^.+? (?:chose (?:heads|tails) for the opening coin flip|won the coin toss|flipped a coin and it landed on (?:heads|tails))$/i.test(line)) {
        label = detailIndex < 0 ? "Coin flip" : label; return true;
      }
      if ((match = /^.+? flipped ([1-9]\d*) coins, and (\d+) landed on heads$/i.exec(line))) {
        const coins = Number(match[1]); const heads = Number(match[2]);
        if (!Number.isSafeInteger(coins) || coins > 100 || !Number.isSafeInteger(heads) || heads > coins) throw new Unresolved("The recorded coin result is outside its stated coin count.");
        label = detailIndex < 0 ? "Coin flip" : label; return true;
      }
      if (/^.+?['’]s .+?'s Tera effect was used$/i.test(line)) {
        // This title records passive evidence only. Every mutating detail still
        // requires its own independently supported recipe.
        return true;
      }
      if (/^.+? decided to go (?:first|second)$/i.test(line)) { label = "First"; return true; }
      if (/^Pok[eé]mon Checkup$/i.test(line)) { label = "Checkup"; return true; }
      if (/^.+? ended their turn$/i.test(line)) { label = "End turn"; return true; }
      if (/^(?:.+? wins(?: the game)?|.+? conceded(?: the game)?|All Prize cards taken|No Pokémon in play)$/i.test(line)) { label = "Result"; return true; }
      if (/^Damage breakdown:$/i.test(line)) { expectedBreakdownDamage = Number(breakdownDamage(detailIndex) ?? attackDamage); damageBreakdown = breakdownDamage(detailIndex) !== undefined || attackDamage !== null; return damageBreakdown; }
      if ((match = line.match(/^Total damage: (\d+) damage$/i))) {
        if ((expectedBreakdownDamage ?? attackDamage) !== Number(match[1])) throw new Unresolved("The damage total contradicts the recorded attack.");
        damageBreakdown = false; return true;
      }
      // A labeled arithmetic breakdown explains the total already applied. Its
      // modifiers are metadata, never additional damage mutations.
      if ((attackDamage !== null || damageBreakdown) && /^(?:Base damage|Weakness to .+?|Resistance to .+?): .+$/i.test(line)) return true;
      if (damageBreakdown && /^[^:]+:\s*[+−-]?\d.*(?:damage|×|x|\*)/i.test(line)) return true;
      if (!line) return true;
      return false;
    };

    const titleOwner = [input.selfPlayerName, input.opponentPlayerName].sort((a, b) => b.length - a.length)
      .find((name) => action.sourceTitle.startsWith(`${name} `) || action.sourceTitle.startsWith(`${name}'s `) || action.sourceTitle.startsWith(`${name}’s `));
    const event: ReplayEvent = { actor: titleOwner ? actorFor(titleOwner) : action.actor, turn: action.turn, ...(action.turn > 0 ? { turnActor: action.actor } : {}),
      sourceSectionIndex: action.sourceSectionIndex, sourceTitle: action.sourceTitle,
      sourceDetails: [...action.details], label, summary: anonymise(action.sourceTitle, input) };
    if (action.turn > 0 && action.sourceSectionIndex !== previousSectionIndex) {
      allCards(next[action.actor]).forEach((card) => { card.abilityUsed = false; });
    }
    const bindAttackEnergy = (actor: ReplayActor, attacker: ReplayCard, name: string) => {
      const printing = attackPrintingEvidence(attacker, name, next);
      if (printing.status !== "native") return;
      const definition = attacker;
      const found = hp.resolve({ ...definition, observedEffects: [...(definition.observedEffects ?? []), name] });
      if (found?.coverage !== "complete" || !found.candidates.length) return;
      const attacks = found.candidates.map((card) => card.attacks.filter((attack) => normalizeText(attack.name) === normalizeText(name)));
      if (attacks.some((values) => values.length !== 1 || values[0].cost === null || values[0].text === null || /Energy/i.test(values[0].text))) return;
      const costs = attacks.map((values) => [...values[0].cost!].sort());
      if (!costs.every((cost) => JSON.stringify(cost) === JSON.stringify(costs[0]))) return;
      const sources = (["self", "opponent"] as const).flatMap((owner) => allCards(next[owner]).flatMap((card) => [card,
        ...(card.tool ? [{ name: card.tool, definitionOwner: owner }] : []), ...(next[owner].boardPools ?? []).flatMap((pool) => pool.cards.filter((card) => card.boardRole !== "energy" || !/^Basic .+ Energy$/.test(card.name))),
      ]));
      if (next.stadium) sources.push({ name: next.stadium.name, definitionOwner: next.stadium.actor });
      for (const event of program.events) {
        const used = /^(.+?)['’]s (.+?) used (.+?)(?: on .+)?$/.exec(clean(event.sourceTitle));
        const played = /^(.+?) played (.+)$/.exec(clean(event.sourceTitle));
        if (used && ![input.selfPlayerName, input.opponentPlayerName].includes(used[1]) || played && ![input.selfPlayerName, input.opponentPlayerName].includes(played[1])) return;
        if (used) sources.push({ name: used[2], observedEffects: [used[3]], definitionOwner: actorFor(used[1]) });
        else if (played && !/ to (?:the )?(?:Active Spot|Bench|Stadium spot)$/.test(played[2])) sources.push({ name: played[2], definitionOwner: actorFor(played[1]) });
      }
      const modifiesCost = /(?:without (?:paying|using)|ignore).{0,50}(?:Energy|cost)|(?:attacks?|Energy).{0,60}(?:costs?|requires?|less|provide|counts? as)|(?:costs?|requires?).{0,50}Energy|Energy.{0,40}(?:any type|all types)/i;
      if (sources.some((source) => {
        const evidence = hp.resolve(source);
        return evidence?.coverage !== "complete" || !evidence.candidates.length || evidence.candidates.some((card) =>
          card.category !== "Pokemon" && card.rules === null || card.abilities.some((ability) => ability.text === null)
          || [...(card.rules ?? []), ...card.abilities.map((ability) => ability.text ?? ""), ...card.attacks.map((attack) => attack.text ?? "")].some((text) => modifiesCost.test(text)));
      })) return;
      const side = next[actor]; const pools = side.boardPools ?? [];
      if (pools.some((pool) => pool.possiblyReturnedCards?.length) || allCards(side).some((card) => card.energy.some((energy) => /Energy$/i.test(energy) && !/^Basic .+ Energy$/i.test(energy)))
        || pools.flatMap((pool) => pool.cards).some((card) => card.boardRole === "energy" && !/^Basic .+ Energy$/i.test(card.name))) return;
      const represented = allCards(side).reduce((sum, card) => sum + physicalCardCount(card), 0) + pools.reduce((sum, pool) => sum + pool.cards.length, 0) + Number(next.stadium?.actor === actor);
      if (side.inPlayCount === null || represented !== side.inPlayCount) return;
      // Cost constrains the source attacker, not the damage recipient. Keep a
      // separate zero-mutation selection in the retained source ledger.
      if (proof.trace) proof.trace.push({ key: replayCopyKey(actionIndex, actor, clean(action.sourceTitle), attacker.name, "Active Spot"), event: actionIndex, section: action.sourceSectionIndex, actor, kind: "witness", name: attacker.name, position: "active", cost: costs[0], cards: allCards(side).map((card) => ({ card: structuredClone(card), position: side.active?.id === card.id ? "active" : "bench" })) });
      for (const type of new Set(costs[0].filter((type) => type !== "Colorless"))) {
        const required = costs[0].filter((value) => value === type).length;
        const local = attacker.energy.filter((energy) => energy === type || energy === `Basic ${type} Energy`).length;
        const alreadyBound = pools.filter((pool) => pool.memberIds.length === 1 && pool.memberIds[0] === attacker.id).flatMap((pool) => pool.cards).filter((card) => card.name === `Basic ${type} Energy`).length;
        const missing = required - local - alreadyBound; if (missing <= 0) continue;
        const globalLocal = allCards(side).reduce((sum, card) => sum + card.energy.filter((energy) => energy === type || energy === `Basic ${type} Energy`).length, 0);
        const pooled = pools.flatMap((pool) => pool.cards.filter((card) => card.name === `Basic ${type} Energy`).map((card) => ({ pool, card })));
        if (globalLocal !== local || pooled.length !== missing + alreadyBound || pooled.some(({ pool }) => !pool.memberIds.includes(attacker.id))) continue;
        const moved = pooled.filter(({ pool }) => pool.memberIds.length !== 1).map(({ pool, card }) => { pool.cards.splice(pool.cards.indexOf(card), 1); return card; });
        if (moved.length) addBoardPool(actor, [attacker], moved);
      }
    };

    const survivingEnergyWitness = (actor: ReplayActor, name: string, candidates: ReplayCard[]) => {
      if (candidates.length < 2 || candidates.some((card) => physicalCardCount(card) !== 1)) return false;
      const side = next[actor]; const ids = candidates.map((card) => card.id);
      const pools = (side.boardPools ?? []).filter((pool) => pool.memberIds.some((id) => ids.includes(id)));
      if (pools.some((pool) => pool.possiblyReturnedCards?.length || pool.memberIds.some((id) => !ids.includes(id)))) return false;
      const components = pools.flatMap((pool) => pool.cards);
      if (components.length !== 1 || components[0].boardRole !== "energy" || !/^Basic .+ Energy$/.test(components[0].name)) return false;
      const represented = allCards(side).reduce((sum, card) => sum + physicalCardCount(card), 0) + (side.boardPools ?? []).reduce((sum, pool) => sum + pool.cards.length, 0) + Number(next.stadium?.actor === actor);
      if (side.inPlayCount === null || side.inPlayCount !== represented) return false;
      const symbols: Record<string, string> = { D: "Darkness", F: "Fighting", G: "Grass", L: "Lightning", M: "Metal", P: "Psychic", R: "Fire", W: "Water", Y: "Fairy", N: "Dragon", C: "Colorless" };
      const players = [input.selfPlayerName, input.opponentPlayerName];
      for (let index = actionIndex + 1; index < Math.min(actions.length, actionIndex + 9); index++) {
        for (const raw of [actions[index].sourceTitle, ...actions[index].details]) {
          const line = clean(raw); const used = /^(.+?)['’]s (.+?) used (?:its Ability:\s*)?(.+)$/.exec(line);
          if (used && players.includes(used[1]) && actorFor(used[1]) === actor && used[2] === name) {
            const texts = hp.abilityTexts(name, used[3], actor);
            return Boolean(texts?.length && texts.every((text) => {
              const required = /^Once during your turn, if this Pok[eé]mon has any \{([A-Z])\} Energy attached, you may /i.exec(text)?.[1];
              return required && !/\b(?:otherwise|or if|if not)\b/i.test(text) && components[0].name === `Basic ${symbols[required]} Energy`;
            }));
          }
          const ordinary = /^(.+?) (?:took (?:a|\d+) Prize cards?|drew .+|ended their turn)$/.exec(line);
          const promotion = /^(.+?)['’]s .+? is now in the Active Spot$/.exec(line);
          const added = /^.+? was added to (.+?)['’]s hand$/.exec(line);
          if (ordinary && players.includes(ordinary[1]) || promotion && players.includes(promotion[1]) || added && players.includes(added[1])
            || /^[•·]/.test(raw.trim()) && !/\b(?:attached|discarded|moved|evolved|used|Knocked Out)\b/i.test(line)) continue;
          // No intervening effect, attachment, return or copy-changing action
          // may create the Energy needed by the later surviving Ability.
          return false;
        }
      }
      return false;
    };

    const invalidate = (raw: string, detailIndex: number, error: Unresolved) => {
      const line = clean(raw).replace(/^(.*?) attached (.+?) from (?:their |the )?(hand|deck|discard pile) to (.+)$/i, "$1 attached $2 to $4 from $3");
      const used = /^(.+?)['’]s (.+?) used (?:its Ability:\s*)?(.+)$/i.exec(line);
      const abilityTexts = used ? hp.abilityTexts(used[2], used[3], [input.selfPlayerName, input.opponentPlayerName].includes(used[1]) ? actorFor(used[1]) : undefined) : null;
      if (used && [input.selfPlayerName, input.opponentPlayerName].includes(used[1]) && abilityTexts?.length && abilityTexts.every((text) =>
        /^Once during your turn, you may look at the top \d+ cards of your deck and put \d+ of them into your hand\. Put the other cards? on the bottom of your deck\.$/i.test(text))) {
        // Copy identity does not change this fully understood effect's zone
        // totals. Recorded draw details apply once below; looking at and
        // replacing the other deck cards does not itself move a zone boundary.
        const draws = action.details.map(clean).filter((detail) => detail.startsWith(`${used[1]} drew `));
        const drawMatch = draws.length === 1 ? /^.+? drew (?:(a|\d+) cards?|([^,.]+))$/i.exec(draws[0]) : null;
        const drawn = drawMatch ? drawMatch[1] && !/^a$/i.test(drawMatch[1]) ? Number(drawMatch[1]) : 1 : null;
        if (!abilityTexts.every((text) => Number(/put (\d+) of them/i.exec(text)?.[1]) === drawn)) {
          markUncertain(actorFor(used[1]), ["hand", "deck"]);
        }
        next.partial = true;
        return;
      }
      if (used && error instanceof BoardCardUnresolved && abilityTexts?.length) {
        // Source-copy identity does not erase other independent board facts.
        // The recorded effect details still establish their own domains below.
        next.partial = true; return;
      }
      const attachmentDiscard = /^(?:.+?) (?:was|were) discarded from (.+?)['’]s (.+)$/i.exec(line);
      const knockout = /^(.+?)['’]s (.+?) was Knocked Out$/i.exec(line);
      const boardOwner = attachmentDiscard?.[1] ?? knockout?.[1];
      if (boardOwner && [input.selfPlayerName, input.opponentPlayerName].includes(boardOwner)) {
        const actor = actorFor(boardOwner);
        const recordedAmount = (text: string) => {
          const amount = /^a$/i.test(text) ? 1 : Number(text);
          return Number.isSafeInteger(amount) && amount > 0 && amount <= 60 ? amount : null;
        };
        const move = (amount: number) => {
          try { transferCounts(actor, "board", "discard", amount); }
          catch (error) {
            if (!(error instanceof CountConflict)) throw error;
            markUncertain(actor, error.zones); errors.push(error.message);
          }
        };
        if (knockout) {
          const discardDetailIndex = action.details.map(clean).findIndex((value) => value.endsWith(` discarded from ${boardOwner}'s ${knockout[2]}`)
            || value.endsWith(` discarded from ${boardOwner}’s ${knockout[2]}`));
          const detail = discardDetailIndex >= 0 ? clean(action.details[discardDetailIndex]) : null;
          const recordedAttachments = detail ? /^(a|\d+) cards? (?:was|were) discarded from /i.exec(detail) : null;
          const namedAttachmentLines = action.details.map(clean).filter((value) => /^(?!a cards? |\d+ cards? ).+? (?:was|were) discarded from /i.test(value)
            && (value.endsWith(` discarded from ${boardOwner}'s ${knockout[2]}`) || value.endsWith(` discarded from ${boardOwner}’s ${knockout[2]}`)));
          const namedAmount = namedAttachmentLines.reduce((sum, value) => sum + value.split(/ (?:was|were) discarded from /i)[0].split(",").length, 0);
          const candidates = allCards(next[actor]).filter((card) => card.name === knockout[2]);
          const retainedEnergy = !recordedAttachments && !namedAmount && survivingEnergyWitness(actor, knockout[2], candidates);
          const maximumBelow = candidates.map((card) => physicalCardCount(card) - 1 + (next[actor].boardPools ?? []).filter((pool) => pool.memberIds.includes(card.id)).reduce((sum, pool) => sum + pool.cards.length, 0));
          const namedExhaustsBudget = namedAmount > 0 && maximumBelow.length > 0 && maximumBelow.every((amount) => amount <= namedAmount);
          const completeBundle = recordedKnockoutBundle(boardOwner, knockout[2]);
          const amount = completeBundle !== null ? completeBundle.length : recordedAttachments ? recordedAmount(recordedAttachments[1]) : namedExhaustsBudget ? namedAmount : retainedEnergy ? 0 : null;
          const candidateSizes = candidates.map((card) => exactStackSize(next[actor], card));
          const discardedComponents: ReplayZoneCard[] = [];
          // A full recorded below-top multiset can identify an original top
          // whose position was lost, without guessing which projected ID it was.
          const listed = completeBundle ?? (recordedAttachments && discardDetailIndex >= 0 ? cardList(discardDetailIndex) : []);
          const retainedGroup = [...retainedTops.values()].filter((retained) => retained.actor === actor && retained.top.name === knockout[2]
            && retained.memberIds.some((id) => candidates.some((card) => card.id === id)));
          const completeTopAlternatives = retainedGroup.length >= candidates.length
            && candidates.every((card) => retainedGroup.some((retained) => retained.top.id === card.id))
            && retainedGroup.every((retained) => retained.components !== undefined);
          const eligibleRetained = completeTopAlternatives && amount !== null && recordedAttachments && listed.length === amount
            ? retainedGroup.filter((retained) => retained.components && JSON.stringify(retained.components) === JSON.stringify([...listed].sort())) : [];
          const provenTop = eligibleRetained.length === 1 ? eligibleRetained[0].top : undefined;
          if (candidates.length) {
            const side = next[actor]; const activeAffected = candidates.some((card) => card.id === side.active?.id);
            uncertainCopies(actor, candidates);
            const removed = candidates[0];
            discardedComponents.push(...removed.underlying,
              ...removed.energy.map((energy) => zoneCard(id(), /Energy$/i.test(energy) ? energy : `Basic ${energy} Energy`)),
              ...(removed.tool ? [zoneCard(id(), removed.tool)] : []), ...takeSoleMemberCards(actor, removed.id));
            side.discard.push(...discardedComponents);
            side.bench = side.bench.filter((card) => card.id !== removed.id);
            side.unplaced = (side.unplaced ?? []).filter((card) => card.id !== removed.id);
            if (activeAffected) {
              side.active = null; side.activeUncertain = candidates.length > 1;
              const survivors = candidates.slice(1);
              side.bench = side.bench.filter((card) => !survivors.some((survivor) => survivor.id === card.id));
              side.unplaced = [...(side.unplaced ?? []).filter((card) => !survivors.some((survivor) => survivor.id === card.id)), ...survivors];
            }
            const discardedTop = provenTop ? { ...structuredClone(provenTop), id: id() } : topCardEvidence(id(), removed);
            side.discard.unshift(discardedTop);
            stage("discard", "Knocked out top", [discardedTop], actor);
            if (!provenTop && retainedGroup.length) pendingTopDepartures.push({ actor, destination: "discard", id: discardedTop.id,
              topIds: retainedGroup.map((retained) => retained.top.physicalCardId!) });
            if (provenTop?.physicalCardId) {
              retainedTops.delete(provenTop.physicalCardId);
              for (const pool of side.boardPools ?? []) pool.memberEvidence = pool.memberEvidence?.filter((card) => card.physicalCardId !== provenTop.physicalCardId);
            }
            for (const retained of retainedTops.values()) if (retained.actor === actor) retained.memberIds = retained.memberIds.filter((id) => id !== removed.id);
            restoreCounterSurvivors(actor, knockout[2], candidates, removed.id);
          }
          // PTCGL's discarded-from total includes every card below the top
          // Pokémon, including its evolution layers, Energy and Tool.
          const malformed = Boolean(recordedAttachments && (amount === null || cardList(discardDetailIndex).length > amount))
            || amount !== null && (discardedComponents.length > amount || candidateSizes.every((size) => size !== null && size === candidateSizes[0]) && candidateSizes[0] !== 1 + amount);
          const sizes = malformed ? new Set<number>() : amount === null ? (candidateSizes.includes(null) ? new Set<number>() : new Set(candidateSizes as number[])) : new Set([1 + amount]);
          if (sizes.size === 1) {
            const belowTop = [...sizes][0] - 1;
            const memberIds = candidates.map((card) => card.id);
            const possible = (next[actor].boardPools ?? []).filter((pool) => pool.memberIds.some((id) => memberIds.includes(id))).flatMap((pool) => pool.cards);
            // When the recorded full stack exhausts the entire possible inventory,
            // all those components left play even though their old owner was pooled.
            if (discardedComponents.length + possible.length === belowTop) {
              const moved = takePooledCards(actor, memberIds, possible.map((card) => card.name), "discard");
              discardedComponents.push(...moved); next[actor].discard.push(...moved);
            } else if (listed.length === belowTop && (completeBundle !== null || recordedAttachments)) {
              const evidenced = discardedComponents.map((card) => card.name);
              const remaining = listed.filter((name) => { const index = evidenced.indexOf(name); if (index < 0) return true; evidenced.splice(index, 1); return false; });
              const moved = takePooledCards(actor, memberIds, remaining, "discard");
              discardedComponents.push(...moved); next[actor].discard.push(...moved);
              if (moved.length) stage("discard", "Recorded KO components", moved, actor);
            }
            move([...sizes][0]);
            aggregateKnockout = { actor, name: knockout[2], belowTop, reportedBelowTop: 0, memberIds, evidencedNames: discardedComponents.map((card) => card.name) };
          } else {
            markUncertain(actor, ["board", "discard"]);
            aggregateKnockout = { actor, name: knockout[2], belowTop: null, reportedBelowTop: 0, memberIds: candidates.map((card) => card.id) };
          }
          resolveDepartedPrintingMultisets(actor);
          refreshBoardPools(actor, "discard", sizes.size === 1 && aggregateKnockout?.belowTop !== null && discardedComponents.length === aggregateKnockout.belowTop, sizes.size === 1);
        } else {
          const members = allCards(next[actor]).filter((card) => card.name === attachmentDiscard![2]);
          const numericDetail = /^(a|\d+) cards? (?:was|were) discarded from /i.exec(line);
          const recordedNames = numericDetail ? cardList(detailIndex) : line.split(/ (?:was|were) discarded from /i)[0].split(",").map((name) => name.trim());
          const remaining = (next[actor].boardPools ?? []).filter((pool) => pool.memberIds.some((id) => members.some((card) => card.id === id))).flatMap((pool) => pool.cards.map((card) => card.name));
          const pooledOnly = recordedNames.length > 0 && recordedNames.every((name) => { const index = remaining.indexOf(name); if (index < 0) return false; remaining.splice(index, 1); return true; });
          if (pooledOnly && (!numericDetail || recordedAmount(numericDetail[1]) === recordedNames.length)) {
            const moved = takePooledCards(actor, members.map((card) => card.id), recordedNames);
            next[actor].discard.push(...moved); move(moved.length);
            const modifierKnowledge = next[actor].hpModifiersKnown;
            markUncertain(actor, ["board"], false); next[actor].hpModifiersKnown = modifierKnowledge;
            next.partial = true; return;
          }
          uncertainCopies(actor, members);
          const numeric = /^(a|\d+) cards? (?:was|were) discarded from /i.exec(line);
          const names = numeric ? [] : line.split(/ (?:was|were) discarded from /i)[0].split(",");
          const amount = numeric ? recordedAmount(numeric[1]) : names.length;
          if (aggregateKnockout?.actor === actor && aggregateKnockout.name === attachmentDiscard![2]) {
            const recordedNames = numeric ? cardList(detailIndex) : names.map((name) => name.trim());
            next[actor].discard.push(...recordedNames.map((name) => zoneCard(id(), name)));
            if (amount === null) markUncertain(actor, ["board", "discard"]);
            else {
              aggregateKnockout.reportedBelowTop += amount;
              if (aggregateKnockout.belowTop !== null && aggregateKnockout.reportedBelowTop > aggregateKnockout.belowTop) markUncertain(actor, ["board", "discard"]);
            }
          } else if (amount === null) markUncertain(actor, ["board", "discard"]);
          else move(amount);
        }
        const modifierKnowledge = previous[actor].hpModifiersKnown;
        markUncertain(actor, ["board", "discard"], false); next[actor].hpModifiersKnown = modifierKnowledge;
        next.partial = true;
        return;
      }
      if (error instanceof BoardCardUnresolved) {
        const evolution = /^(.+?) evolved (.+?) to (.+?) (?:in|on) the (Active Spot|Bench)$/i.exec(line);
        const attachment = /^(.+?) attached (.+?) to (.+?) (?:in|on) the (Active Spot|Bench)(?: from (?:their |the )?(hand|deck|discard pile))?$/i.exec(line);
        if (evolution || attachment) {
          const actor = actorFor((evolution ?? attachment)![1]);
          const name = evolution?.[3] ?? attachment![2];
          const alreadyPlayed = detailIndex >= 0 && next.playedCard?.actor === actor && next.playedCard.card.name === name;
          const origin = evolution ? "hand" : attachment![5] ?? effectOrigin(raw, detailIndex) ?? (detailIndex < 0 || alreadyPlayed ? "hand" : undefined);
          const side = next[actor]; const modifierKnowledge = side.hpModifiersKnown;
          const affectedName = evolution?.[2] ?? attachment![3];
          const position = evolution?.[4] ?? attachment![4];
          const candidates = (position === "Active Spot" ? [side.active] : side.bench).filter((card): card is ReplayCard => card?.name === affectedName);
          if (attachment) {
            candidates.forEach((card) => { if (!/^Basic .+ Energy$/i.test(name)) card.instanceUncertain = true; delete card.knownStackSize; });
            const boardRole = /Energy$/i.test(name) ? "energy" as const : "tool" as const;
            addBoardPool(actor, candidates, [{ ...zoneCard(id(), name), boardRole }]);
          } else uncertainCopies(actor, candidates, true);
          let evolvedTop: ReplayCard | undefined;
          if (evolution && candidates.length) {
            const target = candidates[0];
            // The old carrier is unidentified, but the one newly played top
            // has its own source birth. Never reuse that ID for the old layer
            // or bind the surviving namesake to a particular original copy.
            target.underlying.push(topCardEvidence(id(), target));
            if (target.knownStackSize !== undefined) target.knownStackSize++;
            lastEvolution.set(target.id, action.sourceSectionIndex); delete target.setId; delete target.localId; delete target.definitionKey;
            target.name = evolution[3]; target.physicalCardId = physicalId(); target.observedEffects = []; target.hp = null; target.abilityUsed = false; target.conditions = [];
            evolvedTop = target;
          }
          markUncertain(actor, ["board"], false); side.hpModifiersKnown = modifierKnowledge;
          // The log establishes one physical card leaving this source even
          // when it cannot identify which board copy receives it.
          if (origin === "hand" && !alreadyPlayed) {
            try {
              const [removed] = removeHand(next[actor], [name], 1, "board");
              if (evolvedTop && removed) Object.assign(evolvedTop, removed);
            }
            catch (countError) { if (!(countError instanceof CountConflict)) throw countError; markUncertain(actor, countError.zones); }
          } else if (origin === "deck") {
            try { next[actor].deckCount = changeCount(next[actor].deckCount, -1, ["deck"]); }
            catch (countError) { if (!(countError instanceof CountConflict)) throw countError; markUncertain(actor, ["deck"]); }
          } else if (origin === "discard" || origin === "discard pile") takeDiscard(actor, [name]);
          else if (!origin) markUncertain(actor, ["hand", "deck", "discard"]);
          if (origin && !alreadyPlayed) {
            try { transferCounts(actor, origin === "discard pile" ? "discard" : origin as CountZone, "board", 1); }
            catch (countError) {
              if (!(countError instanceof CountConflict)) throw countError;
              markUncertain(actor, countError.zones); errors.push(countError.message);
            }
          } else if (!origin) markUncertain(actor, ["board"]);
          if (evolvedTop) stage("evolve", "Recorded evolution", [evolvedTop], actor);
          next.partial = true;
          return;
        }
      }
      // Classify the operation, never words inside card/effect names (for
      // example, moving Damage Pump is a zone movement, not damage).
      const damageMutation = /^.+?['’]s .+? took \d+ damage(?: from .+)?$/i.test(line)
        || /^.+? (?:put|moved) (?:a|\d+) damage counters? (?:on|from) /i.test(line)
        || /^(?:a|\d+) damage counters? (?:was|were) placed on /i.test(line)
        || /^.+? healed \d+ damage from /i.test(line)
        || /^.+?['’]s .+? healed \d+ damage$/i.test(line)
        || /^.+?['’]s .+? used .+? on .+?['’]s .+? for \d+\+? damage/i.test(line)
        || /^(?:Total damage|Base damage|Damage breakdown|Weakness to .+?|Resistance to .+?):/i.test(line)
        || damageBreakdown;
      const playerNames = [input.selfPlayerName, input.opponentPlayerName];
      const operation = playerNames.sort((a, b) => b.length - a.length)
        .find((name) => line.startsWith(`${name} `));
      const verb = operation ? line.slice(operation.length + 1) : line;
      const explicitMovement = /^(?:moved|returned|put|shuffled) .+? from (?:their |the )?(discard pile|hand|deck) (?:in|into|to) (?:their |the )?(hand|deck)$/i.exec(verb);
      const actors = (["self", "opponent"] as const).filter((actor) => line.includes(actor === "self" ? input.selfPlayerName : input.opponentPlayerName));
      const directTargetOwner = /^.+?['’]s .+? used .+? on (.+?)['’]s .+? for \d+\+? damage/.exec(line)?.[1];
      const affected = directTargetOwner && [input.selfPlayerName, input.opponentPlayerName].includes(directTargetOwner) ? [actorFor(directTargetOwner)] : damageMutation && /damage counters?/.test(line) ? ["self", "opponent"] as const : actors.length ? actors : damageMutation && damageApplied.size
        ? (["self", "opponent"] as const).filter((actor) => allCards(next[actor]).some((card) => damageApplied.has(card.id)))
        : [event.actor];
      const severTopContinuity = (actor: ReplayActor) => {
        const named = allCards(next[actor]).filter((card) => line.includes(card.name));
        const cards = named.length ? named : allCards(next[actor]);
        for (const card of cards) { delete card.physicalCardId; delete card.activeEpisodeId; delete card.activePrintingEffects; card.instanceUncertain = true; }
        for (const [key, retained] of retainedTops) if (retained.actor === actor && retained.memberIds.some((id) => cards.some((card) => card.id === id))) retainedTops.delete(key);
      };
      for (const actor of affected) {
        if (damageMutation) {
          const attackTarget = /^.+?['’]s .+? used .+? on (.+?)['’]s (.+?) for \d+\+? damage/.exec(line);
          const breakdownTargetNames = /^(?:Total damage|Base damage|Damage breakdown|Weakness to .+?|Resistance to .+?):/.test(line) || damageBreakdown ? recordedAttacks.map((entry) => entry.match![5]) : null;
          const candidateNames = attackTarget ? [attackTarget[2]] : breakdownTargetNames?.length ? breakdownTargetNames : [...allCards(next.self), ...allCards(next.opponent)].filter((card) => line.includes(card.name)).map((card) => card.name);
          const named = allCards(next[actor]).filter((card) => candidateNames.includes(card.name));
          (candidateNames.length ? named : allCards(next[actor])).forEach((card) => { card.damageKnown = false; });
        } else if (/^(?:rearranged|reordered) .+? (?:in|within) (?:their|the) hand$/i.test(verb)) {
          // The recorded operation is explicitly confined to the hand. It
          // cannot erase independently evidenced board damage or attachments.
          markUncertain(actor, ["hand"], false);
        } else if (explicitMovement) {
          const origin = explicitMovement[1] === "discard pile" ? "discard" : explicitMovement[1] as "hand" | "deck";
          markUncertain(actor, [origin, explicitMovement[2] as "hand" | "deck"]);
        } else if (/^(?:moved|returned|put|shuffled)\b/i.test(verb) || /(?:was|were) added to .+?['’]s hand$/i.test(line)) {
          // Without a supported origin even the last public discard/board may
          // have changed. Preserve it only as explicitly incomplete history.
          severTopContinuity(actor);
          markUncertain(actor, ["hand", "deck", "discard", "board"]);
        } else if (/^discarded\b/i.test(verb)) {
          markUncertain(actor, [/ from (?:their |the )?deck$/i.test(verb) ? "deck" : "hand", "discard"]);
        } else if (/^(?:draw|drew)\b/i.test(verb)) {
          markUncertain(actor, ["hand", "deck"]);
        } else if (/^(?:attached|evolved|devolved|retreated|switched|played)\b/i.test(verb)
          || /(?:is now in the Active Spot|was Knocked Out|was devolved|to become the Active Pok[eé]mon)$/i.test(line)) {
          // An unsupported top/position change cannot keep an individual
          // physical lineage on the last-seen projection. Attachments alone
          // change the stack, not the immutable top printing.
          if (!/^attached\b/i.test(verb)) {
            severTopContinuity(actor);
          }
          markUncertain(actor, ["board", "hand"]);
        } else {
          // An unknown effect can change either player's zones. Keep last seen
          // public cards as historical evidence, explicitly marked incomplete.
          // An unclassified sentence establishes no particular zone movement.
          // Preserve independent quantities; mark implicated presentation only.
          markUncertain(actor, ["board"], false);
        }
      }
      next.partial = true;
    };
    const copyFacts = (state: ReplayState, actor: ReplayActor): CopyFact[] => allCards(state[actor]).map((card) => ({ card: { ...structuredClone(card), definitionOwner: actor }, position: state[actor].active?.id === card.id ? "active" : "bench", componentsOpen: openComponents(state[actor], card), positionKnown: !state[actor].activeUncertain && !state[actor].unplaced?.some((candidate) => candidate.id === card.id), entered: enteredPlay.get(card.id), evolved: lastEvolution.get(card.id) }));
    const captureCopyLine = (raw: string, before: ReplayState, ordinal: number) => {
      if (!proof.trace) return;
      const line = clean(raw).replace(/^(.*?) attached (.+?) from (?:their |the )?(hand|deck|discard pile) to (.+)$/i, "$1 attached $2 to $4 from $3");
      const barrierFacts = (card: ReplayCard, active: boolean) => JSON.stringify([card.name, card.setId, card.localId, card.observedEffects, card.damage, card.damageKnown,
        card.conditions, card.energy, card.tool, card.underlying.map((layer) => [layer.id, layer.name, layer.setId, layer.localId, layer.observedEffects]), card.instanceUncertain, active]);
      const affectedDomains = (actor: ReplayActor, name: string) => {
        if (name === "*") return ["*"];
        const names = new Set([name]);
        const previous = new Map(allCards(before[actor]).map((card) => [card.id, card])); const following = new Map(allCards(next[actor]).map((card) => [card.id, card]));
        for (const id of new Set([...previous.keys(), ...following.keys()])) {
          const a = previous.get(id); const b = following.get(id);
          if (!a || !b || barrierFacts(a, before[actor].active?.id === id) !== barrierFacts(b, next[actor].active?.id === id)) {
            if (a) names.add(a.name); if (b) names.add(b.name);
          }
        }
        const groups = [before, next].flatMap((state) => resolveReplayAssignmentGroups(state[actor]));
        let size: number;
        do { size = names.size; groups.filter((group) => group.some((card) => names.has(card.name))).forEach((group) => group.forEach((card) => names.add(card.name))); } while (names.size !== size);
        return [...names];
      };
      const emit = (actor: ReplayActor, name: string, kind: CopyStep["kind"], values: Partial<CopyStep> = {}, position?: "active" | "bench", mode: "both" | "facts" | "display" = "both", role?: "donor" | "recipient") => {
        const key = replayCopyKey(actionIndex, actor, clean(raw), name, position === "active" ? "Active Spot" : position === "bench" ? "Bench" : undefined, ordinal, role);
        const step = { key, event: actionIndex, section: action.sourceSectionIndex, actor, name, kind, cards: copyFacts(next, actor), ...values, ...(position ? { position } : {}) };
        if (mode !== "display") proof.trace!.push(step);
        if (mode !== "facts") proof.projectionTrace?.push({ ...step,
          ...(kind === "barrier" ? { barrierNames: affectedDomains(actor, name) } : {}),
          ...((kind === "ability" || kind === "witness") && values.effect ? { effectAllowed: (card: ReplayCard) => {
          // The observed native effect may narrow an unproven printing domain,
          // but cannot execute on a copy whose immutable native domain excludes it.
          // Probable display preferences never enter this query.
          const found = hp.resolve(card);
          const observed = hp.resolve({ ...card, observedEffects: [...new Set([...(card.observedEffects ?? []), values.effect!])] });
          return found?.coverage === "complete" && observed?.coverage === "complete" && found.candidates.some((candidate) => observed.candidates.some((compatible) => compatible.sourceCardId === candidate.sourceCardId)
            && (kind === "ability" ? candidate.abilities : candidate.attacks).some((effect) => normalizeText(effect.name) === normalizeText(values.effect!)));
        } } : {}) });
        return key;
      };
      // New physical Pokémon are identified by their source-scoped allocator,
      // independent of transaction/pool allocations in either compiler pass.
      let createdAny = false;
      for (const actor of ["self", "opponent"] as const) {
        const old = new Set(allCards(before[actor]).map((card) => card.id));
        const created = copyFacts(next, actor).filter((copy) => !old.has(copy.card.id));
        if (created.length && /\b(?:played|to the Bench)\b/i.test(line) && !/devolved/i.test(line)) { emit(actor, "", "create", { cards: created.map((copy) => ({ ...copy, card: { ...copy.card, damage: 0, damageKnown: true }, entered: action.sourceSectionIndex })) }); createdAny = true; }
      }
      let match: RegExpExecArray | null;
      if ((match = /^(.+?) evolved (.+?) to (.+?) (?:in|on) the (Active Spot|Bench)$/i.exec(line))) {
        const actor = actorFor(match[1]); const position = match[4] === "Active Spot" ? "active" : "bench";
        const values = { newName: match[3], timing: action.turn > 1 && action.actor === actor && !evolutionOverride() };
        emit(actor, match[2], "evolve", values, position, "facts");
        const changed = allCards(next[actor]).filter((card) => card.name === match![3] && allCards(before[actor]).some((old) => old.id === card.id && old.name === match![2]));
        emit(actor, match[2], "evolve", { ...values, ...(changed.length === 1 ? { preferredId: changed[0].id } : {}) }, position, "display"); return;
      }
      if ((match = /^(.+?) attached (.+?) to (.+?) (?:in|on) the (Active Spot|Bench)(?: from .+)?$/i.exec(line))) {
        const actor = actorFor(match[1]);
        if (/Energy$/i.test(match[2]) && effectOrigin(raw, ordinal) !== "board") emit(actor, match[3], "attach", { energy: match[2].replace(/^Basic (.+) Energy$/i, "$1") }, match[4] === "Active Spot" ? "active" : "bench");
        else {
          emit(actor, match[3], "barrier", {}, undefined, "facts");
          const found = hp.resolve({ ...pokemon("attachment-source", match[2]), definitionOwner: actor });
          if (effectOrigin(raw, ordinal) !== "board" && found?.coverage === "complete" && found.candidates.length && found.candidates.every((candidate) => candidate.category === "Trainer" && candidate.trainerType?.toLowerCase() === "tool")) emit(actor, match[3], "attach", { tool: match[2] }, match[4] === "Active Spot" ? "active" : "bench", "display");
          else emit(actor, match[3], "barrier", {}, undefined, "display");
        }
        return;
      }
      if ((match = /^(.+?) retreated (.+?) to (?:the )?Bench$/i.exec(line))) { emit(actorFor(match[1]), match[2], "retreat", {}, "active"); return; }
      if ((match = /^(.+?)['’]s (.+?) (?:is now in the Active Spot|was switched with .+? to become the Active Pok[eé]mon)$/i.exec(line))) {
        const actor = actorFor(match[1]);
        const captured = before[actor].active?.name !== match[2] || allCards(before[actor]).filter((card) => card.name === match![2]).length > 1 && lastPromotionActor !== actor;
        if (captured) emit(actor, match[2], "promote", {}, "bench");
        else if (/was switched with/i.test(line) && allCards(before[actor]).filter((card) => card.name === match![2]).length > 1) emit(actor, match[2], "promote", {}, "bench", "display");
        return;
      }
      if ((match = /^(.+?)['’]s (.+?) took (\d+) damage(?: from .+)?$/i.exec(line))) {
        const actor = actorFor(match[1]); const amount = Number(match[3]); const position = secondaryDamagePosition(actor, amount);
        const header = recordedAttacks.find((entry) => entry.match![4] === match![1] && entry.match![5] === match![2] && Number(entry.match![6]) === amount);
        if (header && !position) return; // Recorded attack receipt annotated once.
        emit(actor, match[2], "damage", { amount }, position === "Bench" ? "bench" : undefined); return;
      }
      if ((match = /^(.+?)['’]s (.+?) used (.+?) on (.+?)['’]s (.+?) for (\d+)\+? damage(?:\. (.+))?$/i.exec(line))) {
        const actor = actorFor(match[1]); const targetActor = actorFor(match[4]); const attacker = before[actor].active;
        const evidence = attacker && attackPrintingEvidence(attacker, match[3], before);
        const definition = evidence?.status === "copied" ? evidence.definitionCard : attacker;
        const active = actor !== targetActor && before[targetActor].active?.name === match[5] && !before[targetActor].activeUncertain && attacker && sourceAttackTargetsActive(attacker, match[3], before)
          || actor !== targetActor && evidence?.status !== "unmodelled" && definition && (ordinaryAttackTargetsActive(attacker!, match[3], before) || match[7] && / Weakness$/i.test(match[7]) && weaknessTargetsActive(before, definition, match[3]));
        if (evidence && evidence.status !== "unmodelled" && evidence.observedEffect) emit(actor, match[2], "witness", { effect: evidence.observedEffect }, "active");
        emit(targetActor, match[5], "damage", { amount: Number(match[6]) }, active ? "active" : undefined); return;
      }
      if ((match = /^(.+?)['’]s (.+?) used (?:its Ability:\s*)?(.+)$/i.exec(line)) && effectTag(raw) === "ability") {
        const actor = actorFor(match[1]); const texts = hp.abilityTexts(match[2], match[3], actor);
        const activation = resolveReplayAbilityActivation(texts);
        const once = activation.once;
        const symbols: Record<string, string> = { D: "Darkness", F: "Fighting", G: "Grass", L: "Lightning", M: "Metal", P: "Psychic", R: "Fire", W: "Water", Y: "Fairy", N: "Dragon", C: "Colorless" };
        const required = texts?.map((text) => /^Once during your turn, if this Pok[eé]mon has any \{([A-Z])\} Energy attached, /i.exec(text)?.[1]);
        const requiredEnergy = required?.length && required[0] && required.every((value) => value === required[0]) ? symbols[required[0]] : undefined;
        const sharedActive = activation.kind === "active_has_ability" && activeAbilityPredicateSafe(before, actor, match[2], activation.ability);
        const supportedCondition = activation.kind === "unconditional" || sharedActive || activation.kind === "basic_energy" && requiredEnergy !== undefined;
        if (once && supportedCondition && action.actor === actor && action.turn > 0 && abilityLimitContextSafe(before, match[2], match[3], actor)) {
          const cards = allCards(before[actor]);
          const members = cards.filter((card) => card.name === match![2]);
          const complete = (activation.kind === "unconditional" || sharedActive) && members.length > 0 && replayPassiveInventoriesComplete(before)
            && members.every((card) => {
              const evidence = hp.resolve(card);
              return evidence?.coverage === "complete" && evidence.candidates.length > 0 && evidence.candidates.every((candidate) => candidate.abilities.length === 1
                && normalizeText(candidate.abilities[0].name) === normalizeText(match![3])
                && candidate.abilities[0].text !== null && isReplayCopyIndependentOnceAbilityText(candidate.abilities[0].text));
            });
          emit(actor, match[2], "ability", { once, effect: match[3], requiredEnergy, ...(complete ? { cohortMembers: members.map((card) => card.id).sort() } : {}) });
        }
        else if (once) emit(actor, match[2], "barrier");
        return;
      }
      if ((match = /^(.+?)['’]s (.+?) was Knocked Out$/i.exec(line))) {
        const actor = actorFor(match[1]); const name = match[2]; const names: string[] = []; let amount: number | undefined;
        action.details.map(clean).forEach((detail, index, details) => {
          const removal = /^(.+?) (?:was|were) discarded from (.+?)['’]s (.+)$/i.exec(detail);
          if (!removal || removal[2] !== match![1] || removal[3] !== name) return;
          const numeric = /^(a|\d+) cards?$/i.exec(removal[1]);
          if (numeric) { amount = numeric[1] === "0" ? 0 : count(numeric[1]); names.push(...(details[index + 1] ?? "").split(",").map((value) => value.trim()).filter((value) => value && !/\b(?:was|were|drew|played)\b/.test(value))); }
          else names.push(...removal[1].split(",").map((value) => value.trim()));
        });
        const completeBundle = recordedKnockoutBundle(match[1], name);
        const knockout: Partial<CopyStep> = { belowTop: completeBundle ?? names, belowTopCount: completeBundle?.length ?? amount, lethal: (card, copies) => {
          // The first projection may put other valid copies in unplaced. HP
          // belongs to the symbolic allocation's board, not that projection's
          // arbitrarily materialized Active/Bench slots.
          const pools = resolveReplayKnockoutHpInventory(before[actor], copies, before.stadium?.actor === actor);
          if (!pools) return undefined;
          const state = structuredClone(before); const side = state[actor]; const cards = structuredClone(copies);
          side.active = cards.find((copy) => copy.position === "active")?.card ?? null;
          side.bench = cards.filter((copy) => copy.position === "bench").map((copy) => copy.card); side.unplaced = [];
          side.boardPools = pools;
          const symbolic = allCards(side).find((candidate) => candidate.id === card.id); if (!symbolic) return undefined;
          hp.update(state);
          const verdict = (candidate: ReplayCard) => candidate.hpBasis !== "known" || candidate.maxHp == null || candidate.damageKnown === false || candidate.hpModifierUncertain || candidate.hpModifierBasis === "unverified_attachment"
            ? undefined : candidate.damage >= candidate.maxHp;
          const established = verdict(symbolic);
          if (established !== undefined) return established;
          // A varying printed HP is not a probable lethal selector. Evaluate
          // every viable printing's effective maximum: known zero damage can
          // be nonlethal for all of them even when the exact HP is unidentified.
          const found = hp.resolve(symbolic);
          if (found?.coverage !== "complete" || !found.candidates.length) return undefined;
          const verdicts = found.candidates.map((printing) => {
            const alternative = structuredClone(state);
            const target = allCards(alternative[actor]).find((candidate) => candidate.id === card.id)!;
            target.setId = printing.setId; target.localId = printing.localId;
            hp.update(alternative);
            return verdict(target);
          });
          return verdicts[0] !== undefined && verdicts.every((value) => value === verdicts[0]) ? verdicts[0] : undefined;
        } };
        emit(actor, name, "ko", knockout, undefined, "facts");
        let activation: CopyStep | undefined;
        for (let index = actionIndex - 1; index >= 0 && actions[index].sourceSectionIndex === action.sourceSectionIndex; index--) {
          const title = clean(actions[index].sourceTitle);
          if (/^.+?['’]s .+? was Knocked Out$/i.test(title)) continue;
          const used = /^(.+?)['’]s (.+?) used (?:its Ability:\s*)?(.+)$/i.exec(title);
          if (used && actorFor(used[1]) === actor && used[2] === name) activation = [...(proof.projectionTrace ?? [])].reverse().find((step) => step.event === index && step.actor === actor && step.name === name && step.effect === used[3] && ["ability", "witness"].includes(step.kind));
          break;
        }
        const mandatorySelfKnockout = (card: ReplayCard) => {
          if (!activation?.effect) return false;
          const found = hp.resolve({ ...card, definitionOwner: actor, observedEffects: [...new Set([...(card.observedEffects ?? []), activation.effect])] });
          return found?.coverage === "complete" && found.candidates.length > 0 && found.candidates.every((printing) => {
            const effects = activation!.kind === "ability" ? printing.abilities : printing.attacks;
            const text = effects.find((effect) => normalizeText(effect.name) === normalizeText(activation!.effect!))?.text;
            return Boolean(text && (activation!.kind === "ability"
              ? /(?:^|\. )If you use this Ability, this Pok[eé]mon is Knocked Out\.(?: |$)/i.test(text)
              : /(?:^|\. )This Pok[eé]mon is Knocked Out\.(?: |$)/i.test(text)));
          });
        };
        if (activation && copyFacts(before, actor).some((copy) => copy.card.name === name && mandatorySelfKnockout(copy.card))) {
          emit(actor, name, "ko", { ...knockout, referenceKey: activation.key, lethal: (card, copies) => mandatorySelfKnockout(card) ? undefined : knockout.lethal?.(card, copies) }, undefined, "display");
        } else emit(actor, name, "ko", knockout, undefined, "display");
        return;
      }
      if ((match = /^(.+?) (?:was|were) discarded from (.+?)['’]s (.+)$/i.exec(line))) {
        if (/was Knocked Out/i.test(action.sourceTitle)) return;
        const actor = actorFor(match[2]);
        const retreat = /^(.+?) retreated (.+?) to (?:the )?Bench$/i.exec(clean(action.sourceTitle));
        const referenceKey = ordinal >= 0 && retreat?.[1] === match[2] && retreat[2] === match[3]
          ? replayCopyKey(actionIndex, actor, clean(action.sourceTitle), match[3], "Active Spot", -1) : undefined;
        if (/Energy$/i.test(match[1])) emit(actor, match[3], "remove_energy", { energy: match[1].replace(/^Basic (.+) Energy$/i, "$1"), ...(referenceKey ? { referenceKey } : {}) }); else emit(actor, match[3], "barrier");
        return;
      }
      if ((match = /^(.+?) moved (a|\d+) damage counters? from (.+?)['’]s (.+?) to (.+?)['’]s (.+)$/i.exec(line))) {
        const context = effectContext(); const plan = context && hp.effectConstraints(context.card, context.name, context.kind, "move_counters");
        if (context && plan?.status === "known" && plan.operation === "move_counters" && plan.from.owner === "effect_actor") {
          const targetActor = plan.to.owner === "effect_actor" ? context.actor : plan.to.owner === "opponent" ? context.actor === "self" ? "opponent" : "self" : undefined;
          emit(context.actor, match[4], "counters", { amount: count(match[2]) * 10 }, undefined, "facts");
          if (targetActor) emit(targetActor, match[6], "damage", { amount: count(match[2]) * 10 }, plan.to.zone === "active" ? "active" : plan.to.zone === "bench" ? "bench" : undefined, "facts");
          else emit(actorFor(match[5]), match[6], "barrier", {}, undefined, "facts");
          const activation = [...(proof.projectionTrace ?? [])].reverse().find((step) => step.event === actionIndex && step.actor === context.actor && step.name === context.card.name && step.effect === context.name && step.kind === (context.kind === "attack" ? "witness" : "ability"));
          if ((plan.from.subject === "source" || plan.to.subject === "source") && !activation) { emit(context.actor, match[4], "barrier", {}, undefined, "display"); return; }
          const donor = emit(context.actor, match[4], "counters", { amount: count(match[2]) * 10, ...(plan.from.subject === "source" ? { referenceKey: activation!.key } : {}) }, plan.from.zone === "active" ? "active" : plan.from.zone === "bench" ? "bench" : undefined, "display", "donor");
          if (targetActor) emit(targetActor, match[6], "damage", { amount: count(match[2]) * 10, ...(plan.to.subject === "source" && targetActor === context.actor ? { referenceKey: activation!.key } : {}), ...(plan.distinctTargets && targetActor === context.actor ? { distinctFromKey: donor } : {}) }, plan.to.zone === "active" ? "active" : plan.to.zone === "bench" ? "bench" : undefined, "display", "recipient");
          else emit(actorFor(match[5]), match[6], "barrier", {}, undefined, "display");
        } else emit(actorFor(match[3]), match[4], "barrier");
        return;
      }
      if ((match = /^.+? put (a|\d+) damage counters? on (.+?)['’]s (.+)$/i.exec(line))) {
        const context = effectContext(); const plan = context && hp.effectConstraints(context.card, context.name, context.kind, "put_counters");
        if (context && plan?.status === "known" && plan.operation === "put_counters" && plan.target.owner === "trigger") {
          emit(actorFor(match[2]), match[3], "barrier", {}, undefined, "facts");
          // The executed parser has validated the recorded Bench trigger.
          // Keep its uniquely changed physical target, not the possessive
          // effect-player name, in the symbolic source ledger.
          const controller = actorFor(/^(.+?) put /.exec(line)![1]);
          const changed = allCards(next[controller]).filter((card) => card.name === match![3] && card.damageKnown !== false && allCards(before[controller]).some((old) => old.id === card.id && old.damageKnown !== false && card.damage - old.damage === count(match![1]) * 10));
          if (changed.length === 1) emit(controller, match[3], "damage", { amount: count(match[1]) * 10, targetId: changed[0].id }, "bench", "display");
          else emit(controller, match[3], "barrier", {}, undefined, "display");
        } else if (context && plan?.status === "known" && plan.operation === "put_counters" && ["effect_actor", "opponent"].includes(plan.target.owner)) {
          const actor = plan.target.owner === "effect_actor" ? context.actor : context.actor === "self" ? "opponent" : "self";
          emit(actor, match[3], "damage", { amount: count(match[1]) * 10 }, plan.target.zone === "active" ? "active" : plan.target.zone === "bench" ? "bench" : undefined);
        } else {
          emit(actorFor(match[2]), match[3], "barrier", {}, undefined, "facts");
          const native = context?.name ? hp.resolve({ ...context.card, definitionOwner: context.actor,
            observedEffects: [...new Set([...(context.card.observedEffects ?? []), context.name])] }) : undefined;
          // The source already supplies the executed quantity. A multiplier
          // does not erase an otherwise unambiguous printed recipient scope.
          const opponentActive = native?.coverage === "complete" && native.candidates.length > 0 && native.candidates.every((printing) => {
            const effects = context!.kind === "attack" ? printing.attacks : printing.abilities;
            const text = effects.find((effect) => normalizeText(effect.name) === normalizeText(context!.name!))?.text;
            return text && [...text.matchAll(/\b(?:put|place) (?:\d+|a) damage counters? on /gi)].length === 1
              && /\b(?:put|place) (?:\d+|a) damage counters? on your opponent['’]s Active Pok[eé]mon for each card in your hand\./i.test(text)
              && !/\botherwise\b|\bif (?:heads|tails)\b/i.test(text);
          });
          const targetActor = context?.actor === "self" ? "opponent" : "self";
          if (opponentActive && before[targetActor].active?.name === match[3] && !before[targetActor].activeUncertain) {
            emit(targetActor, match[3], "damage", { amount: count(match[1]) * 10 }, "active", "display"); return;
          }
          const changedOwners = (["self", "opponent"] as const).filter((actor) => allCards(next[actor]).some((card) => card.name === match![3]
            && allCards(before[actor]).some((old) => old.id === card.id && barrierFacts(old, before[actor].active?.id === old.id) !== barrierFacts(card, next[actor].active?.id === card.id))));
          // Effect-player possessives do not establish card ownership. Close
          // the actually changed source domain, or both represented namesake
          // domains when this unsupported detail establishes no unique owner.
          const owners = changedOwners.length ? changedOwners : (["self", "opponent"] as const).filter((actor) => allCards(before[actor]).some((card) => card.name === match![3]));
          owners.forEach((actor) => emit(actor, match![3], "barrier", {}, undefined, "display"));
        }
        return;
      }
      if (createdAny) return;
      // Unsupported copy-affecting grammar is a local evidence barrier, even
      // when the presentation compiler understands that operation. Compare
      // source facts, excluding derived HP/art/dictionary decoration. This
      // covers condition checks, devolution, named stack returns and variants
      // without guessing their rules in the symbolic interpreter.
      const facts = (card: ReplayCard, active: boolean) => JSON.stringify([card.name, card.setId, card.localId, card.observedEffects, card.damage, card.damageKnown,
        card.conditions, card.energy, card.tool, card.underlying.map((layer) => [layer.id, layer.name, layer.setId, layer.localId, layer.observedEffects]), card.instanceUncertain, active]);
      for (const actor of ["self", "opponent"] as const) {
        const old = new Map(allCards(before[actor]).map((card) => [card.id, card])); const fresh = new Map(allCards(next[actor]).map((card) => [card.id, card]));
        const names = new Set<string>();
        for (const id of new Set([...old.keys(), ...fresh.keys()])) {
          const previous = old.get(id); const following = fresh.get(id);
          if (!previous || !following || facts(previous, before[actor].active?.id === id) !== facts(following, next[actor].active?.id === id)) {
            if (previous) names.add(previous.name); if (following) names.add(following.name);
          }
        }
        if (names.size) for (const name of names) emit(actor, name, "barrier");
        else if (!before[actor].uncertainZones?.includes("board") && next[actor].uncertainZones?.includes("board")) emit(actor, "*", "barrier");
      }
    };
    const applyLine = (raw: string, detailIndex: number, retry = false): void => {
      currentLine = clean(raw);
      currentLineOrdinal = detailIndex;
      const before = structuredClone(next);
      // Keep the source boundary immutable for evidence capture. Only a failed
      // evidence-pass operation needs a second copy for its rollback fallback.
      const evidenceBefore = before;
      const beforeStages = structuredClone(stages);
      stages.forEach((stage, index) => hp.copySnapshotHpProvenance(stage.cards, beforeStages[index].cards));
      const beforeContext = { copiedAttackContexts: new Map(copiedAttackContexts), pendingTopDepartures: structuredClone(pendingTopDepartures), retainedTops: structuredClone(retainedTops), selectedCopies: new Map(selectedCopies), counterEliminations: structuredClone(counterEliminations), recordedKnockoutBindings: new Map(recordedKnockoutBindings), boardShuffleActivation: boardShuffleActivation ? { ...boardShuffleActivation } : null, pendingPrizeAnnotations: structuredClone(pendingPrizeAnnotations), earlyPrizeAnnotations: new Map(earlyPrizeAnnotations), pendingBenchTriggers: [...pendingBenchTriggers], bonusDraw: bonusDraw ? { ...bonusDraw } : null, enteredPlay: new Map(enteredPlay), lastEvolution: new Map(lastEvolution), handEvolutionEntries: new Map(handEvolutionEntries), prizeAction, prizeCardsAdded, prizeAmount, attackDamage, expectedBreakdownDamage, devolutionActor, devolutionReturned: [...devolutionReturned], healed: healed ? { ...healed } : null, retreatingId: retreating?.id, knockedOut: knockedOut ? structuredClone(knockedOut) : null, aggregateKnockout: aggregateKnockout ? { ...aggregateKnockout } : null, label, damageBreakdown, lastPromotionActor, cardCounter, physicalCounter, damageApplied: new Map(damageApplied), changedCountZones: { self: new Set(changedCountZones.self), opponent: new Set(changedCountZones.opponent) } };
      const beforeDiscarded = structuredClone(discardedThisAction);
      const beforeCount = mutationCount;
      const beforeErrors = errors.length;
      const beforeConsumed = new Set(consumed);
      try {
        if (!parseLine(raw, detailIndex)) throw new Unresolved(detailIndex < 0
          ? "This action is not supported by the beta replay grammar."
          : `Unresolved detail: ${anonymise(raw, input)}`);
        for (const actor of ["self", "opponent"] as const) {
          const side = next[actor]; const cards = allCards(side);
          const recordedCards = cards.length + cards.reduce((total, card) => total + card.underlying.length + card.energy.length + Number(Boolean(card.tool)), 0) + side.knownHand.length + side.discard.length;
          if (recordedCards > 120 || side.handCount !== null && (side.handCount > 60 || side.knownHand.length > side.handCount)
            || cards.some((card) => !Number.isSafeInteger(card.damage) || card.damage < 0)) {
            throw new Unresolved("The reconstructed state conflicts with the recorded cards or exceeds the beta replay bounds.");
          }
        }
      } catch (error) {
        if (!(error instanceof Unresolved)) throw error;
        next = proof.trace ? structuredClone(before) : before;
        stages.splice(0, stages.length, ...beforeStages);
        discardedThisAction.splice(0, discardedThisAction.length, ...beforeDiscarded);
        mutationCount = beforeCount; counterEliminations = beforeContext.counterEliminations; recordedKnockoutBindings.clear(); beforeContext.recordedKnockoutBindings.forEach((value, key) => recordedKnockoutBindings.set(key, value)); boardShuffleActivation = beforeContext.boardShuffleActivation; pendingPrizeAnnotations = beforeContext.pendingPrizeAnnotations; earlyPrizeAnnotations.clear(); beforeContext.earlyPrizeAnnotations.forEach((value, key) => earlyPrizeAnnotations.set(key, value)); pendingBenchTriggers = beforeContext.pendingBenchTriggers;
        for (const [history, saved] of [[enteredPlay, beforeContext.enteredPlay], [lastEvolution, beforeContext.lastEvolution]]) { history.clear(); saved.forEach((value, key) => history.set(key, value)); }
        handEvolutionEntries.clear(); beforeContext.handEvolutionEntries.forEach((value, key) => handEvolutionEntries.set(key, value));
        pendingTopDepartures.splice(0, pendingTopDepartures.length, ...beforeContext.pendingTopDepartures);
        retainedTops.clear(); beforeContext.retainedTops.forEach((value, key) => retainedTops.set(key, value));
        selectedCopies.clear(); beforeContext.selectedCopies.forEach((value, key) => selectedCopies.set(key, value));
        copiedAttackContexts.clear(); beforeContext.copiedAttackContexts.forEach((value, key) => copiedAttackContexts.set(key, value));
        prizeAction = beforeContext.prizeAction; prizeCardsAdded = beforeContext.prizeCardsAdded; prizeAmount = beforeContext.prizeAmount; bonusDraw = beforeContext.bonusDraw;
        attackDamage = beforeContext.attackDamage; expectedBreakdownDamage = beforeContext.expectedBreakdownDamage; devolutionActor = beforeContext.devolutionActor; devolutionReturned = beforeContext.devolutionReturned; healed = beforeContext.healed; knockedOut = beforeContext.knockedOut; aggregateKnockout = beforeContext.aggregateKnockout;
        for (const actor of ["self", "opponent"] as const) {
          changedCountZones[actor].clear(); beforeContext.changedCountZones[actor].forEach((zone) => changedCountZones[actor].add(zone));
        }
        retreating = [...allCards(next.self), ...allCards(next.opponent)].find((card) => card.id === beforeContext.retreatingId) ?? null;
        label = beforeContext.label; damageBreakdown = beforeContext.damageBreakdown; lastPromotionActor = beforeContext.lastPromotionActor; cardCounter = beforeContext.cardCounter; physicalCounter = beforeContext.physicalCounter;
        damageApplied.clear(); beforeContext.damageApplied.forEach((value, key) => damageApplied.set(key, value));
        errors.splice(beforeErrors); errors.push(error.message);
        if (error instanceof CountConflict && !retry) {
          // A numeric contradiction removes count certainty, not an explicitly
          // named attachment/draw/movement. Reapply once against unknown counts.
          const line = clean(raw);
          const owner = [input.selfPlayerName, input.opponentPlayerName].sort((a, b) => b.length - a.length)
            .find((player) => [" ", "'s ", "’s "].some((separator) => line.startsWith(`${player}${separator}`))
              || line.endsWith(`${player}'s hand`) || line.endsWith(`${player}’s hand`));
          markUncertain(owner ? actorFor(owner) : event.actor, error.zones);
          consumed.clear(); beforeConsumed.forEach((index) => consumed.add(index));
          next.partial = true; applyLine(raw, detailIndex, true); return;
        } else invalidate(raw, detailIndex, error);
      }
      const componentNames = (state: ReplayState, actor: ReplayActor, memberIds: string[]) => {
        const side = state[actor];
        return [...allCards(side).filter((card) => memberIds.includes(card.id)).flatMap((card) => [
          ...card.underlying.map((layer) => layer.name), ...card.energy.map((energy) => /Energy$/i.test(energy) ? energy : `Basic ${energy} Energy`), ...(card.tool ? [card.tool] : [])]),
          ...(side.boardPools ?? []).filter((pool) => pool.memberIds.some((id) => memberIds.includes(id))).flatMap((pool) => pool.cards.map((card) => card.name))].sort();
      };
      const isKnockout = /^.+?['’]s .+? was Knocked Out/i.test(clean(raw))
        || / (?:was|were) discarded from /i.test(clean(raw)) && Boolean(aggregateKnockout || knockedOut);
      let attachmentTransfer = false;
      if (/^.+? attached .+? Energy to /i.test(clean(raw))) {
        try { attachmentTransfer = effectOrigin(raw, detailIndex) === "board"; }
        catch { attachmentTransfer = true; } // Conflicting origin cannot preserve an old allocation proof.
      }
      const redistribution = attachmentTransfer || /\b(?:moved|transferred|reassigned|rearranged)\b/i.test(clean(raw)) && /\b(?:Energy|Tool|attachments?)\b/i.test(clean(raw));
      if (!isKnockout) for (const retained of retainedTops.values()) {
        if (redistribution && (clean(raw).includes(retained.top.name) || attachmentTransfer)
          || JSON.stringify(componentNames(evidenceBefore, retained.actor, retained.memberIds)) !== JSON.stringify(componentNames(next, retained.actor, retained.memberIds))) delete retained.components;
      }
      expireHandEvolutionEntries();
      captureCopyLine(raw, evidenceBefore, detailIndex);
    };
    applyLine(action.sourceTitle, -1);
    for (let index = 0; index < action.details.length; index++) {
      if (!consumed.has(index)) applyLine(action.details[index], index);
    }
    for (const entry of recordedAttacks) {
      const owner = actorFor(entry.match![1]); const attacker = next[owner].active;
      if (attacker?.name === entry.match![2] && !action.details.some((raw) => /\b(?:attached|discarded|moved|returned|shuffled)\b.*Energy|Energy.*\b(?:discarded|moved|returned|shuffled)\b/i.test(clean(raw)))) bindAttackEnergy(owner, attacker, entry.match![3]);
    }
    for (const cohort of proof.copies?.cohorts ?? []) {
      if (cohort.section !== action.sourceSectionIndex || actionIndex < cohort.useEvents[0] || actionIndex >= cohort.untilEvent) continue;
      const cards = allCards(next[cohort.actor]).filter((card) => card.name === cohort.name);
      if (cards.length === cohort.memberIds.length && cards.every((card) => cohort.memberIds.includes(card.id))) cards.forEach((card) => {
        if (actionIndex >= cohort.fromEvent) card.abilityUsed = true;
        // Before completion the source proves a usage count, not unusedness of
        // each possible member. Preserve independently proven used markers.
        else if (card.abilityUsed !== true) delete card.abilityUsed;
      });
      // This is only a universal usage marker, not an ordered copy selection
      // or native printing/effect observation on an unidentified physical top.
    }
    for (const fact of proof.copies?.used.get(actionIndex) ?? []) {
      const card = allCards(next[fact.actor]).find((candidate) => candidate.id === fact.id && candidate.name === fact.name && !candidate.instanceUncertain);
      if (card) { card.abilityUsed = true; for (const effect of fact.effects) observeEffect(card, effect); }
    }
    for (const actor of ["self", "opponent"] as const) {
      refreshBoardPools(actor);
      const side = next[actor];
      if (side.discardCount != null && side.discardCount !== side.discard.length) side.discardIdentitiesKnown = false;
    }
    const section = sectionEnds.get(actionIndex);
    if (section) for (const actor of ["self", "opponent"] as const) {
      const name = actor === "self" ? input.selfPlayerName : input.opponentPlayerName;
      const prizes = section.prizesAfterTurn[name];
      if (Number.isInteger(prizes) && prizes >= 0 && prizes <= 6) {
        // Opening draws and mulligan returns were counted as recorded. Prize
        // placement is omitted from these logs and evidenced at setup's end.
        if (completeSetup && section === setup) {
          try { next[actor].deckCount = changeCount(next[actor].deckCount, -prizes, ["deck"]); }
          catch (error) {
            if (!(error instanceof CountConflict)) throw error;
            markUncertain(actor, ["deck"]); next.partial = true; errors.push(error.message);
          }
          transferCounts(actor, "deck", "prizes", prizes);
        }
        if (section !== setup && next[actor].prizesRemaining !== prizes) {
          changedCountZones[actor].add("prizes"); changedCountZones[actor].add("hand");
        }
        next[actor].prizesRemaining = prizes; clearUncertain(actor, "prizes");
      }
    }
    if (completeSetup) for (const actor of ["self", "opponent"] as const) {
      const side = next[actor];
      const otherCounts = [side.prizesRemaining, side.handCount, side.inPlayCount ?? null, side.discardCount ?? null];
      const knownTotal = [side.deckCount, ...otherCounts].reduce<number>((total, value) => total + (value ?? 0), 0);
      if (knownTotal > 60) {
        const zones = [...changedCountZones[actor]];
        if (!zones.length) zones.push("hand", "board", "discard", "prizes");
        markUncertain(actor, zones); next.partial = true;
        errors.push("The known zone totals exceed the 60-card game boundary.");
        continue;
      }
      if (otherCounts.some((value) => value === null)) continue;
      const derivedDeck = 60 - otherCounts.reduce<number>((total, value) => total + value!, 0);
      if (derivedDeck < 0 || derivedDeck > 60 || side.deckCount !== null && side.deckCount !== derivedDeck) {
        const zones = [...changedCountZones[actor]];
        if (side.deckCount === null) zones.push("deck");
        if (!zones.length) zones.push("hand", "board", "discard", "prizes");
        markUncertain(actor, zones); next.partial = true;
        errors.push("The recorded zone totals conflict with the 60-card game boundary.");
      } else {
        side.deckCount = derivedDeck; clearUncertain(actor, "deck");
      }
    }
    for (const actor of ["self", "opponent"] as const) {
      const side = next[actor];
      const represented = allCards(side).reduce((sum, card) => sum + physicalCardCount(card), 0) + (side.boardPools ?? []).reduce((sum, pool) => sum + pool.cards.length, 0) + Number(next.stadium?.actor === actor);
      if (side.inPlayCount != null && represented !== side.inPlayCount) {
        const modifierKnowledge = side.hpModifiersKnown;
        markUncertain(actor, ["board"], false); side.hpModifiersKnown = modifierKnowledge; next.partial = true;
        errors.push("The visible physical inventory does not match the independently recorded in-play total.");
      }
    }
    for (const cohort of proof.copies?.cohorts ?? []) {
      if (!cohort.useEvents.includes(actionIndex) || cohort.section !== action.sourceSectionIndex || action.actor !== cohort.actor
        || errors.length !== 1 || errors[0] !== `The log does not identify which ${cohort.name} was affected.`) continue;
      const used = /^(.+?)['’]s (.+?) used (?:its Ability:\s*)?(.+)$/i.exec(clean(action.sourceTitle));
      const cards = allCards(next[cohort.actor]).filter((card) => card.name === cohort.name);
      if (!used || actorFor(used[1]) !== cohort.actor || used[2] !== cohort.name || normalizeText(used[3]) !== normalizeText(cohort.effect)
        || effectTag(action.sourceTitle) !== "ability" || cards.length !== cohort.memberIds.length || !cards.every((card) => cohort.memberIds.includes(card.id))) continue;
      errors.length = 0;
      // The source records one activation here. Its order within the proved
      // once-per-copy cohort is immaterial, and must not invent another action
      // or show every copy activating at this single source step.
      stage("ability", cohort.effect, [], cohort.actor);
      stages[stages.length - 1].collective = true;
      label = "Ability"; mutationCount++;
    }
    understoodMutations += mutationCount;
    event.label = label;
    if (stages.length) event.transaction = { actor: event.actor, title: event.summary, stages };
    if (errors.length) {
      event.unresolved = errors;
      program.diagnostics.unresolvedActions.push(actionIndex);
      program.diagnostics.unresolvedMutations++;
    }
    if (proof.printing) hp.applyPrintingProofs(next, actionIndex + 1, proof.printing);
    hp.update(next);
    hp.decorateState(next);
    for (const entry of stages) {
      entry.cards.forEach((card) => { if (entry.actor && !card.definitionOwner) card.definitionOwner = entry.actor; hp.decorateCard(card); });
      for (const [owner, cards] of Object.entries(entry.actorCards ?? {})) cards?.forEach((card) => { if (!card.definitionOwner) card.definitionOwner = owner as ReplayActor; hp.decorateCard(card); });
    }
    const recordedAbility = /^(.+?)['’]s (.+?) used (?:its Ability:\s*)?(.+)$/i.exec(clean(action.sourceTitle));
    if (recordedAbility && effectTag(action.sourceTitle) === "ability" && [input.selfPlayerName, input.opponentPlayerName].includes(recordedAbility[1])) {
      // A recorded execution can leave its copy unidentified while still
      // establishing that a possible permission context was activated.
      attackRouteHistory.push({ card: { id: `route-context-${actionIndex}`, name: recordedAbility[2], imageUrl: "", definitionOwner: actorFor(recordedAbility[1]) }, effect: recordedAbility[3], kind: "ability" });
    }
    if (next.playedCard) attackRouteHistory.push({ card: next.playedCard.card, kind: "trainer" });
    for (const entry of stages) if (!entry.collective && (entry.kind === "ability" || entry.kind === "attack")) for (const card of entry.cards) {
      const definition = entry.kind === "attack" ? copiedAttackContexts.get(attackContextKey(entry.actor, card, entry.label)) : undefined;
      attackRouteHistory.push({ card: definition ?? card, effect: entry.label, kind: entry.kind });
    }
    const recordedAttack = recordedAttacks.find((entry) => entry.index === -1)?.match
      ?? (effectTag(action.sourceTitle) === "attack" ? /^(.+?)['’]s (.+?) used (.+)$/i.exec(clean(action.sourceTitle)) : null);
    if (recordedAttack && [input.selfPlayerName, input.opponentPlayerName].includes(recordedAttack[1])) {
      const actor = actorFor(recordedAttack[1]);
      const staged = stages.some((entry) => entry.kind === "attack" && entry.actor === actor && entry.label === recordedAttack[3]
        && entry.cards.some((card) => card.name === recordedAttack[2]));
      if (!staged) attackRouteHistory.push({ card: { id: `route-context-${actionIndex}`, name: recordedAttack[2], imageUrl: "", definitionOwner: actor }, effect: recordedAttack[3], kind: "attack" });
    }
    program.frames.push(next);
    previousSectionIndex = action.sourceSectionIndex;
    program.events.push(event);
  });
  if (proof.printing) hp.applySeenPrintingPreferences(program, proof.printing);
  program.cardResolutions = hp.collectResolutions();
  program.diagnostics.evidencedActions = program.events.length;
  if (program.diagnostics.unresolvedActions.length) program.diagnostics.messages.push("Some recorded transitions could not be reconstructed. Affected information is marked unknown; independently recorded transitions remain visible.");
  program.diagnostics.messages.push("Artwork and printed details use the same compatible card definition. Confirmed HP requires agreement across the compatible candidates; probable HP is labelled and unresolved modifiers remain unknown. Exact printing is labelled only when evidenced. Discard identities include only evidenced cards.");
  program.status = understoodMutations > 0 ? "partial" : "unsupported";
  if (JSON.stringify(program).length > 8_000_000) {
    program.events = [];
    program.frames = [initial];
    program.status = "unsupported";
    program.diagnostics.messages = ["This Battle Log produces more board state than the beta replay can display. Its original source is still available in Battle Logs."];
  }
  if (program.events.length) selectedCopies.forEach((value, key) => proof.selections?.set(key, value));
  return program;
}
