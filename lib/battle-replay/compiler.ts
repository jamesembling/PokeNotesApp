import { normalizeText } from "@/lib/log-import/normalization";
import { decodeLogSections } from "@/lib/battle-log/runtime-validation";
import { flattenReplaySourceActions } from "./source";
import { createReplayHpContext } from "./hp";
import { replayBenchTriggerMatches, type ReplayEffectTarget } from "./effect-targets";
import type { ReplayCondition } from "./conditions";
import type {
  ReplayActor, ReplayCard, ReplayEvent, ReplayLogSource, ReplayProgram,
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
    ...(card.setId ? { setId: card.setId } : {}),
    ...(card.localId ? { localId: card.localId } : {}),
  };
}

function pokemon(id: string, name: string): ReplayCard {
  return { ...zoneCard(id, name), hp: null, damage: 0, energy: [], underlying: [] };
}

function emptySide(name: string): ReplaySide {
  return { name, active: null, bench: [], unplaced: [], activeUncertain: false, hpModifiersKnown: true, deckCount: null, handCount: null, inPlayCount: null, discardCount: null, knownHand: [], discard: [], prizesRemaining: null };
}

function changeCount(value: number | null, change: number, zones: CountZone[] = ["hand", "deck"]): number | null {
  if (value === null) return null;
  const next = value + change;
  if (next < 0 || next > 60) throw new CountConflict("The recorded card count conflicts with the reconstructed zone.", zones);
  return next;
}

