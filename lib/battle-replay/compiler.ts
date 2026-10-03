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
  if (next < 0) throw new Unresolved("The recorded card count conflicts with the reconstructed zone.");
  return next;
}

function removeHand(side: ReplaySide, names: string[], amount = names.length) {
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
  if (matches.length !== 1) throw new Unresolved(matches.length
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

/** Compile only recorded English log grammar. Unknown mutations are atomic no-ops.
 * No card text, card-name effect rules, HP guesses, private examples, or rules engine.
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
    const next = structuredClone(previous);
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
    const id = () => `action-${actionIndex}-card-${cardCounter++}`;
    const stage = (kind: ReplayTransactionStage["kind"], title: string, cards: ReplayZoneCard[], actor?: ReplayActor, hiddenCount?: number) => {
      stages.push({ kind, label: title, cards: structuredClone(cards), ...(actor ? { actor } : {}), ...(hiddenCount ? { hiddenCount } : {}) });
    };
    const cardList = (index: number) => {
      let nextIndex = index + 1;
      if (/^[- ]*\d+ drawn cards?\.?$/i.test(action.details[nextIndex] ?? "")) { consumed.add(nextIndex); nextIndex++; }
      const raw = action.details[nextIndex];
      if (!raw?.trim().startsWith("•")) return [];
      consumed.add(nextIndex);
      return clean(raw).split(",").map((name) => name.trim()).filter(Boolean);
    };
    const draw = (actor: ReplayActor, amount: number, names: string[], opening = false) => {
      if (!Number.isSafeInteger(amount) || amount < 1 || amount > 60 || names.length > amount) throw new Unresolved("The recorded draw count does not match its card list.");
      const side = next[actor];
      if (opening) { side.handCount = amount; side.knownHand = []; }
      else side.handCount = changeCount(side.handCount, amount);
      side.deckCount = changeCount(side.deckCount, -amount);
      const cards = names.map((name) => zoneCard(id(), name));
      side.knownHand.push(...cards);
      stage("draw", opening ? "Opening hand" : "Draw", cards, actor, amount - cards.length);
    };
    const promote = (actor: ReplayActor, name: string) => {
      const side = next[actor];
      if (side.active?.name === name && !side.bench.some((card) => card.name === name)) return;
      const target = findCard(side, name, "Bench");
      side.bench = side.bench.filter((card) => card.id !== target.id);
      if (side.active) { side.active.conditions = []; side.bench.unshift(side.active); }
      side.active = target;
      stage("move", "Promote", [target], actor);
    };
    const parseLine = (raw: string, detailIndex: number): boolean => {
      const line = clean(raw);
      let match: RegExpMatchArray | null;
      if ((match = line.match(/^(.+?) played (.+?) to the (Active Spot|Bench)$/i))) {
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
        if (!/Energy$/i.test(match[2])) throw new Unresolved("The attachment type is not recorded.");
        // A standalone manual attachment is from hand; an effect detail needs its origin stated.
        const origin = match[5] ?? (detailIndex < 0 ? "hand" : undefined);
        if (!origin) throw new Unresolved("The effect's attachment origin is not recorded.");
        if (origin === "hand") removeHand(side, [match[2]]);
        else if (origin === "deck") side.deckCount = changeCount(side.deckCount, -1);
        else {
          const index = side.discard.findIndex((item) => item.name === match![2]);
          if (index < 0) throw new Unresolved("The attached card is not evidenced in the discard pile.");
          side.discard.splice(index, 1);
        }
        card.energy.push(match[2].replace(/^Basic (.+) Energy$/i, "$1"));
        stage("attach", "Attach", [zoneCard(id(), match[2])], actor); stage("move", `To ${card.name}`, [card], actor);
        label = "Attach"; mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?) retreated (.+?) to the Bench$/i))) {
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
        target.damage += attackDamage;
        stage("attack", match[3], [attacker], actor); stage("damage", `${attackDamage} damage`, [target], targetActor);
        label = "Attack"; mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?)['’]s (.+?) used (?:its )?Ability(?::|\s)\s*(.+)$/i))) {
        const actor = actorFor(match[1]); const card = findCard(next[actor], match[2]);
        card.abilityUsed = true; stage("ability", match[3], [card], actor);
        label = "Ability"; mutationCount++; return true;
      }
      if (/^(.+?)['’]s (.+?) used (.+)$/i.test(line)) {
        throw new Unresolved("The source does not identify a supported attack or explicitly identify an Ability.");
      }
      if ((match = line.match(/^(.+?)['’]s (.+?) was Knocked Out$/i))) {
        const actor = actorFor(match[1]); const side = next[actor]; knockedOut = findCard(side, match[2]);
        stage("before", "Knocked Out", [knockedOut], actor);
        const discarded = [zoneCard(id(), knockedOut.name), ...knockedOut.underlying,
          ...knockedOut.energy.map((energy) => zoneCard(id(), /Energy$/i.test(energy) ? energy : `Basic ${energy} Energy`)),
          ...(knockedOut.tool ? [zoneCard(id(), knockedOut.tool)] : [])];
        side.discard.unshift(...discarded);
        if (side.active?.id === knockedOut.id) side.active = null;
        else side.bench = side.bench.filter((card) => card.id !== knockedOut!.id);
        stage("discard", "Discard", discarded, actor); label = "KO"; mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?) drew (a|\d+) cards? and played them to the Bench$/i))) {
        const actor = actorFor(match[1]); const names = cardList(detailIndex); const amount = count(match[2]);
        if (names.length !== amount) throw new Unresolved("The Pokémon placed on the Bench are not all identified.");
        const cards = names.map((name) => pokemon(id(), name)); next[actor].bench.push(...cards);
        next[actor].deckCount = changeCount(next[actor].deckCount, -amount);
        stage("bench", "Bench", cards, actor); mutationCount++; return true;
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
      if ((match = line.match(/^(.+?) was added to (.+?)['’]s hand$/i))) {
        const actor = actorFor(match[2]);
        if (prizeAction) {
          prizeCardsAdded++;
          if (prizeCardsAdded > prizeAmount) throw new Unresolved("The recorded Prize card list exceeds the Prize count.");
        } else next[actor].handCount = changeCount(next[actor].handCount, 1);
        if (!/^a card$/i.test(match[1])) {
          const card = zoneCard(id(), match[1]); next[actor].knownHand.push(card);
          if (prizeAction) {
            stages[0].cards.push(card);
            if (prizeAmount > stages[0].cards.length) stages[0].hiddenCount = prizeAmount - stages[0].cards.length;
            else delete stages[0].hiddenCount;
          }
          else stage("return", "To hand", [card], actor);
        }
        mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?) discarded (a|\d+) cards?$/i))) {
        const actor = actorFor(match[1]); const names = cardList(detailIndex); const amount = count(match[2]);
        if (names.length !== amount) throw new Unresolved("The discarded cards are not fully identified.");
        removeHand(next[actor], names, amount); const cards = names.map((name) => zoneCard(id(), name));
        next[actor].discard.unshift(...cards); stage("discard", "Discard", cards, actor); mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?) (?:was|were) discarded from (.+?)['’]s (.+)$/i))) {
        const actor = actorFor(match[2]); const side = next[actor];
        const names = /^(?:a|\d+) cards?$/i.test(match[1]) ? cardList(detailIndex) : [match[1]];
        if (!names.length) throw new Unresolved("The discarded attachments are not identified.");
        if (knockedOut?.name === match[3]) {
          const available = [...knockedOut.underlying.map((card) => card.name), ...knockedOut.energy.map((energy) => /Energy$/i.test(energy) ? energy : `Basic ${energy} Energy`), ...(knockedOut.tool ? [knockedOut.tool] : [])];
          for (const name of names) { const index = available.indexOf(name); if (index < 0) throw new Unresolved("A discarded attachment was not previously evidenced."); available.splice(index, 1); }
          return true; // Already removed by the explicitly recorded knockout.
        }
        const card = retreating?.name === match[3] ? retreating : findCard(side, match[3]);
        for (const name of names) {
          const energy = name.replace(/^Basic (.+) Energy$/i, "$1"); const index = card.energy.indexOf(energy);
          if (index < 0) throw new Unresolved("A discarded attachment was not previously evidenced.");
          card.energy.splice(index, 1); side.discard.unshift(zoneCard(id(), name));
        }
        stage("discard", "Discard", names.map((name) => zoneCard(id(), name)), actor); mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?) shuffled (a|\d+) cards? from their hand into their deck$/i))) {
        const actor = actorFor(match[1]); const names = cardList(detailIndex); const amount = count(match[2]);
        if (names.length > amount) throw new Unresolved("The shuffled card list exceeds its count.");
        removeHand(next[actor], names, amount); next[actor].deckCount = changeCount(next[actor].deckCount, amount);
        stage("shuffle", "Shuffle", names.map((name) => zoneCard(id(), name)), actor, amount - names.length); mutationCount++; return true;
      }
      if (/^(.+?) shuffled (a|\d+) cards? into their deck$/i.test(line)) {
        throw new Unresolved("The shuffled cards' origin is not recorded.");
      }
      if ((match = line.match(/^(.+?) shuffled their hand into their deck$/i))) {
        const actor = actorFor(match[1]); const side = next[actor];
        stage("shuffle", "Shuffle hand", side.knownHand, actor, side.handCount === null ? undefined : side.handCount - side.knownHand.length);
        side.deckCount = side.handCount === null ? null : changeCount(side.deckCount, side.handCount);
        side.handCount = 0; side.knownHand = []; mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?) put (a|\d+) damage counters? on (.+?)['’]s (.+)$/i))) {
        actorFor(match[1]); const actor = actorFor(match[3]); const card = findCard(next[actor], match[4]);
        card.damage += count(match[2]) * 10; stage("damage", `${count(match[2]) * 10} damage`, [card], actor); mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?) moved (a|\d+) damage counters? from (.+?)['’]s (.+?) to (.+?)['’]s (.+)$/i))) {
        actorFor(match[1]); const fromActor = actorFor(match[3]); const toActor = actorFor(match[5]);
        const from = findCard(next[fromActor], match[4]); const to = findCard(next[toActor], match[6]); const amount = count(match[2]) * 10;
        if (from.damage < amount) throw new Unresolved("The recorded damage movement exceeds the evidenced damage.");
        from.damage -= amount; to.damage += amount;
        stage("move", "Move damage from", [from], fromActor); stage("damage", `${amount} damage`, [to], toActor); mutationCount++; return true;
      }
      if ((match = line.match(/^(a|\d+) damage counters? (?:was|were) placed on (.+?)['’]s (.+?) for the Special Condition (Poisoned|Burned)$/i))) {
        const actor = actorFor(match[2]); const card = findCard(next[actor], match[3]);
        card.damage += count(match[1]) * 10; stage("damage", `${count(match[1]) * 10} damage`, [card], actor); label = "Damage"; mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?) healed (\d+) damage from (.+?)['’]s (.+)$/i))) {
        actorFor(match[1]); const actor = actorFor(match[3]); const card = findCard(next[actor], match[4]); const amount = Number(match[2]);
        if (amount > card.damage) throw new Unresolved("The recorded healing exceeds the evidenced damage.");
        card.damage -= amount; stage("heal", `Heal ${amount}`, [card], actor); mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?)['’]s (.+?) (?:is now|was|became|is) (Poisoned|Burned|Asleep)$/i))) {
        const actor = actorFor(match[1]); const card = findCard(next[actor], match[2], "Active Spot");
        const condition = (["Poisoned", "Burned", "Asleep"] as ReplayCondition[]).find((value) => value.toLowerCase() === match![3].toLowerCase())!;
        card.conditions = [...new Set([...(card.conditions ?? []), condition])]; label = "Condition"; mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?)['’]s (.+?) (?:recovered from|is no longer) (Poisoned|Burned|Asleep|Poison|Burn|Sleep)$/i))) {
        const actor = actorFor(match[1]); const card = findCard(next[actor], match[2], "Active Spot");
        const condition: ReplayCondition = /^poison/i.test(match[3]) ? "Poisoned" : /^burn/i.test(match[3]) ? "Burned" : "Asleep";
        card.conditions = (card.conditions ?? []).filter((value) => value !== condition); mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?)['’]s (.+?) (woke up|recovered from all Special Conditions)$/i))) {
        const card = findCard(next[actorFor(match[1])], match[2], "Active Spot");
        card.conditions = /^woke/i.test(match[3]) ? (card.conditions ?? []).filter((value) => value !== "Asleep") : [];
        mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?) played (.+?) to the Stadium spot$/i))) {
        const actor = actorFor(match[1]); removeHand(next[actor], [match[2]]);
        // The log proves the replacement, but not the previous Stadium's discard destination.
        next.stadium = { actor, name: match[2], imageUrl: zoneCard(id(), match[2]).imageUrl };
        stage("stadium", "Stadium", [zoneCard(id(), match[2])], actor); label = "Stadium"; mutationCount++; return true;
      }
      if ((match = line.match(/^(.+?) played (.+)$/i))) {
        const actor = actorFor(match[1]); removeHand(next[actor], [match[2]]);
        next.playedCard = { actor, card: zoneCard(id(), match[2]) };
        stage("play", "Play", [next.playedCard.card], actor); label = "Play"; mutationCount++; return true;
      }
      if (/^.+? (?:chose (?:heads|tails) for the opening coin flip|won the coin toss|flipped a coin and it landed on (?:heads|tails))$/i.test(line)) {
        label = detailIndex < 0 ? "Coin flip" : label; return true;
      }
      if (/^.+? decided to go (?:first|second)$/i.test(line)) { label = "First"; return true; }
      if (/^.+? ended their turn$/i.test(line)) { label = "End turn"; return true; }
      if (/^(?:.+? wins(?: the game)?|.+? conceded(?: the game)?|All Prize cards taken|No Pokémon in play)$/i.test(line)) { label = "Result"; return true; }
      if (/^Damage breakdown:$/i.test(line)) return attackDamage !== null;
      if (/^(?:Base damage|Weakness to .+?|Resistance to .+?): \d+ damage$/i.test(line)) return attackDamage !== null;
      if ((match = line.match(/^Total damage: (\d+) damage$/i))) return attackDamage === Number(match[1]);
      if (!line) return true;
      return false;
    };

    const titleOwner = [input.selfPlayerName, input.opponentPlayerName].sort((a, b) => b.length - a.length)
      .find((name) => action.sourceTitle.startsWith(`${name} `) || action.sourceTitle.startsWith(`${name}'s `) || action.sourceTitle.startsWith(`${name}’s `));
    const event: ReplayEvent = { actor: titleOwner ? actorFor(titleOwner) : action.actor, turn: action.turn,
      sourceSectionIndex: action.sourceSectionIndex, sourceTitle: action.sourceTitle,
      sourceDetails: [...action.details], label, summary: anonymise(action.sourceTitle, input) };
    try {
      if (action.turn > 0 && action.sourceSectionIndex !== previousSectionIndex) {
        allCards(next[action.actor]).forEach((card) => { card.abilityUsed = false; });
      }
      if (!parseLine(action.sourceTitle, -1)) throw new Unresolved("This action is not supported by the beta replay grammar.");
      for (let index = 0; index < action.details.length; index++) {
        if (consumed.has(index)) continue;
        if (!parseLine(action.details[index], index)) throw new Unresolved(`Unresolved detail: ${anonymise(action.details[index], input)}`);
      }
      const section = sectionEnds.get(actionIndex);
      if (section) for (const actor of ["self", "opponent"] as const) {
        const name = actor === "self" ? input.selfPlayerName : input.opponentPlayerName;
        const prizes = section.prizesAfterTurn[name];
        if (Number.isInteger(prizes) && prizes >= 0 && prizes <= 6) next[actor].prizesRemaining = prizes;
      }
      for (const actor of ["self", "opponent"] as const) {
        const side = next[actor];
        const cards = allCards(side);
        const recordedCards = cards.length + cards.reduce((total, card) => total + card.underlying.length + card.energy.length, 0) + side.knownHand.length + side.discard.length;
        if (recordedCards > 120 || side.handCount !== null && (side.handCount > 60 || side.knownHand.length > side.handCount)
          || cards.some((card) => !Number.isSafeInteger(card.damage) || card.damage < 0)) {
          throw new Unresolved("The reconstructed state conflicts with the recorded cards or exceeds the beta replay bounds.");
        }
      }
      understoodMutations += mutationCount;
      event.label = label;
      if (stages.length) event.transaction = { actor: event.actor, title: event.summary, stages };
      program.frames.push(next);
      previousSectionIndex = action.sourceSectionIndex;
    } catch (error) {
      if (!(error instanceof Unresolved)) throw error;
      event.unresolved = [error.message];
      program.diagnostics.unresolvedActions.push(actionIndex);
      program.diagnostics.unresolvedMutations++;
      // Keep the last evidenced board; later frames remain explicitly partial.
      program.frames.push({ ...structuredClone(previous), partial: true });
    }
    program.events.push(event);
  });
  program.diagnostics.evidencedActions = program.events.length;
  if (program.diagnostics.unresolvedActions.length) program.diagnostics.messages.push("Some actions could not be reconstructed. Their board state is unchanged, and later frames may be incomplete.");
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
