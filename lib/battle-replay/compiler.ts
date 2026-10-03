import { decodeLogSections } from "@/lib/battle-log/runtime-validation";
import { buildDeckListCardImageUrl } from "@/lib/deck-lists/render";
import { representativePrintings } from "./artwork";
import { flattenReplaySourceActions } from "./source";
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
const allCards = (side: ReplaySide) => [side.active, ...side.bench].filter((card): card is ReplayCard => card !== null);

class Unresolved extends Error {}
class CountConflict extends Unresolved {}

function zoneCard(id: string, name: string): ReplayZoneCard {
  const printing = representativePrintings[name];
  return {
    id, name,
    imageUrl: printing ? buildDeckListCardImageUrl(printing.set, printing.number, "LG") : "",
    ...(printing ? { artwork: "representative" as const } : {}),
  };
}

function pokemon(id: string, name: string): ReplayCard {
  return { ...zoneCard(id, name), hp: null, damage: 0, energy: [], underlying: [] };
}

function emptySide(name: string): ReplaySide {
  return { name, active: null, bench: [], deckCount: null, handCount: null, knownHand: [], discard: [], prizesRemaining: null };
}

function changeCount(value: number | null, change: number): number | null {
  if (value === null) return null;
  const next = value + change;
  if (next < 0 || next > 60) throw new CountConflict("The recorded card count conflicts with the reconstructed zone.");
  return next;
}

function removeHand(side: ReplaySide, names: string[], amount = names.length) {
  if (side.handCount !== null && side.knownHand.length === side.handCount) {
    const available = side.knownHand.map((card) => card.name);
    for (const name of names) {
      const index = available.indexOf(name);
      if (index < 0) throw new CountConflict("The recorded hand removal contradicts the previously known hand.");
      available.splice(index, 1);
    }
  }
  side.handCount = changeCount(side.handCount, -amount);
  for (const name of names) {
    const index = side.knownHand.findIndex((card) => card.name === name);
    if (index >= 0) side.knownHand.splice(index, 1);
  }
  // With an unidentified removal we cannot know which previously seen cards remain.
  if (amount > names.length) side.knownHand = [];
}

function findCard(side: ReplaySide, name: string, position?: string) {
  const pool = position === "Active Spot" ? [side.active] : position === "Bench" ? side.bench : allCards(side);
  const matches = pool.filter((card): card is ReplayCard => Boolean(card && card.name === name));
  // IDs distinguish physical copies, but only observable, future-relevant state
  // can distinguish the outcome of an action whose source omits copy identity.
  const signature = (card: ReplayCard) => JSON.stringify({
    ...card, id: undefined, conditions: [...(card.conditions ?? [])].sort(),
    abilityUsed: Boolean(card.abilityUsed),
    underlying: card.underlying.map((item) => ({ ...item, id: undefined })),
  });
  const interchangeable = matches.length > 1 && !matches.some((card) => card.id === side.active?.id)
    && matches.every((card) => signature(card) === signature(matches[0]));
  if (matches.length !== 1 && !interchangeable) throw new Unresolved(matches.length
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
    .replaceAll(player.name, player.label), text);
}

/** Compile recorded English evidence one transition at a time. Unresolved lines
 * invalidate only affected knowledge; validated catalog metadata classifies effects.
 */