function removeHand(side: ReplaySide, names: string[], amount = names.length, destination?: CountZone) {
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
  for (const name of names) {
    const index = side.knownHand.findIndex((card) => card.name === name);
    if (index >= 0) side.knownHand.splice(index, 1);
  }
  // With an unidentified removal we cannot know which previously seen cards remain.
  if (amount > names.length) side.knownHand = [];
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
export function compileBattleReplay(input: ReplayLogSource): ReplayProgram {
  const hp = createReplayHpContext(input.cardDefinitions, input.format, input.selfCardDefinitions, input.date);
  const enteredPlay = new Map<string, number>();
  const lastEvolution = new Map<string, number>();
  let currentSection = -1;
  let pendingPrizeAnnotations: Record<ReplayActor, { section: number; remaining: number } | null> = { self: null, opponent: null };
  const earlyPrizeAnnotations = new Map<number, { amount: number; names: string[] }>();
  let pendingBenchTriggers: Array<{ actor: ReplayActor; cardId: string; section: number; stadium: string }> = [];
  const sameHistory = (left: ReplayCard, right: ReplayCard) => [enteredPlay, lastEvolution].every((history) => (history.get(left.id) === currentSection) === (history.get(right.id) === currentSection));
  const findCard = (side: ReplaySide, name: string, position?: string) => findBoardCard(side, name, position, hp, undefined, sameHistory);
  const findAbilityCard = (side: ReplaySide, name: string, effect: string) => {
    const texts = hp.abilityTexts(name, effect, allCards(side).find((card) => card.name === name)?.definitionOwner);
    const oncePerCopy = texts?.length && texts.every((text) => /^Once during your turn[, (]/i.test(text)
      && !/(?:can['’]?t|cannot|may not) (?:use|apply) more than 1|only (?:use|apply) (?:this|1|one).+?Ability|(?:use|apply) only (?:1|one)\b/i.test(text));
    const energyTypes: Record<string, string> = { D: "Darkness", F: "Fighting", G: "Grass", L: "Lightning", M: "Metal", P: "Psychic", R: "Fire", W: "Water", Y: "Fairy", N: "Dragon", C: "Colorless" };
    const requirements = texts?.map((text) => /if this Pok[eé]mon has any \{([A-Z])\} Energy attached/i.exec(text)?.[1]);
    const required = requirements?.length && requirements.every((symbol) => symbol === requirements[0]) ? energyTypes[requirements[0] ?? ""] : undefined;
    const canHaveRequiredEnergy = (card: ReplayCard) => !required || card.instanceUncertain || card.energy.some((energy) => energy === required || energy === `Basic ${required} Energy`
      // Special Energy can supply several types; absence is conclusive only
      // for a complete stack of recorded basic Energy.
      || /Energy$/i.test(energy));
    return findBoardCard(side, name, undefined, hp, (card) => (!oncePerCopy || !card.abilityUsed) && canHaveRequiredEnergy(card), sameHistory);
  };
  const ordinaryAttackTargetsActive = (attacker: ReplayCard, effect: string, recordedDamage: number) => {
    const evidence = hp.resolve({ ...attacker, observedEffects: [...(attacker.observedEffects ?? []), effect] });
    if (evidence?.coverage !== "complete" || !evidence.candidates.length) return false;
    return evidence.candidates.every((candidate) => {
      const attacks = candidate.attacks.filter((attack) => normalizeText(attack.name) === normalizeText(effect));
      if (attacks.length !== 1) return false;
      const attack = attacks[0];
      if (attack.damage === null || !/^\d+\+?$/.test(attack.damage) || attack.text === null) return false;
      const conditionalBoost = /^If this Pok[eé]mon moved from your Bench to (?:the )?Active Spot (?:this turn|during this turn), this attack does (\d+) more damage\.$/i.test(attack.text.trim());
      if (attack.damage.endsWith("+") && !conditionalBoost) return false;
      if (Number(attack.damage.replace("+", "")) !== recordedDamage && !conditionalBoost) return false;
      // Only complete understood clauses establish ordinary Active damage.
      // Absence of a Bench keyword alone cannot rule out target selection.
      return attack.text.trim() === "" || conditionalBoost || /^Put (?:a|\d+) damage counters? on (?:1 of |each of )?your opponent['’]s (?:Benched )?Pok[eé]mon(?: in any way you like)?\.$/i.test(attack.text.trim()) || /^During your opponent['’]s next turn, they can['’]t play any Item cards from their hand\.$/i.test(attack.text.trim());
    });
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
  const recordedKnockoutBindings = new Map<number, string>();
  let counterEliminations: Array<{ actionIndex: number; actor: ReplayActor; name: string; ids: string[] }> = [];
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
    Object.assign(initial[actor], { deckCount: 60, handCount: 0, inPlayCount: 0, discardCount: 0, prizesRemaining: 0 });
  }
  const sectionEnds = new Map<number, (typeof sections)[number]>();
  let offset = 0;
  for (const section of sections) { offset += section.actions.length; sectionEnds.set(offset - 1, section); }
  // Internal history is keyed by physical stack, not its evolving top name.
  let understoodMutations = 0;
  let previousSectionIndex = -1;
  actions.forEach((action, actionIndex) => {
    currentSection = action.sourceSectionIndex;
    for (const actor of ["self", "opponent"] as const) {
      const pending = pendingPrizeAnnotations[actor]; const player = actor === "self" ? input.selfPlayerName : input.opponentPlayerName;
      if (pending && (pending.section !== currentSection || clean(action.sourceTitle).startsWith(`${player} `) && /^(?:drew|played|attached|evolved|discarded|shuffled|moved)\b/i.test(clean(action.sourceTitle).slice(player.length + 1)))) pendingPrizeAnnotations[actor] = null;
    }
    const previous = program.frames.at(-1)!;
    let next = structuredClone(previous);
    next.playedCard = null;
    const stages: ReplayTransactionStage[] = [];
    let label = "Action";
    let mutationCount = 0;
    let cardCounter = 0;
    let prizeAction = false;
    let prizeCardsAdded = 0;
    let prizeAmount = 0;
    let bonusDraw: { actor: ReplayActor; amount: number; annotated: number } | null = null;
    let attackDamage: number | null = null;
    let retreating: ReplayCard | null = null;
    let knockedOut: ReplayCard | null = null;
    let aggregateKnockout: { actor: ReplayActor; name: string; belowTop: number | null; reportedBelowTop: number } | null = null;
    const recordedAttacks = [action.sourceTitle, ...action.details].map(clean).map((line, index) => ({ index: index - 1, match: /^(.+?)['’]s (.+?) used (.+?) on (.+?)['’]s (.+?) for (\d+)\+? damage/.exec(line) })).filter((entry) => entry.match);
    const breakdownDamage = (index: number) => (recordedAttacks.findLast((entry) => entry.index < index) ?? recordedAttacks.find((entry) => entry.index > index))?.match?.[6];
    let expectedBreakdownDamage: number | null = null;
    let boardShuffleActivation: { actor: ReplayActor; cardId: string; name: string; effect: string; drawAmount: number } | null = null;
    let healed: { actor: ReplayActor; id: string } | null = null;
    const consumed = new Set<number>();
    const errors: string[] = [];
    const discardedThisAction: Array<{ actor: ReplayActor; name: string }> = [];
    const changedCountZones = { self: new Set<CountZone>(), opponent: new Set<CountZone>() };
    const damageApplied = new Map<string, number>();
    let damageBreakdown = false;
    let lastPromotionActor: ReplayActor | null = null;
    const effectTag = (raw: string) => input.effectTags?.[raw] ?? input.effectTags?.[clean(raw)] ?? input.effectTags?.[`${clean(raw)}.`];
    const effectOrigin = (raw: string, detailIndex: number) => (detailIndex >= 0 ? input.effectDetailOrigins?.[`${actionIndex}:${detailIndex}`] : undefined)
      ?? input.effectOrigins?.[raw]
      ?? input.effectOrigins?.[clean(raw)] ?? input.effectOrigins?.[`${clean(raw)}.`]
      ?? input.effectOrigins?.[action.sourceTitle];
    const markUncertain = (actor: ReplayActor, zones: NonNullable<ReplaySide["uncertainZones"]>, countsUnknown = true) => {
      const side = next[actor];
      side.uncertainZones = [...new Set([...(side.uncertainZones ?? []), ...zones])];
      if (zones.includes("hand")) { if (countsUnknown) side.handCount = null; side.knownHand = []; }
      if (countsUnknown && zones.includes("deck")) side.deckCount = null;
      if (countsUnknown && zones.includes("prizes")) side.prizesRemaining = null;
      if (zones.includes("board")) side.hpModifiersKnown = false;
      if (countsUnknown && zones.includes("board")) side.inPlayCount = null;
      if (countsUnknown && zones.includes("discard")) side.discardCount = null;
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
    const takeDiscard = (actor: ReplayActor, names: string[]) => {
      for (const name of names) {
        const index = next[actor].discard.findIndex((card) => card.name === name);
        // A recorded origin establishes a real card even when earlier discard
        // history is absent; do not manufacture a duplicate retained in the pile.
        if (index >= 0) next[actor].discard.splice(index, 1);
        else { markUncertain(actor, ["discard"], false); next.partial = true; }
      }
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
    const stage = (kind: ReplayTransactionStage["kind"], title: string, cards: ReplayZoneCard[], actor?: ReplayActor, hiddenCount?: number) => {
      if (kind === "bench") cards.forEach((card) => {
        if (!enteredPlay.has(card.id)) enteredPlay.set(card.id, action.sourceSectionIndex);
        if (actor && next[actor].bench.some((candidate) => candidate.id === card.id) && next.stadium && action.turn > 0 && action.actor === actor) {
          const source = { name: next.stadium.name, definitionOwner: next.stadium.actor };
          const plan = hp.effectConstraints(source, undefined, "stadium", "put_counters");
          if (plan.status === "known" && plan.operation === "put_counters" && plan.trigger) pendingBenchTriggers.push({ actor, cardId: card.id, section: action.sourceSectionIndex, stadium: next.stadium.name });
        }
      });
      hp.update(next);
      stages.push({ kind, label: title, cards: structuredClone(cards), ...(actor ? { actor } : {}), ...(hiddenCount ? { hiddenCount } : {}) });
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
    const uncertainCopy = (card: ReplayCard) => {
      if (card.hpModifierUncertain || hp.hasAttachmentHpModifier(card)) card.hpModifierUncertain = true;
      card.instanceUncertain = true; card.damageKnown = false; card.energy = []; card.underlying = []; delete card.tool;
      card.conditions = []; delete card.abilityUsed;
    };
    const uncertainCopies = (cards: ReplayCard[]) => {
      const common = cards[0] && structuredClone(cards[0]);
      const same = (value: (card: ReplayCard) => unknown) => cards.every((card) => JSON.stringify(value(card)) === JSON.stringify(value(common)));
      const size = common && cards.map((card) => card.knownStackSize ?? (card.instanceUncertain ? null : physicalCardCount(card)));
      const sharedSize = size?.every((value) => value !== null && value === size[0]) ? size[0] ?? undefined : undefined;
      const sharedDamage = common && cards.every((card) => card.damageKnown !== false && card.damage === common.damage);
      const sharedEnergy = common && same((card) => [...card.energy].sort());
      const sharedLayers = common && same((card) => card.underlying.map((item) => [item.name, item.setId, item.localId, item.observedEffects]));
      const sharedTool = common && same((card) => card.tool);
      const sharedConditions = common && same((card) => [...(card.conditions ?? [])].sort());
      const originalLayers = cards.map((card) => structuredClone(card.underlying));
      const modifierUncertain = cards.some((card) => card.hpModifierUncertain || hp.hasAttachmentHpModifier({ ...card, energy: sharedEnergy ? [] : card.energy, tool: sharedTool ? undefined : card.tool }));
      const sharedEffects = (cards[0]?.observedEffects ?? []).filter((effect) => cards.every((card) => card.observedEffects?.includes(effect)));
      const sameSet = cards.every((card) => card.setId === cards[0]?.setId && card.localId === cards[0]?.localId);
      for (const history of [enteredPlay, lastEvolution]) {
        const values = cards.map((card) => history.get(card.id));
        if (!values.every((value) => value === values[0])) cards.forEach((card) => history.delete(card.id));
      }
      cards.forEach((card, index) => {
        uncertainCopy(card); if (modifierUncertain) card.hpModifierUncertain = true; else delete card.hpModifierUncertain; card.observedEffects = [...sharedEffects]; delete card.definitionKey;
        if (!sameSet) { delete card.setId; delete card.localId; }
        if (sharedSize !== undefined) card.knownStackSize = sharedSize; else delete card.knownStackSize;
        if (sharedDamage) { card.damage = common.damage; card.damageKnown = true; }
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
        return texts.some((text) => /(?:evolv(?:e|ed|ing)|evolution)[\s\S]*?(?:first turn|turn (?:you|it|they)|put (?:it|this Pok[eé]mon|that Pok[eé]mon) into play|just (?:put|played))/i.test(text));
      }));
    };
    const findEvolutionCard = (actor: ReplayActor, name: string, position: string) => {
      const side = next[actor]; const pool = (position === "Active Spot" ? [side.active] : side.bench).filter((card): card is ReplayCard => card?.name === name);
      const overridden = evolutionOverride();
      const eligible = (card: ReplayCard) => enteredPlay.get(card.id) !== action.sourceSectionIndex && lastEvolution.get(card.id) !== action.sourceSectionIndex;
      if (action.turn > 1 && action.actor === actor && !overridden && pool.length > 1 && pool.some(eligible)) return findBoardCard(side, name, position, hp, eligible, sameHistory);
      const target = findCard(side, name, position);
      if (!overridden && action.actor === actor && (action.turn <= 1 || !eligible(target))) {
        const message = "A recorded evolution overrides ordinary turn timing; no timing exception is established by the available card text.";
        if (!program.diagnostics.messages.includes(message)) program.diagnostics.messages.push(message);
      }
      return target;
    };
    const findKnockoutCard = (actor: ReplayActor, name: string) => {
      const side = next[actor]; const pool = allCards(side).filter((card) => card.name === name);
      const bound = pool.find((card) => card.id === recordedKnockoutBindings.get(actionIndex));
      if (bound) return bound;
      const knownDamage = (card: ReplayCard) => card.hpBasis === "known" && card.hp !== null && card.damageKnown !== false && !card.instanceUncertain;
      if (pool.length > 1 && pool.every(knownDamage)) {
        const lethal = pool.filter((card) => card.damage >= card.hp!);
        if (lethal.length === 1) return lethal[0];
      }
      return findCard(side, name);
    };
    const restoreCounterSurvivors = (actor: ReplayActor, name: string, candidates: ReplayCard[], removedId: string) => {
      const counters = counterEliminations.find((pool) => pool.actionIndex === actionIndex - 1 && pool.actor === actor && pool.name === name
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
        else { uncertainCopies(pool); target = pool[0]; next.partial = true; errors.push("The promoted Pokémon's physical copy is unidentified."); }
      }
      side.bench = side.bench.filter((card) => card.id !== target.id);
      side.unplaced = side.unplaced?.filter((card) => card.id !== target.id);
      if (side.active) { side.active.conditions = []; side.bench.unshift(side.active); }
      side.active = target; side.activeUncertain = false; lastPromotionActor = actor;
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
          takeDiscard(actor, names);
          if (names.length < amount) {
            markUncertain(actor, ["discard"], false); next.partial = true;
            errors.push("Some recovered discard card identities are not recorded.");
          }
        } else if (origin === "hand") removeHand(side, names, amount, destination as CountZone);
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
        const card = allCards(next[actor]).find((card) => card.name === used[2]) ?? { ...pokemon("effect-source", used[2]), definitionOwner: actor };
        const attack = recordedAttacks.at(-1)?.match;
        const attackEvidence = attack ? hp.attackPrintingEvidence(card, attack[3], next) : null;
        return { actor, card: attackEvidence?.status === "copied" ? attackEvidence.definitionCard : card, name: attack?.[3] ?? used[3], kind: attack ? "attack" as const : effectTag(action.sourceTitle) ?? "ability" as const };
      }
      const played = /^(.+?) played (.+)$/.exec(title);
      if (played && [input.selfPlayerName, input.opponentPlayerName].includes(played[1])) return { actor: actorFor(played[1]), card: { ...pokemon("effect-source", played[2]), definitionOwner: actorFor(played[1]) }, name: undefined, kind: effectTag(action.sourceTitle) ?? "supporter" as const };
      const activated = /^(.+?) was activated$/.exec(title);
      if (activated && next.stadium?.name === activated[1]) return { actor: next.stadium.actor, card: { ...pokemon("effect-source", activated[1]), definitionOwner: next.stadium.actor }, name: undefined, kind: "stadium" as const };
      return null;
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
        const cards = names.map((name) => pokemon(id(), name)); next[actor].bench.push(...cards);
        next[actor].deckCount = changeCount(next[actor].deckCount, -amount, ["deck"]);
        transferCounts(actor, "deck", "board", amount);
        stage("bench", "Bench", cards, actor, amount - cards.length); mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?) drew (.+?) and played (?:it|them) to (?:the )?Bench$/i))) {
        const actor = actorFor(match[1]); const cards = match[2].split(",").map((name) => pokemon(id(), name.trim()));
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
        const actor = actorFor(match[1]); const card = findCard(next[actor], match[2]); const amount = Number(match[3]);
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
      if ((match = line.match(/^(.+?) moved (.+?) to (?:their |the )?(hand|deck)$/i))) {
        const mover = [input.selfPlayerName, input.opponentPlayerName].includes(match[1]) ? actorFor(match[1]) : undefined;
        const target = ownerAndName(match[2], mover);
        const origin = effectOrigin(raw, detailIndex);
        if (!origin && match[3] === "hand") {
          const context = effectContext(); const plan = context ? hp.effectConstraints(context.card, context.name, context.kind, "return_energy") : null;
          if (context && plan?.status === "known" && plan.operation === "return_energy" && healed?.actor === target.actor && context.actor === target.actor) {
            const card = allCards(next[target.actor]).find((card) => card.id === healed!.id);
            const numeric = /^(a|\d+) cards?$/i.exec(target.name); const names = numeric ? cardList(detailIndex) : target.name.split(",").map((name) => name.trim()); const amount = numeric ? count(numeric[1]) : names.length;
            if (!card || !card.instanceUncertain && amount !== card.energy.length || names.some((name) => !/Energy$/i.test(name))) throw new Unresolved("The recorded Energy return conflicts with the healed Pokémon's attachments.");
            const available = [...card.energy];
            for (const name of card.instanceUncertain ? [] : names) {
              const energy = name.replace(/^Basic (.+) Energy$/i, "$1"); const index = available.indexOf(energy);
              if (index < 0) throw new Unresolved("The returned Energy names contradict the healed Pokémon's attachments.");
              available.splice(index, 1);
            }
            card.energy = []; transferCounts(target.actor, "board", "hand", amount);
            if (card.knownStackSize !== undefined) card.knownStackSize -= amount;
            next[target.actor].handCount = changeCount(next[target.actor].handCount, amount, ["board", "hand"]);
            const cards = names.map((name) => zoneCard(id(), name)); next[target.actor].knownHand.push(...cards);
            stage("return", "Return Energy", cards, target.actor, amount - names.length); mutationCount++; return true;
          }
        }
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
        if (!origin && boardShuffleActivation?.actor === actor) {
          const card = allCards(next[actor]).find((card) => card.id === boardShuffleActivation!.cardId);
          const amount = numeric ? count(numeric[1]) : names.length;
          if (!card || names.length > amount || !names.includes(card.name)) throw new Unresolved("The returned physical Pokémon stack is not established by the recorded card list.");
          const physical = [topCardEvidence(id(), card), ...card.underlying, ...card.energy.map((energy) => zoneCard(id(), /Energy$/i.test(energy) ? energy : `Basic ${energy} Energy`)), ...(card.tool ? [zoneCard(id(), card.tool)] : [])];
          if (!card.instanceUncertain) {
            if (amount !== physical.length) throw new CountConflict("The returned stack quantity contradicts the known physical stack.", ["board", "deck"]);
            const available = physical.map((item) => item.name);
            for (const name of names) { const index = available.indexOf(name); if (index < 0) throw new Unresolved("The returned card names contradict the known physical stack."); available.splice(index, 1); }
          }
          next[actor].deckCount = changeCount(next[actor].deckCount, amount, ["board", "deck"]); transferCounts(actor, "board", "deck", amount);
          if (next[actor].active?.id === card.id) next[actor].active = null;
          next[actor].bench = next[actor].bench.filter((candidate) => candidate.id !== card.id);
          next[actor].unplaced = next[actor].unplaced?.filter((candidate) => candidate.id !== card.id);
          const cards = card.instanceUncertain ? names.map((name) => zoneCard(id(), name)) : physical;
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
        const cards: ReplayZoneCard[] = [];
        for (const name of names) {
          const already = discardedThisAction.findIndex((item) => item.actor === actor && item.name === name);
          if (already >= 0) { discardedThisAction.splice(already, 1); continue; }
          if (next.stadium?.name === name) {
            addDiscard(next.stadium.actor, [zoneCard(id(), name)], "board"); next.stadium = null; continue;
          }
          if (match[3] === "deck") next[actor].deckCount = changeCount(next[actor].deckCount, -1, ["deck"]);
          else removeHand(next[actor], [name], 1, "discard");
          cards.push(zoneCard(id(), name));
        }
        addDiscard(actor, cards, match[3] === "deck" ? "deck" : "hand"); stage("discard", "Discard", cards, actor); mutationCount++; return true;
      }
      if (/^Effects of .+? did not affect .+$/i.test(line) || /^Damage to .+? was prevented$/i.test(line)) return true;
      if (/\bwas activated$/i.test(line)) {
        // Activation identifies an effect boundary, not a new attachment or a
        // hidden rule. Only subsequent recorded details mutate state.
        label = "Effect"; return true;
      }
      if ((match = line.match(/^(.+?) played (.+?) to (?:the )?(Active Spot|Bench)$/i))) {
        const actor = actorFor(match[1]); const side = next[actor]; const card = pokemon(id(), match[2]);
        if (match[3] === "Active Spot" && side.active) throw new Unresolved("The Active Spot is already occupied.");
        removeHand(side, [match[2]], 1, "board");
        transferCounts(actor, "hand", "board", 1);
        if (match[3] === "Active Spot") side.active = card; else side.bench.push(card);
        stage("bench", match[3], [card], actor); label = "Pokémon"; mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?) evolved (.+?) to (.+?) (?:in|on) the (Active Spot|Bench)$/i))) {
        const actor = actorFor(match[1]); const card = findEvolutionCard(actor, match[2], match[4]);
        stage("before", "From", [card], actor);
        card.underlying.push(topCardEvidence(id(), card));
        if (card.knownStackSize !== undefined) card.knownStackSize++;
        delete card.setId; delete card.localId; delete card.definitionKey;
        Object.assign(card, zoneCard(card.id, match[3]), { hp: null, conditions: [], abilityUsed: false, observedEffects: [] });
        removeHand(next[actor], [match[3]], 1, "board"); transferCounts(actor, "hand", "board", 1); lastEvolution.set(card.id, action.sourceSectionIndex); stage("evolve", "Evolve", [card], actor);
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
        if (!origin) throw new Unresolved("The effect's attachment origin is not recorded.");
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
        stage("move", "Out", [retreating], actor); retreating.conditions = [];
        side.bench.push(retreating); side.active = null; label = "Retreat"; mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?)['’]s (.+?) is now in the Active Spot$/i))) {
        promote(actorFor(match[1]), match[2], true); mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?)['’]s (.+?) used (.+?) on (.+?)['’]s (.+?) for (\d+)\+? damage(?:\. (.+))?$/i))) {
        const actor = actorFor(match[1]); const targetActor = actorFor(match[4]);
        const attacker = findCard(next[actor], match[2], "Active Spot");
        attackDamage = Number(match[6]);
        const printingEvidence = hp.attackPrintingEvidence(attacker, match[3], next);
        const definitionCard = printingEvidence.status === "copied" ? printingEvidence.definitionCard : attacker;
        const targetPosition = actor !== targetActor && ordinaryAttackTargetsActive(definitionCard, match[3], attackDamage) ? "Active Spot" : undefined;
        const target = findCard(next[targetActor], match[5], targetPosition);
        if (match[7] && !/^.+? took \d+ more damage because of .+? Weakness$/i.test(match[7])) return false;
        if (printingEvidence.status !== "unmodelled") observeEffect(attacker, printingEvidence.observedEffect);
        else if (hp.resolve(attacker)?.coverage === "complete") { next.partial = true; errors.push("The executed attack is recorded, but its native or copied printing provenance is not established."); }
        target.damage += attackDamage; damageApplied.set(target.id, attackDamage);
        stage("attack", match[3], [attacker], actor); stage("damage", `${attackDamage} damage`, [target], targetActor);
        label = "Attack"; mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?)['’]s (.+?) used (?:its )?Ability(?::|\s)\s*(.+)$/i))) {
        const actor = actorFor(match[1]); const card = findAbilityCard(next[actor], match[2], match[3]);
        card.abilityUsed = true; observeEffect(card, match[3]); stage("ability", match[3], [card], actor);
        label = "Ability"; mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?)['’]s (.+?) used (.+)$/i))) {
        const actor = actorFor(match[1]); const kind = effectTag(raw);
        if (kind !== "ability" && kind !== "attack") throw new Unresolved("The source does not identify a supported attack or a catalog-validated Ability.");
        const card = kind === "ability" ? findAbilityCard(next[actor], match[2], match[3]) : findCard(next[actor], match[2], "Active Spot");
        if (kind === "ability") card.abilityUsed = true;
        if (kind === "attack") {
          const evidence = hp.attackPrintingEvidence(card, match[3], next);
          if (evidence.status !== "unmodelled") observeEffect(card, evidence.observedEffect);
          else if (hp.resolve(card)?.coverage === "complete") { next.partial = true; errors.push("The attack's native or copied printing provenance is not established."); }
        } else observeEffect(card, match[3]);
        stage(kind, match[3], [card], actor); label = kind === "ability" ? "Ability" : "Attack"; mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?)['’]s (.+?) was Knocked Out$/i))) {
        const actor = actorFor(match[1]); const side = next[actor]; knockedOut = findKnockoutCard(actor, match[2]);
        const candidates = allCards(side).filter((card) => card.name === knockedOut!.name);
        if (knockedOut.instanceUncertain) throw new BoardCardUnresolved("The knocked-out physical stack is not identified.");
        stage("before", "Knocked Out", [knockedOut], actor);
        const discarded = [topCardEvidence(id(), knockedOut), ...knockedOut.underlying,
          ...knockedOut.energy.map((energy) => zoneCard(id(), /Energy$/i.test(energy) ? energy : `Basic ${energy} Energy`)),
          ...(knockedOut.tool ? [zoneCard(id(), knockedOut.tool)] : [])];
        addDiscard(actor, discarded, "board");
        aggregateKnockout = { actor, name: knockedOut.name, belowTop: discarded.length - 1, reportedBelowTop: 0 };
        if (side.active?.id === knockedOut.id) side.active = null;
        else side.bench = side.bench.filter((card) => card.id !== knockedOut!.id);
        side.unplaced = side.unplaced?.filter((card) => card.id !== knockedOut!.id);
        restoreCounterSurvivors(actor, knockedOut.name, candidates, knockedOut.id);
        stage("discard", "Discard", discarded, actor); label = "KO"; mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?) drew (a|\d+) cards?( for the opening hand)?$/i))) {
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
        if (names.length > amount) throw new Unresolved("The discarded list exceeds its recorded count.");
        if (names.length < amount) { markUncertain(actor, ["discard"], false); next.partial = true; errors.push("Some discarded card identities are not recorded."); }
        if (match[3] === "deck") next[actor].deckCount = changeCount(next[actor].deckCount, -amount, ["deck"]);
        else removeHand(next[actor], names, amount, "discard");
        const cards = names.map((name) => zoneCard(id(), name));
        addDiscard(actor, cards, match[3] === "deck" ? "deck" : "hand", amount); stage("discard", "Discard", cards, actor, amount - names.length); mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?) (?:was|were) discarded from (.+?)['’]s (.+)$/i))) {
        const actor = actorFor(match[2]); const side = next[actor];
        const numeric = /^(a|\d+) cards?$/i.exec(match[1]);
        const names = numeric ? cardList(detailIndex) : match[1].split(",").map((name) => name.trim());
        if (numeric && names.length > count(numeric[1])) throw new CountConflict("The discarded card list exceeds its recorded count.", ["board", "discard"]);
        if (numeric && knockedOut?.name === match[3] && !knockedOut.instanceUncertain
          && count(numeric[1]) !== physicalCardCount(knockedOut) - 1) {
          throw new CountConflict("The recorded KO card count contradicts the previously known physical stack.", ["board", "discard"]);
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
        if (aggregateKnockout?.actor === actor && aggregateKnockout.name === match[3]) {
          aggregateKnockout.reportedBelowTop += numeric ? count(numeric[1]) : names.length;
          if (aggregateKnockout.belowTop !== null && aggregateKnockout.reportedBelowTop > aggregateKnockout.belowTop) throw new CountConflict("The KO detail exceeds its recorded physical stack.", ["board", "discard"]);
          side.discard.push(...names.map((name) => zoneCard(id(), name))); return true;
        }
        const boundId = [...recordedKnockoutBindings].find(([index]) => index >= actionIndex && index <= actionIndex + 3)?.[1]; const targetName = match[3];
        const boundCard = allCards(side).find((card) => card.name === targetName && card.id === boundId);
        const card = retreating?.name === match[3] ? retreating : boundCard ?? findCard(side, match[3]);
        for (const name of names) {
          const energy = name.replace(/^Basic (.+) Energy$/i, "$1"); const index = card.energy.indexOf(energy);
          if (card.tool === name) delete card.tool;
          else if (index >= 0) card.energy.splice(index, 1);
          else throw new Unresolved("A discarded attachment was not previously evidenced.");
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
        const targets = triggerTarget ? [triggerTarget] : constrainedCandidates(match[4], boundOwner, context?.actor ?? controller, constraint);
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
            counterEliminations.push({ actionIndex, actor: targets[0].actor, name: match[4], ids: targets.map(({ card }) => card.id) });
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
        const origins = constrainedCandidates(match[4], actorFor(match[3]), context?.actor ?? controller, constraints?.from);
        const destinations = constrainedCandidates(match[6], actorFor(match[5]), context?.actor ?? controller, constraints?.to);
        const amount = count(match[2]) * 10;
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
        const evidence = context && hp.resolve(context.card);
        const healsAll = evidence?.coverage === "complete" && evidence.candidates.length > 0 && evidence.candidates.every((candidate) => candidate.rules?.some((text) => /^Heal all damage from 1 of your /i.test(text)));
        const card = findBoardCard(next[actor], match[4], undefined, hp, (candidate) => candidate.damageKnown === false || (healsAll ? candidate.damage === amount : candidate.damage >= amount), sameHistory);
        if (card.damageKnown !== false && amount > card.damage) throw new Unresolved("The recorded healing exceeds the evidenced damage.");
        card.damage = Math.max(0, card.damage - amount); if (amount > 0) healed = { actor, id: card.id }; stage("heal", `Heal ${amount}`, [card], actor); mutationCount++; return true;
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
        const copies = allCards(next[actor]).filter((card) => card.name === name);
        if (copies.length) {
          const plans = copies.flatMap((card) => (hp.resolve(card)?.candidates ?? []).flatMap((candidate) => candidate.abilities.flatMap((ability) => {
            const recipe = ability.text && /^Once during your turn, you may draw (\d+) cards\. If you drew any cards in this way, shuffle this Pok[eé]mon and all attached cards into your deck\.$/i.exec(ability.text);
            return recipe ? [{ effect: ability.name, drawAmount: Number(recipe[1]) }] : [];
          })));
          const drawDetails = action.details.map(clean).filter((detail) => detail === `${player} drew ${plans[0]?.drawAmount} cards`);
          if (plans.length && plans.every((plan) => plan.effect === plans[0].effect && plan.drawAmount === plans[0].drawAmount) && drawDetails.length === 1 && action.details.some((detail) => /^.+? shuffled (?:a|\d+) cards? into their deck$/.test(clean(detail)))) {
            const card = findAbilityCard(next[actor], match[2], plans[0].effect);
            const narrowed = hp.resolve({ ...card, observedEffects: [...(card.observedEffects ?? []), plans[0].effect] });
            if (narrowed?.coverage !== "complete" || !narrowed.candidates.length || !narrowed.candidates.every((candidate) => candidate.abilities.some((ability) => ability.name === plans[0].effect))) throw new Unresolved("The draw-and-return activation is not established by complete card evidence.");
            observeEffect(card, plans[0].effect); card.abilityUsed = true;
            boardShuffleActivation = { actor, cardId: card.id, name: card.name, effect: plans[0].effect, drawAmount: plans[0].drawAmount };
            stage("ability", plans[0].effect, [card], actor); label = "Ability"; mutationCount++; return true;
          }
        }
        if (kind === "stadium") {
          if (next.stadium?.name === name) {
            const evidence = hp.resolve({ name, definitionOwner: actor });
            const recipes = evidence?.candidates.map((candidate) => (candidate.rules ?? []).map((text) => /^Once during each player's turn, that player may discard (\d+) cards from their hand in order to draw (a|\d+) cards?\.$/i.exec(text)).find(Boolean));
            if (evidence?.coverage === "complete" && recipes?.length && recipes.every((recipe) => recipe && recipe[1] === recipes[0]![1] && recipe[2] === recipes[0]![2])) {
              const discarded = Number(recipes[0]![1]); const drawn = /^a$/i.test(recipes[0]![2]) ? 1 : Number(recipes[0]![2]);
              const details = action.details.map(clean);
              if (details.includes(`${player} discarded ${discarded} cards`) && details.some((detail) => detail === `${player} drew ${drawn} cards` || drawn === 1 && detail === `${player} drew a card`)) {
                stage("stadium", "Stadium effect", [zoneCard(id(), name)], actor); label = "Stadium"; mutationCount++; return true;
              }
            }
          }
          removeHand(next[actor], [match[2]], 1, "board");
          if (next.stadium) addDiscard(next.stadium.actor, [zoneCard(id(), next.stadium.name)], "board");
          transferCounts(actor, "hand", "board", 1);
          next.stadium = { actor, name: match[2], imageUrl: zoneCard(id(), match[2]).imageUrl };
          stage("stadium", "Stadium", [zoneCard(id(), match[2])], actor); label = "Stadium"; mutationCount++; return true;
        }
        removeHand(next[actor], [match[2]], 1, kind === "tool" ? "board" : "discard");
        next.playedCard = { actor, card: zoneCard(id(), match[2]) };
        stage("play", "Play", [next.playedCard.card], actor);
        if (["item", "supporter"].includes(effectTag(raw) ?? "")) addDiscard(actor, [structuredClone(next.playedCard.card)]);
        else if (kind === "tool") transferCounts(actor, "hand", "board", 1);
        else { markUncertain(actor, ["board", "discard"]); next.partial = true; errors.push("The played card's final zone is not established by card-type metadata."); }
        label = "Play"; mutationCount++; return true;
      }
      if (/^.+? (?:chose (?:heads|tails) for the opening coin flip|won the coin toss|flipped a coin and it landed on (?:heads|tails))$/i.test(line)) {
        label = detailIndex < 0 ? "Coin flip" : label; return true;
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
    const event: ReplayEvent = { actor: titleOwner ? actorFor(titleOwner) : action.actor, turn: action.turn,
      sourceSectionIndex: action.sourceSectionIndex, sourceTitle: action.sourceTitle,
      sourceDetails: [...action.details], label, summary: anonymise(action.sourceTitle, input) };
    if (action.turn > 0 && action.sourceSectionIndex !== previousSectionIndex) {
      allCards(next[action.actor]).forEach((card) => { card.abilityUsed = false; });
    }
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
          const amount = recordedAttachments ? recordedAmount(recordedAttachments[1]) : null;
          const candidates = allCards(next[actor]).filter((card) => card.name === knockout[2]);
          const candidateSizes = candidates.map((card) => card.knownStackSize ?? (card.instanceUncertain ? null : physicalCardCount(card)));
          if (candidates.length) {
            const side = next[actor]; const activeAffected = candidates.some((card) => card.id === side.active?.id);
            uncertainCopies(candidates);
            const removed = candidates[0];
            side.bench = side.bench.filter((card) => card.id !== removed.id);
            side.unplaced = (side.unplaced ?? []).filter((card) => card.id !== removed.id);
            if (activeAffected) {
              side.active = null; side.activeUncertain = candidates.length > 1;
              const survivors = candidates.slice(1);
              side.bench = side.bench.filter((card) => !survivors.some((survivor) => survivor.id === card.id));
              side.unplaced = [...(side.unplaced ?? []).filter((card) => !survivors.some((survivor) => survivor.id === card.id)), ...survivors];
            }
            side.discard.unshift(topCardEvidence(id(), removed));
            restoreCounterSurvivors(actor, knockout[2], candidates, removed.id);
          }
          // PTCGL's discarded-from total includes every card below the top
          // Pokémon, including its evolution layers, Energy and Tool.
          const malformed = Boolean(recordedAttachments && (amount === null || cardList(discardDetailIndex).length > amount));
          const sizes = malformed ? new Set<number>() : amount === null ? (candidateSizes.includes(null) ? new Set<number>() : new Set(candidateSizes as number[])) : new Set([1 + amount]);
          if (sizes.size === 1) {
            move([...sizes][0]);
            aggregateKnockout = { actor, name: knockout[2], belowTop: [...sizes][0] - 1, reportedBelowTop: 0 };
          } else {
            markUncertain(actor, ["board", "discard"]);
            aggregateKnockout = { actor, name: knockout[2], belowTop: null, reportedBelowTop: 0 };
          }
        } else {
          uncertainCopies(allCards(next[actor]).filter((card) => card.name === attachmentDiscard![2]));
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
          const damageEvidence = candidates.map((card) => ({ damage: card.damage, damageKnown: card.damageKnown }));
          uncertainCopies(candidates);
          if (attachment) candidates.forEach((card, index) => { card.damage = damageEvidence[index].damage; card.damageKnown = damageEvidence[index].damageKnown; delete card.knownStackSize; });
          if (evolution && candidates.length) {
            const target = candidates[0]; target.underlying.push(topCardEvidence(id(), target)); if (target.knownStackSize !== undefined) target.knownStackSize++; lastEvolution.set(target.id, action.sourceSectionIndex); delete target.setId; delete target.localId; delete target.definitionKey;
            target.name = evolution[3]; target.observedEffects = []; target.hp = null;
          }
          markUncertain(actor, ["board"], false); side.hpModifiersKnown = modifierKnowledge;
          // The log establishes one physical card leaving this source even
          // when it cannot identify which board copy receives it.
          if (origin === "hand" && !alreadyPlayed) {
            try { removeHand(next[actor], [name], 1, "board"); }
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
          markUncertain(actor, ["hand", "deck", "discard", "board"]);
        } else if (/^discarded\b/i.test(verb)) {
          markUncertain(actor, [/ from (?:their |the )?deck$/i.test(verb) ? "deck" : "hand", "discard"]);
        } else if (/^(?:draw|drew)\b/i.test(verb)) {
          markUncertain(actor, ["hand", "deck"]);
        } else if (/^(?:attached|evolved|retreated|switched|played)\b/i.test(verb)
          || /(?:is now in the Active Spot|was Knocked Out|to become the Active Pok[eé]mon)$/i.test(line)) {
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
    const applyLine = (raw: string, detailIndex: number, retry = false): void => {
      const before = structuredClone(next);
      const beforeStages = structuredClone(stages);
      const beforeContext = { counterEliminations: structuredClone(counterEliminations), recordedKnockoutBindings: new Map(recordedKnockoutBindings), boardShuffleActivation: boardShuffleActivation ? { ...boardShuffleActivation } : null, pendingPrizeAnnotations: structuredClone(pendingPrizeAnnotations), earlyPrizeAnnotations: new Map(earlyPrizeAnnotations), pendingBenchTriggers: [...pendingBenchTriggers], bonusDraw: bonusDraw ? { ...bonusDraw } : null, enteredPlay: new Map(enteredPlay), lastEvolution: new Map(lastEvolution), prizeAction, prizeCardsAdded, prizeAmount, attackDamage, expectedBreakdownDamage, healed: healed ? { ...healed } : null, retreatingId: retreating?.id, knockedOut: knockedOut ? structuredClone(knockedOut) : null, aggregateKnockout: aggregateKnockout ? { ...aggregateKnockout } : null, label, damageBreakdown, lastPromotionActor, cardCounter, damageApplied: new Map(damageApplied), changedCountZones: { self: new Set(changedCountZones.self), opponent: new Set(changedCountZones.opponent) } };
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
        next = before;
        stages.splice(0, stages.length, ...beforeStages);
        discardedThisAction.splice(0, discardedThisAction.length, ...beforeDiscarded);
        mutationCount = beforeCount; counterEliminations = beforeContext.counterEliminations; recordedKnockoutBindings.clear(); beforeContext.recordedKnockoutBindings.forEach((value, key) => recordedKnockoutBindings.set(key, value)); boardShuffleActivation = beforeContext.boardShuffleActivation; pendingPrizeAnnotations = beforeContext.pendingPrizeAnnotations; earlyPrizeAnnotations.clear(); beforeContext.earlyPrizeAnnotations.forEach((value, key) => earlyPrizeAnnotations.set(key, value)); pendingBenchTriggers = beforeContext.pendingBenchTriggers;
        for (const [history, saved] of [[enteredPlay, beforeContext.enteredPlay], [lastEvolution, beforeContext.lastEvolution]]) { history.clear(); saved.forEach((value, key) => history.set(key, value)); }
        prizeAction = beforeContext.prizeAction; prizeCardsAdded = beforeContext.prizeCardsAdded; prizeAmount = beforeContext.prizeAmount; bonusDraw = beforeContext.bonusDraw;
        attackDamage = beforeContext.attackDamage; expectedBreakdownDamage = beforeContext.expectedBreakdownDamage; healed = beforeContext.healed; knockedOut = beforeContext.knockedOut; aggregateKnockout = beforeContext.aggregateKnockout;
        for (const actor of ["self", "opponent"] as const) {
          changedCountZones[actor].clear(); beforeContext.changedCountZones[actor].forEach((zone) => changedCountZones[actor].add(zone));
        }
        retreating = [...allCards(next.self), ...allCards(next.opponent)].find((card) => card.id === beforeContext.retreatingId) ?? null;
        label = beforeContext.label; damageBreakdown = beforeContext.damageBreakdown; lastPromotionActor = beforeContext.lastPromotionActor; cardCounter = beforeContext.cardCounter;
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
          next.partial = true; applyLine(raw, detailIndex, true);
        } else invalidate(raw, detailIndex, error);
      }
    };
    applyLine(action.sourceTitle, -1);
    for (let index = 0; index < action.details.length; index++) {
      if (!consumed.has(index)) applyLine(action.details[index], index);
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
    understoodMutations += mutationCount;
    event.label = label;
    if (stages.length) event.transaction = { actor: event.actor, title: event.summary, stages };
    if (errors.length) {
      event.unresolved = errors;
      program.diagnostics.unresolvedActions.push(actionIndex);
      program.diagnostics.unresolvedMutations++;
    }
    hp.update(next);
    hp.decorateState(next);
    for (const entry of stages) {
      entry.cards.forEach((card) => { if (entry.actor && !card.definitionOwner) card.definitionOwner = entry.actor; hp.decorateCard(card); });
      for (const [owner, cards] of Object.entries(entry.actorCards ?? {})) cards?.forEach((card) => { if (!card.definitionOwner) card.definitionOwner = owner as ReplayActor; hp.decorateCard(card); });
    }
    program.frames.push(next);
    previousSectionIndex = action.sourceSectionIndex;
    program.events.push(event);
  });
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
  return program;
}