export function compileBattleReplay(input: ReplayLogSource): ReplayProgram {
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
  const sectionEnds = new Map<number, (typeof sections)[number]>();
  let offset = 0;
  for (const section of sections) { offset += section.actions.length; sectionEnds.set(offset - 1, section); }
  let understoodMutations = 0;
  let previousSectionIndex = -1;
  actions.forEach((action, actionIndex) => {
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
    let attackDamage: number | null = null;
    let retreating: ReplayCard | null = null;
    let knockedOut: ReplayCard | null = null;
    const consumed = new Set<number>();
    const errors: string[] = [];
    const discardedThisAction: Array<{ actor: ReplayActor; name: string }> = [];
    const damageApplied = new Map<string, number>();
    let damageBreakdown = false;
    let lastPromotionActor: ReplayActor | null = null;
    const effectTag = (raw: string) => input.effectTags?.[raw] ?? input.effectTags?.[clean(raw)] ?? input.effectTags?.[`${clean(raw)}.`];
    const effectOrigin = input.effectOrigins?.[action.sourceTitle];
    const markUncertain = (actor: ReplayActor, zones: NonNullable<ReplaySide["uncertainZones"]>) => {
      const side = next[actor];
      side.uncertainZones = [...new Set([...(side.uncertainZones ?? []), ...zones])];
      if (zones.includes("hand")) { side.handCount = null; side.knownHand = []; }
      if (zones.includes("deck")) side.deckCount = null;
      if (zones.includes("prizes")) side.prizesRemaining = null;
      if (zones.includes("board")) allCards(side).forEach((card) => { card.damageKnown = false; });
    };
    const clearUncertain = (actor: ReplayActor, zone: NonNullable<ReplaySide["uncertainZones"]>[number]) => {
      if (next[actor].uncertainZones) next[actor].uncertainZones = next[actor].uncertainZones!.filter((item) => item !== zone);
    };
    const addDiscard = (actor: ReplayActor, cards: ReplayZoneCard[]) => {
      next[actor].discard.unshift(...cards);
      discardedThisAction.push(...cards.map((card) => ({ actor, name: card.name })));
    };
    const takeDiscard = (actor: ReplayActor, names: string[]) => {
      for (const name of names) {
        const index = next[actor].discard.findIndex((card) => card.name === name);
        // A recorded origin establishes a real card even when earlier discard
        // history is absent; do not manufacture a duplicate retained in the pile.
        if (index >= 0) next[actor].discard.splice(index, 1);
        else { markUncertain(actor, ["discard"]); next.partial = true; }
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
      if (!value || playerLed || !/^[-•]\s*/.test(raw.trim()) && /[.!?]$/.test(rawContent)
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
      const cards = names.map((name) => zoneCard(id(), name));
      side.knownHand.push(...cards);
      stage("draw", opening ? "Opening hand" : "Draw", cards, actor, amount - cards.length);
    };
    const promote = (actor: ReplayActor, name: string) => {
      const side = next[actor];
      if (side.active?.name === name && !side.bench.some((card) => card.name === name)) return;
      let target: ReplayCard;
      if (!side.bench.some((card) => card.name === name) && side.uncertainZones?.includes("board")) {
        target = { ...pokemon(id(), name), damageKnown: false };
      } else target = findCard(side, name, "Bench");
      side.bench = side.bench.filter((card) => card.id !== target.id);
      if (side.active) { side.active.conditions = []; side.bench.unshift(side.active); }
      side.active = target; lastPromotionActor = actor;
      stage("move", "Promote", [target], actor);
    };
    const transfer = (actor: ReplayActor, names: string[], amount: number, origin: string, destination: string) => {
      if (names.length > amount || amount < 1 || amount > 60) throw new Unresolved("The moved card list conflicts with its count.");
      const side = next[actor];
      if (origin === "discard") {
        if (names.length !== amount) throw new Unresolved("The recovered discard cards are not identified.");
        takeDiscard(actor, names);
      } else if (origin === "hand") removeHand(side, names, amount);
      else if (origin === "deck") side.deckCount = changeCount(side.deckCount, -amount);
      else throw new Unresolved("The moved cards' origin is not supported.");
      const cards = names.map((name) => zoneCard(id(), name));
      if (destination === "hand") { side.handCount = changeCount(side.handCount, amount); side.knownHand.push(...cards); }
      else side.deckCount = changeCount(side.deckCount, amount);
      stage(destination === "hand" ? "return" : "shuffle", destination === "hand" ? "To hand" : "Shuffle", cards, actor, amount - names.length); mutationCount++;
    };
    const parseLine = (raw: string, detailIndex: number): boolean => {
      const line = clean(raw).replace(/^(.*?) attached (.+?) from (?:their |the )?(hand|deck|discard pile) to (.+)$/i, "$1 attached $2 to $4 from $3");
      let match: RegExpMatchArray | null;
      if ((match = line.match(/^(.+?) drew (a|\d+) cards? and played them to (?:the )?Bench$/i))) {
        const actor = actorFor(match[1]); const names = cardList(detailIndex); const amount = count(match[2]);
        if (names.length > amount) throw new Unresolved("The Pokémon list exceeds the recorded Bench search count.");
        if (names.length < amount) { markUncertain(actor, ["board"]); next.partial = true; errors.push("Some Pokémon placed on the Bench are not identified."); }
        const cards = names.map((name) => pokemon(id(), name)); next[actor].bench.push(...cards);
        next[actor].deckCount = changeCount(next[actor].deckCount, -amount);
        stage("bench", "Bench", cards, actor, amount - cards.length); mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?) drew (.+?) and played (?:it|them) to (?:the )?Bench$/i))) {
        const actor = actorFor(match[1]); const cards = match[2].split(",").map((name) => pokemon(id(), name.trim()));
        next[actor].bench.push(...cards); next[actor].deckCount = changeCount(next[actor].deckCount, -cards.length);
        stage("bench", "Bench", cards, actor); mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?) took (?:a |an |\d+ )?mulligans?$/i))) {
        const actor = actorFor(match[1]); const side = next[actor];
        side.deckCount = side.handCount === null ? null : changeCount(side.deckCount, side.handCount);
        stage("shuffle", "Mulligan", side.knownHand, actor, side.handCount === null ? undefined : side.handCount - side.knownHand.length);
        side.handCount = 0; side.knownHand = []; clearUncertain(actor, "hand"); mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?) was switched with (.+?) to become the Active Pok[eé]mon$/i))) {
        const outgoing = ownerAndName(match[2]); const incoming = ownerAndName(match[1], outgoing.actor);
        if (incoming.actor !== outgoing.actor) throw new Unresolved("A switch cannot exchange opposing Pokémon.");
        findCard(next[outgoing.actor], outgoing.name, "Active Spot");
        promote(incoming.actor, incoming.name); label = "Switch"; mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?) is now in the Active Spot$/i))) {
        const target = ownerAndName(match[1], lastPromotionActor ?? undefined);
        promote(target.actor, target.name); mutationCount++; return true;
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
        if (prizeAction) {
          if (prizeCardsAdded + amount > prizeAmount) throw new Unresolved("The recorded Prize card list exceeds the Prize count.");
          prizeCardsAdded += amount;
        } else next[actor].handCount = changeCount(next[actor].handCount, amount);
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
        if (!effectOrigin) throw new Unresolved("The recovered cards' origin is not recorded or established by effect metadata.");
        const numeric = /^(a|\d+) cards?$/i.exec(target.name);
        const names = numeric ? cardList(detailIndex) : target.name.split(",").map((name) => name.trim());
        transfer(target.actor, names, numeric ? count(numeric[1]) : names.length, effectOrigin, match[3]); return true;
      }
      if ((match = line.match(/^(.+?) shuffled (.+?)(?: from (?:their |the )?(hand|discard pile))? into their deck$/i))) {
        const actor = actorFor(match[1]);
        if (match[2] === "their hand") {
          const side = next[actor]; const names = cardList(detailIndex);
          if (names.length && side.handCount !== null && names.length !== side.handCount) throw new Unresolved("The full-hand shuffle list contradicts the hand count.");
          const amount = side.handCount ?? (names.length || null);
          stage("shuffle", "Shuffle hand", names.length ? names.map((name) => zoneCard(id(), name)) : side.knownHand, actor,
            amount === null ? undefined : amount - (names.length || side.knownHand.length));
          side.deckCount = amount === null ? null : changeCount(side.deckCount, amount);
          side.handCount = 0; side.knownHand = []; clearUncertain(actor, "hand"); mutationCount++; return true;
        }
        const numeric = /^(a|\d+) cards?$/i.exec(match[2]);
        const names = numeric ? cardList(detailIndex) : match[2].split(",").map((name) => name.trim());
        const origin = match[3] === "discard pile" ? "discard" : match[3] ?? effectOrigin;
        if (!origin) throw new Unresolved("The shuffled cards' origin is not recorded.");
        transfer(actor, names, numeric ? count(numeric[1]) : names.length, origin, "deck"); return true;
      }
      if ((match = line.match(/^(.+?) shuffled their deck$/i))) { actorFor(match[1]); return true; }
      if ((match = line.match(/^(.+?) discarded (.+?)(?: from (?:their |the )?(hand|deck))?$/i)) && [input.selfPlayerName, input.opponentPlayerName].includes(match[1]) && !/^(?:a|\d+) cards?$/i.test(match[2])) {
        const actor = actorFor(match[1]); const names = match[2].split(",").map((name) => name.trim());
        const cards: ReplayZoneCard[] = [];
        for (const name of names) {
          const already = discardedThisAction.findIndex((item) => item.actor === actor && item.name === name);
          if (already >= 0) { discardedThisAction.splice(already, 1); continue; }
          if (next.stadium?.name === name) {
            addDiscard(next.stadium.actor, [zoneCard(id(), name)]); next.stadium = null; continue;
          }
          if (match[3] === "deck") next[actor].deckCount = changeCount(next[actor].deckCount, -1);
          else removeHand(next[actor], [name]);
          cards.push(zoneCard(id(), name));
        }
        addDiscard(actor, cards); stage("discard", "Discard", cards, actor); mutationCount++; return true;
      }
      if (/\bwas activated$/i.test(line)) {
        // Activation identifies an effect boundary, not a new attachment or a
        // hidden rule. Only subsequent recorded details mutate state.
        label = "Effect"; return true;
      }
      if ((match = line.match(/^(.+?) played (.+?) to (?:the )?(Active Spot|Bench)$/i))) {
        const actor = actorFor(match[1]); const side = next[actor]; const card = pokemon(id(), match[2]);
        if (match[3] === "Active Spot" && side.active) throw new Unresolved("The Active Spot is already occupied.");
        removeHand(side, [match[2]]);
        if (match[3] === "Active Spot") side.active = card; else side.bench.push(card);
        stage("bench", match[3], [card], actor); label = "Pokémon"; mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?) evolved (.+?) to (.+?) (?:in|on) the (Active Spot|Bench)$/i))) {
        const actor = actorFor(match[1]); const card = findCard(next[actor], match[2], match[4]);
        stage("before", "From", [card], actor);
        card.underlying.push(zoneCard(id(), card.name));
        Object.assign(card, zoneCard(card.id, match[3]), { hp: null, conditions: [], abilityUsed: false });
        removeHand(next[actor], [match[3]]); stage("evolve", "Evolve", [card], actor);
        label = "Evolve"; mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?) attached (.+?) to (.+?) (?:in|on) the (Active Spot|Bench)(?: from (?:their |the )?(hand|deck|discard pile))?$/i))) {
        const actor = actorFor(match[1]); const side = next[actor]; const card = findCard(side, match[3], match[4]);
        const isEnergy = /Energy$/i.test(match[2]);
        const isTool = effectTag(raw) === "tool" || (effectTag(action.sourceTitle) === "tool" && clean(action.sourceTitle).includes(match[2]));
        if (!isEnergy && !isTool) throw new Unresolved("The attachment type is not recorded.");
        if (isTool && card.tool) throw new Unresolved("An existing Tool must be explicitly removed before replacement.");
        // A standalone manual attachment is from hand; an effect detail needs its origin stated.
        const origin = match[5] ?? effectOrigin ?? (detailIndex < 0 || next.playedCard?.actor === actor && next.playedCard.card.name === match[2] ? "hand" : undefined);
        if (!origin) throw new Unresolved("The effect's attachment origin is not recorded.");
        if (origin === "hand") {
          if (!(detailIndex >= 0 && next.playedCard?.actor === actor && next.playedCard.card.name === match[2])) removeHand(side, [match[2]]);
        } else if (origin === "deck") side.deckCount = changeCount(side.deckCount, -1);
        else {
          takeDiscard(actor, [match[2]]);
        }
        if (isTool) card.tool = match[2]; else card.energy.push(match[2].replace(/^Basic (.+) Energy$/i, "$1"));
        stage("attach", "Attach", [zoneCard(id(), match[2])], actor); stage("move", `To ${card.name}`, [card], actor);
        label = "Attach"; mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?) retreated (.+?) to (?:the )?Bench$/i))) {
        const actor = actorFor(match[1]); const side = next[actor]; retreating = findCard(side, match[2], "Active Spot");
        stage("move", "Out", [retreating], actor); retreating.conditions = [];
        side.bench.push(retreating); side.active = null; label = "Retreat"; mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?)['’]s (.+?) is now in the Active Spot$/i))) {
        promote(actorFor(match[1]), match[2]); mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?)['’]s (.+?) used (.+?) on (.+?)['’]s (.+?) for (\d+)\+? damage(?:\. (.+))?$/i))) {
        const actor = actorFor(match[1]); const targetActor = actorFor(match[4]);
        const attacker = findCard(next[actor], match[2], "Active Spot");
        const target = findCard(next[targetActor], match[5]); attackDamage = Number(match[6]);
        if (match[7] && !/^.+? took \d+ more damage because of .+? Weakness$/i.test(match[7])) return false;
        target.damage += attackDamage; damageApplied.set(target.id, attackDamage);
        stage("attack", match[3], [attacker], actor); stage("damage", `${attackDamage} damage`, [target], targetActor);
        label = "Attack"; mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?)['’]s (.+?) used (?:its )?Ability(?::|\s)\s*(.+)$/i))) {
        const actor = actorFor(match[1]); const card = findCard(next[actor], match[2]);
        card.abilityUsed = true; stage("ability", match[3], [card], actor);
        label = "Ability"; mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?)['’]s (.+?) used (.+)$/i))) {
        const actor = actorFor(match[1]); const kind = effectTag(raw);
        if (kind !== "ability" && kind !== "attack") throw new Unresolved("The source does not identify a supported attack or a catalog-validated Ability.");
        const card = findCard(next[actor], match[2], kind === "attack" ? "Active Spot" : undefined);
        if (kind === "ability") card.abilityUsed = true;
        stage(kind, match[3], [card], actor); label = kind === "ability" ? "Ability" : "Attack"; mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?)['’]s (.+?) was Knocked Out$/i))) {
        const actor = actorFor(match[1]); const side = next[actor]; knockedOut = findCard(side, match[2]);
        stage("before", "Knocked Out", [knockedOut], actor);
        const discarded = [zoneCard(id(), knockedOut.name), ...knockedOut.underlying,
          ...knockedOut.energy.map((energy) => zoneCard(id(), /Energy$/i.test(energy) ? energy : `Basic ${energy} Energy`)),
          ...(knockedOut.tool ? [zoneCard(id(), knockedOut.tool)] : [])];
        addDiscard(actor, discarded);
        if (side.active?.id === knockedOut.id) side.active = null;
        else side.bench = side.bench.filter((card) => card.id !== knockedOut!.id);
        stage("discard", "Discard", discarded, actor); label = "KO"; mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?) drew (a|\d+) cards?( for the opening hand)?$/i))) {
        draw(actorFor(match[1]), count(match[2]), cardList(detailIndex), Boolean(match[3]));
        label = detailIndex < 0 ? "Draw" : label; mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?) drew (.+)$/i))) {
        draw(actorFor(match[1]), 1, [match[2]]); label = detailIndex < 0 ? "Draw" : label; mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?) took (a|\d+) Prize cards?$/i))) {
        const actor = actorFor(match[1]); prizeAmount = count(match[2]); prizeAction = true;
        if (prizeAmount > 6) throw new Unresolved("The recorded Prize count exceeds six cards.");
        next[actor].prizesRemaining = changeCount(next[actor].prizesRemaining, -prizeAmount);
        next[actor].handCount = changeCount(next[actor].handCount, prizeAmount);
        stage("draw", "Take Prize", [], actor, prizeAmount); label = "Prize"; mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?) discarded (a|\d+) cards?$/i))) {
        const actor = actorFor(match[1]); const names = cardList(detailIndex); const amount = count(match[2]);
        if (names.length > amount) throw new Unresolved("The discarded list exceeds its recorded count.");
        if (names.length < amount) { markUncertain(actor, ["discard"]); next.partial = true; errors.push("Some discarded card identities are not recorded."); }
        removeHand(next[actor], names, amount); const cards = names.map((name) => zoneCard(id(), name));
        addDiscard(actor, cards); stage("discard", "Discard", cards, actor, amount - names.length); mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?) (?:was|were) discarded from (.+?)['’]s (.+)$/i))) {
        const actor = actorFor(match[2]); const side = next[actor];
        const names = /^(?:a|\d+) cards?$/i.test(match[1]) ? cardList(detailIndex) : match[1].split(",").map((name) => name.trim());
        if (!names.length) throw new Unresolved("The discarded attachments are not identified.");
        if (knockedOut?.name === match[3]) {
          for (const name of names) {
            const index = discardedThisAction.findIndex((item) => item.actor === actor && item.name === name);
            if (index >= 0) discardedThisAction.splice(index, 1);
            else {
              const card = zoneCard(id(), name); side.discard.push(card);
              stage("discard", "Recorded attachment", [card], actor);
            }
          }
          return true; // Known attachments already moved; newly revealed ones are evidence too.
        }
        const card = retreating?.name === match[3] ? retreating : findCard(side, match[3]);
        for (const name of names) {
          const energy = name.replace(/^Basic (.+) Energy$/i, "$1"); const index = card.energy.indexOf(energy);
          if (card.tool === name) delete card.tool;
          else if (index >= 0) card.energy.splice(index, 1);
          else throw new Unresolved("A discarded attachment was not previously evidenced.");
          addDiscard(actor, [zoneCard(id(), name)]);
        }
        stage("discard", "Discard", names.map((name) => zoneCard(id(), name)), actor); mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?) put (a|\d+) damage counters? on (.+?)['’]s (.+)$/i))) {
        actorFor(match[1]); const actor = actorFor(match[3]); const card = findCard(next[actor], match[4]);
        card.damage += count(match[2]) * 10; stage("damage", `${count(match[2]) * 10} damage`, [card], actor); mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?) moved (a|\d+) damage counters? from (.+?)['’]s (.+?) to (.+?)['’]s (.+)$/i))) {
        actorFor(match[1]); const fromActor = actorFor(match[3]); const toActor = actorFor(match[5]);
        const from = findCard(next[fromActor], match[4]); const to = findCard(next[toActor], match[6]); const amount = count(match[2]) * 10;
        if (from.damageKnown !== false && from.damage < amount) throw new Unresolved("The recorded damage movement exceeds the evidenced damage.");
        from.damage = Math.max(0, from.damage - amount); to.damage += amount;
        stage("move", "Move damage from", [from], fromActor); stage("damage", `${amount} damage`, [to], toActor); mutationCount++; return true;
      }
      if ((match = line.match(/^(a|\d+) damage counters? (?:was|were) placed on (.+?)['’]s (.+?) for the Special Condition (Poisoned|Burned)$/i))) {
        const actor = actorFor(match[2]); const card = findCard(next[actor], match[3]);
        card.damage += count(match[1]) * 10; stage("damage", `${count(match[1]) * 10} damage`, [card], actor); label = "Damage"; mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?) healed (\d+) damage from (.+?)['’]s (.+)$/i))) {
        actorFor(match[1]); const actor = actorFor(match[3]); const card = findCard(next[actor], match[4]); const amount = Number(match[2]);
        if (card.damageKnown !== false && amount > card.damage) throw new Unresolved("The recorded healing exceeds the evidenced damage.");
        card.damage = Math.max(0, card.damage - amount); stage("heal", `Heal ${amount}`, [card], actor); mutationCount++; return true;
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
        const actor = actorFor(match[1]); removeHand(next[actor], [match[2]]);
        if (next.stadium) addDiscard(next.stadium.actor, [zoneCard(id(), next.stadium.name)]);
        next.stadium = { actor, name: match[2], imageUrl: zoneCard(id(), match[2]).imageUrl };
        stage("stadium", "Stadium", [zoneCard(id(), match[2])], actor); label = "Stadium"; mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?) played (.+)$/i))) {
        const actor = actorFor(match[1]); const kind = effectTag(raw);
        if (kind === "stadium") {
          removeHand(next[actor], [match[2]]);
          if (next.stadium) addDiscard(next.stadium.actor, [zoneCard(id(), next.stadium.name)]);
          next.stadium = { actor, name: match[2], imageUrl: zoneCard(id(), match[2]).imageUrl };
          stage("stadium", "Stadium", [zoneCard(id(), match[2])], actor); label = "Stadium"; mutationCount++; return true;
        }
        removeHand(next[actor], [match[2]]);
        next.playedCard = { actor, card: zoneCard(id(), match[2]) };
        stage("play", "Play", [next.playedCard.card], actor);
        if (["item", "supporter"].includes(effectTag(raw) ?? "")) addDiscard(actor, [structuredClone(next.playedCard.card)]);
        else if (kind !== "tool") { markUncertain(actor, ["discard"]); next.partial = true; errors.push("The played card's final zone is not established by card-type metadata."); }
        label = "Play"; mutationCount++; return true;
      }
      if (/^.+? (?:chose (?:heads|tails) for the opening coin flip|won the coin toss|flipped a coin and it landed on (?:heads|tails))$/i.test(line)) {
        label = detailIndex < 0 ? "Coin flip" : label; return true;
      }
      if (/^.+? decided to go (?:first|second)$/i.test(line)) { label = "First"; return true; }
      if (/^.+? ended their turn$/i.test(line)) { label = "End turn"; return true; }
      if (/^(?:.+? wins(?: the game)?|.+? conceded(?: the game)?|All Prize cards taken|No Pokémon in play)$/i.test(line)) { label = "Result"; return true; }
      if (/^Damage breakdown:$/i.test(line)) { damageBreakdown = attackDamage !== null; return damageBreakdown; }
      if ((match = line.match(/^Total damage: (\d+) damage$/i))) {
        if (attackDamage !== Number(match[1])) throw new Unresolved("The damage total contradicts the recorded attack.");
        damageBreakdown = false; return true;
      }
      // A labeled arithmetic breakdown explains the total already applied. Its
      // modifiers are metadata, never additional damage mutations.
      if (attackDamage !== null && /^(?:Base damage|Weakness to .+?|Resistance to .+?): .+$/i.test(line)) return true;
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
    const invalidate = (raw: string) => {
      const line = clean(raw);
      const actors = (["self", "opponent"] as const).filter((actor) => line.includes(actor === "self" ? input.selfPlayerName : input.opponentPlayerName));
      const affected = actors.length ? actors : /\bdamage\b/i.test(line) && damageApplied.size
        ? (["self", "opponent"] as const).filter((actor) => allCards(next[actor]).some((card) => damageApplied.has(card.id)))
        : [event.actor];
      for (const actor of affected) {
        if (/\b(?:damage|healed|counters?)\b/i.test(line)) {
          const named = allCards(next[actor]).filter((card) => line.includes(card.name));
          (named.length ? named : allCards(next[actor])).forEach((card) => { card.damageKnown = false; });
        } else if (/\b(?:draw|drew|hand|shuffl|deck|discard)/i.test(line)) {
          markUncertain(actor, ["hand", "deck", ...(/discard/i.test(line) ? ["discard" as const] : [])]);
        } else if (/\b(?:attach|evolv|retreat|switch|Bench|Active Spot|Knocked Out)/i.test(line)) {
          markUncertain(actor, ["board", "hand"]);
        } else {
          // An unknown effect can change either player's zones. Keep last seen
          // public cards as historical evidence, explicitly marked incomplete.
          for (const owner of ["self", "opponent"] as const) markUncertain(owner, ["hand", "deck", "board", "discard", "prizes"]);
          break;
        }
      }
      next.partial = true;
    };
    const applyLine = (raw: string, detailIndex: number, retry = false): void => {
      const before = structuredClone(next);
      const beforeStages = structuredClone(stages);
      const beforeContext = { prizeAction, prizeCardsAdded, prizeAmount, attackDamage, retreatingId: retreating?.id, knockedOut: knockedOut ? structuredClone(knockedOut) : null, label, damageBreakdown, lastPromotionActor, cardCounter, damageApplied: new Map(damageApplied) };
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
        mutationCount = beforeCount;
        prizeAction = beforeContext.prizeAction; prizeCardsAdded = beforeContext.prizeCardsAdded; prizeAmount = beforeContext.prizeAmount;
        attackDamage = beforeContext.attackDamage; knockedOut = beforeContext.knockedOut;
        retreating = [...allCards(next.self), ...allCards(next.opponent)].find((card) => card.id === beforeContext.retreatingId) ?? null;
        label = beforeContext.label; damageBreakdown = beforeContext.damageBreakdown; lastPromotionActor = beforeContext.lastPromotionActor; cardCounter = beforeContext.cardCounter;
        damageApplied.clear(); beforeContext.damageApplied.forEach((value, key) => damageApplied.set(key, value));
        errors.splice(beforeErrors); errors.push(error.message);
        if (error instanceof CountConflict && !retry) {
          // A numeric contradiction removes count certainty, not an explicitly
          // named attachment/draw/movement. Reapply once against unknown counts.
          for (const actor of ["self", "opponent"] as const) {
            const player = actor === "self" ? input.selfPlayerName : input.opponentPlayerName;
            if (raw.includes(player)) markUncertain(actor, ["hand", "deck", ...(/Prize/i.test(raw) ? ["prizes" as const] : [])]);
          }
          consumed.clear(); beforeConsumed.forEach((index) => consumed.add(index));
          next.partial = true; applyLine(raw, detailIndex, true);
        } else invalidate(raw);
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
        next[actor].prizesRemaining = prizes; clearUncertain(actor, "prizes");
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
    program.frames.push(next);
    previousSectionIndex = action.sourceSectionIndex;
    program.events.push(event);
  });
  program.diagnostics.evidencedActions = program.events.length;
  if (program.diagnostics.unresolvedActions.length) program.diagnostics.messages.push("Some recorded transitions could not be reconstructed. Affected information is marked unknown; independently recorded transitions remain visible.");
  program.diagnostics.messages.push("HP and exact card printings are not recorded in Battle Logs. Artwork is representative; unknown counts are shown as unknown. Discard piles include only evidenced cards.");
  program.status = understoodMutations > 0 ? "partial" : "unsupported";
  if (JSON.stringify(program).length > 8_000_000) {
    program.events = [];
    program.frames = [initial];
    program.status = "unsupported";
    program.diagnostics.messages = ["This Battle Log produces more board state than the beta replay can display. Its original source is still available in Battle Logs."];
  }
  return program;
}
