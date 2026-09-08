import { applyReplayConditions } from "./conditions";
import { buildDeckListCardImageUrl } from "@/lib/deck-lists/render";
import {
  formatBattleLogActionTitle,
  getBattleLogActionTagLabel,
} from "@/lib/battle-log/display";
import { extractBattleLogActionCardCandidate } from "@/lib/battle-log/action-tags";
import {
  flattenReplaySourceActions,
  getDamageCounterPlacements,
  type ReplaySourceAction,
} from "@/lib/battle-replay/source";
import type { LogSection } from "@/types/index";
import type {
  ReplayActor,
  ReplayCard,
  ReplayEvent,
  ReplaySide,
  ReplayState,
  ReplayTransaction,
  ReplayTransactionStage,
  ReplayZoneCard,
} from "@/lib/battle-replay/prototype";

export type ReplayPilotSource = {
  logId: string;
  playedOn: string;
  format: string;
  result: "Win" | "Loss";
  selfDeck: string;
  opponentDeck: string;
  selfPrizesTaken: number;
  opponentPrizesTaken: number;
  turns: number;
};

export type ReplayPilot = {
  id: string;
  label: string;
  source: ReplayPilotSource;
  events: ReplayEvent[];
  frames: ReplayState[];
  diagnostics: { evidencedActions: number; unresolvedMutations: number };
};

type CardReference = { set: string; number: string; hp?: number };

const references: Record<string, CardReference> = {
  "Air Balloon": { set: "MEG", number: "166" },
  "Area Zero Underdepths": { set: "PRE", number: "94" },
  "Basic Darkness Energy": { set: "SVE", number: "7" },
  "Basic Fire Energy": { set: "SVE", number: "2" },
  "Basic Metal Energy": { set: "SVE", number: "8" },
  "Basic Psychic Energy": { set: "SVE", number: "5" },
  Beldum: { set: "TEF", number: "113", hp: 70 },
  "Blaziken ex": { set: "JTG", number: "24", hp: 320 },
  "Boss's Orders": { set: "ASC", number: "183" },
  "Buddy-Buddy Poffin": { set: "MEG", number: "167" },
  Budew: { set: "ASC", number: "16", hp: 30 },
  Combusken: { set: "JTG", number: "23", hp: 90 },
  Crispin: { set: "SCR", number: "133" },
  Dawn: { set: "PFL", number: "87" },
  Drilbur: { set: "PBL", number: "46", hp: 70 },
  Dragapult: { set: "TWM", number: "130", hp: 320 },
  "Dragapult ex": { set: "TWM", number: "130", hp: 320 },
  Drakloak: { set: "TWM", number: "129", hp: 90 },
  Dreepy: { set: "TWM", number: "128", hp: 70 },
  "Energy Recycler": { set: "POR", number: "108" },
  "Fezandipiti ex": { set: "ASC", number: "142", hp: 210 },
  "Genesect ex": { set: "BLK", number: "67", hp: 220 },
  Heatran: { set: "TWM", number: "123", hp: 140 },
  "Lillie's Clefairy ex": { set: "JTG", number: "56", hp: 190 },
  "Lillie's Determination": { set: "ASC", number: "192" },
  Judge: { set: "POR", number: "76" },
  Meowth: { set: "POR", number: "62", hp: 200 },
  "Meowth ex": { set: "POR", number: "62", hp: 200 },
  Metagross: { set: "CRI", number: "61", hp: 180 },
  Metang: { set: "TEF", number: "114", hp: 100 },
  Moltres: { set: "PFL", number: "14", hp: 120 },
  Munkidori: { set: "TWM", number: "95", hp: 110 },
  "Night Stretcher": { set: "ASC", number: "196" },
  "Poké Pad": { set: "POR", number: "81" },
  "Precious Trolley": { set: "SSP", number: "185" },
  Psyduck: { set: "ASC", number: "226", hp: 70 },
  "Rare Candy": { set: "MEG", number: "125" },
  "Risky Ruins": { set: "MEG", number: "127" },
  "Special Red Card": { set: "CRI", number: "82" },
  "Team Rocket's Petrel": { set: "DRI", number: "176" },
  "Team Rocket's Factory": { set: "DRI", number: "173" },
  Torchic: { set: "JTG", number: "22", hp: 60 },
  "Ultra Ball": { set: "ASC", number: "213" },
  "Unfair Stamp": { set: "TWM", number: "165" },
};

const imageFor = (name: string) => {
  const reference = references[name];
  return reference
    ? buildDeckListCardImageUrl(reference.set, reference.number, "LG")
    : "";
};

const zoneCard = (id: string, name: string): ReplayZoneCard => ({
  id,
  name,
  imageUrl: imageFor(name),
});

const pokemonCard = (id: string, name: string): ReplayCard => ({
  ...zoneCard(id, name),
  hp: references[name]?.hp ?? 100,
  damage: 0,
  energy: [],
  underlying: [],
});

const clone = (state: ReplayState) => structuredClone(state);
const clean = (value: string) => value.trim().replace(/^[-•]\s*/, "").replace(/\.$/, "");
const pluralCount = (value: string) => value.toLowerCase() === "a" ? 1 : Number(value);
type ReplayEffectRule = {
  attachmentOrigin?: "deck" | "discard";
  counterTarget?: "defending-board";
  itemLock?: boolean;
  shuffleEntireAffectedHand?: boolean;
};

const replayEffectRules: Record<string, ReplayEffectRule> = {
  Crispin: { attachmentOrigin: "deck" },
  "Itchy Pollen": { itemLock: true },
  "Phantom Dive": { counterTarget: "defending-board" },
  "Seething Spirit": { attachmentOrigin: "discard" },
  "Special Red Card": { shuffleEntireAffectedHand: true },
};

function effectRuleForAction(title: string) {
  return Object.entries(replayEffectRules).find(([name]) =>
    title.includes(`played ${name}.`)
    || title.includes(`used ${name}.`)
    || title.includes(`used ${name} on `)
  )?.[1];
}

function playerActor(value: string, selfPlayerName: string): ReplayActor {
  return value.replace(/[’']s$/, "") === selfPlayerName ? "self" : "opponent";
}

function anonymisePlayers(value: string, selfPlayerName: string, opponentPlayerName: string) {
  return value
    .replaceAll(`${selfPlayerName}'s`, "Your")
    .replaceAll(`${selfPlayerName}’s`, "Your")
    .replaceAll(selfPlayerName, "You")
    .replaceAll(`${opponentPlayerName}'s`, "The opponent's")
    .replaceAll(`${opponentPlayerName}’s`, "The opponent's")
    .replaceAll(opponentPlayerName, "The opponent")
    .replace(/\bYou wins\b/g, "You win");
}

function eventLabel(title: string) {
  if (/coin flip/i.test(title)) return "Coin flip";
  if (/decided to go/i.test(title)) return "First";
  if (/\bdrew\b/i.test(title)) return "Draw";
  if (/took (?:a|\d+) Prize/i.test(title)) return "Prize";
  if (/ended their turn/i.test(title)) return "End turn";
  if (/All Prize cards taken/i.test(title)) return "Result";
  return getBattleLogActionTagLabel(title);
}

function removeHand(side: ReplaySide, name?: string, count = 1) {
  if (name) {
    const index = side.knownHand.findIndex((card) => card.name === name);
    if (index >= 0) side.knownHand.splice(index, 1);
  }
  side.handCount = Math.max(0, side.handCount - count);
}

function draw(side: ReplaySide, names: string[], count = names.length || 1) {
  names.forEach((name, index) => side.knownHand.push(zoneCard(`hand-${name}-${side.knownHand.length}-${index}`, name)));
  side.handCount += count;
  side.deckCount = Math.max(0, side.deckCount - count);
}

function addToHand(side: ReplaySide, names: string[], count: number, prefix: string) {
  names.slice(0, count).forEach((name, index) =>
    side.knownHand.push(zoneCard(`${prefix}-hand-${index}-${name}`, name))
  );
  side.handCount += count;
}

function removeDiscard(side: ReplaySide, name: string) {
  const index = side.discard.findIndex((card) => card.name === name);
  if (index < 0) return false;
  side.discard.splice(index, 1);
  return true;
}

function discard(side: ReplaySide, names: string[], prefix: string) {
  names.forEach((name, index) => {
    removeHand(side, name);
    side.discard.unshift(zoneCard(`${prefix}-discard-${index}-${name}`, name));
  });
}

function listAfter(details: string[], index: number): string[] {
  const next = details[index + 1]?.trim();
  if (!next?.startsWith("•")) return [];
  return clean(next).split(",").map((name) => name.trim()).filter(Boolean);
}

function allBoardCards(side: ReplaySide) {
  return [side.active, ...side.bench].filter((card): card is ReplayCard => Boolean(card));
}

function findBoardCard(side: ReplaySide, name: string, preferUnusedAbility = false) {
  const matches = allBoardCards(side).filter((card) => card.name === name);
  return preferUnusedAbility ? matches.find((card) => !card.abilityUsed) ?? matches[0] : matches[0];
}

function locateBoardCard(
  state: ReplayState,
  name: string,
  preferred: ReplayActor,
) {
  const preferredCard = findBoardCard(state[preferred], name);
  if (preferredCard) return { actor: preferred, card: preferredCard };
  const fallback: ReplayActor = preferred === "self" ? "opponent" : "self";
  const fallbackCard = findBoardCard(state[fallback], name);
  return fallbackCard ? { actor: fallback, card: fallbackCard } : null;
}

function locateDamageCounterTarget(
  state: ReplayState,
  name: string,
  preferred: ReplayActor,
  damage: number,
  followingKnockouts: Set<string>,
  restrictToPreferred = false,
) {
  const fallback: ReplayActor = preferred === "self" ? "opponent" : "self";
  const actors: ReplayActor[] = restrictToPreferred ? [preferred] : [preferred, fallback];
  const candidates = actors.flatMap((actor) =>
    allBoardCards(state[actor])
      .filter((card) => card.name === name)
      .map((card) => ({ actor, card }))
  );
  const isLethal = ({ card }: (typeof candidates)[number]) => card.damage + damage >= card.hp;
  const evidencedKnockout = candidates.find((candidate) =>
    isLethal(candidate) && followingKnockouts.has(`${candidate.actor}:${candidate.card.name}`)
  );
  return evidencedKnockout ?? candidates.find((candidate) => !isLethal(candidate)) ?? null;
}

function discardAttachedCards(
  side: ReplaySide,
  targetName: string,
  names: string[],
  prefix: string,
  targetId?: string,
) {
  const target = targetId
    ? allBoardCards(side).find((card) => card.id === targetId)
    : findBoardCard(side, targetName);
  if (!target) return;
  names.forEach((name, index) => {
    const energy = name.match(/^Basic (.+?) Energy$/i)?.[1];
    if (energy) {
      const energyIndex = target.energy.findIndex((type) => type.toLowerCase() === energy.toLowerCase());
      if (energyIndex < 0) return;
      target.energy.splice(energyIndex, 1);
    } else if (target.tool === name) {
      target.tool = undefined;
    } else {
      const underlyingIndex = target.underlying.findIndex((card) => card.name === name);
      if (underlyingIndex < 0) return;
      target.underlying.splice(underlyingIndex, 1);
    }
    side.discard.unshift(zoneCard(`${prefix}-attached-discard-${index}-${name}`, name));
  });
}

function promote(side: ReplaySide, name: string) {
  const index = side.bench.findIndex((card) => card.name === name);
  if (index < 0) return false;
  const [nextActive] = side.bench.splice(index, 1);
  if (side.active) side.bench.unshift(side.active);
  side.active = nextActive;
  return true;
}

function discardPokemon(side: ReplaySide, name: string, prefix: string) {
  const active = side.active?.name === name ? side.active : null;
  const benchIndex = active ? -1 : side.bench.findIndex((card) => card.name === name);
  const target = active ?? (benchIndex >= 0 ? side.bench[benchIndex] : null);
  if (!target) return false;
  const attachments = [
    ...target.underlying,
    ...target.energy.map((energy, index) => zoneCard(`${prefix}-energy-${index}`, `Basic ${energy} Energy`)),
    ...(target.tool ? [zoneCard(`${prefix}-tool`, target.tool)] : []),
    zoneCard(`${prefix}-top`, target.name),
  ];
  side.discard.unshift(...attachments.reverse());
  if (active) side.active = null;
  else side.bench.splice(benchIndex, 1);
  return true;
}

function parseCardNames(value: string) {
  return value.split(",").map((name) => name.trim()).filter(Boolean);
}

function parseSpecialConditionDamage(title: string) {
  const match = title.match(
    /^(a|\d+) damage counters? (?:was|were) placed on (.+?)['’]s (.+?) for the Special Condition (Poisoned|Burned)\.$/i,
  );
  if (!match?.[1] || !match[2] || !match[3] || !match[4]) return null;
  return {
    counters: pluralCount(match[1]),
    owner: match[2],
    targetName: match[3],
    condition: match[4],
  };
}

function groupRepeatedAttachments(stages: ReplayTransactionStage[]) {
  const grouped: ReplayTransactionStage[] = [];

  for (let index = 0; index < stages.length;) {
    const attachment = stages[index];
    const target = stages[index + 1];
    if (attachment?.kind !== "attach" || target?.kind !== "move") {
      grouped.push(attachment);
      index += 1;
      continue;
    }

    const cards = [...attachment.cards];
    let nextIndex = index + 2;
    while (
      stages[nextIndex]?.kind === "attach"
      && stages[nextIndex + 1]?.kind === "move"
      && stages[nextIndex + 1]?.label === target.label
      && stages[nextIndex + 1]?.actor === target.actor
    ) {
      cards.push(...stages[nextIndex].cards);
      nextIndex += 2;
    }

    grouped.push(
      cards.length > 1
        ? { ...attachment, label: `Attach ${cards.length} Energy`, cards }
        : attachment,
      target,
    );
    index = nextIndex;
  }

  return grouped;
}

function transactionStages(action: ReplaySourceAction, selfPlayerName: string): ReplayTransactionStage[] {
  const stages: ReplayTransactionStage[] = [];
  const stadiumCandidate = action.sourceTitle.match(/\bplayed (.+?) to the Stadium spot\.$/i)?.[1];
  const candidate = stadiumCandidate ?? extractBattleLogActionCardCandidate(action.sourceTitle);
  if (candidate && /\bplayed\b/i.test(action.sourceTitle) && !/\b(?:Active Spot|Bench)\b/i.test(action.sourceTitle)) {
    stages.push({ kind: "play", label: "Play", cards: [zoneCard(`overlay-${action.legacyIndex ?? action.sourceTitle}`, candidate)] });
  }

  const evolved = action.sourceTitle.match(/^(.+?) evolved (.+?) to (.+?) (?:in|on) the (Active Spot|Bench)\.$/i);
  if (evolved) {
    stages.push({ kind: "before", label: "From", cards: [zoneCard(`evolve-from-${action.sourceTitle}`, evolved[2])] });
    stages.push({ kind: "evolve", label: "Evolve into", cards: [zoneCard(`evolve-to-${action.sourceTitle}`, evolved[3])] });
  }

  const retreated = action.sourceTitle.match(/^(.+?) retreated (.+?) to the Bench\.$/i);
  if (retreated) {
    const discarded = action.details.flatMap((detail, index) => {
      const value = clean(detail);
      if (/(?:was|were) discarded from/i.test(value)) {
        const listed = listAfter(action.details, index);
        if (listed.length) return listed;
        const single = value.match(/^(.+?) was discarded from/i)?.[1];
        return single ? [single] : [];
      }
      return [];
    });
    const promotion = action.details.map(clean)
      .map((detail) => detail.match(/^.+?['’]s (.+?) is now in the Active Spot$/i)?.[1])
      .find(Boolean);
    stages.push({ kind: "move", label: "Out", cards: [zoneCard(`retreat-out-${action.sourceTitle}`, retreated[2])] });
    stages.push({ kind: "discard", label: "Discard", cards: discarded.map((name, index) => zoneCard(`retreat-discard-${index}-${name}`, name)) });
    if (promotion) stages.push({ kind: "move", label: "In", cards: [zoneCard(`retreat-in-${action.sourceTitle}`, promotion)] });
  }

  const prize = action.sourceTitle.match(/^(.+?) took (a|\d+) Prize cards?\.$/i);
  if (prize) {
    const count = pluralCount(prize[2]);
    const names = action.details.flatMap((detail) => {
      const added = clean(detail).match(/^(.+?) was added to .+?['’]s hand$/i)?.[1];
      return added && added.toLowerCase() !== "a card" ? [added] : [];
    });
    stages.push({
      kind: "draw",
      label: "Take Prize",
      cards: names.map((name, index) => zoneCard(`prize-${index}-${name}`, name)),
      hiddenCount: Math.max(0, count - names.length) || undefined,
    });
    const promotion = action.details.map(clean)
      .map((detail) => detail.match(/^(.+?)['’]s (.+?) is now in the Active Spot$/i))
      .find(Boolean);
    if (promotion?.[1] && promotion[2]) {
      const promotionActor = playerActor(promotion[1], selfPlayerName);
      stages.push({
        kind: "move",
        label: "Promote",
        cards: [zoneCard(`prize-promote-${action.sourceTitle}`, promotion[2])],
        actor: promotionActor,
        detail: `${promotionActor === "self" ? "you promote" : "opponent promotes"} ${promotion[2]}`,
      });
    }
  }

  const knockedOut = action.sourceTitle.match(/^(.+?)['’]s (.+?) was Knocked Out!$/i);
  if (knockedOut) {
    const discarded = action.details.flatMap((detail, index) => {
      const listed = listAfter(action.details, index);
      if (listed.length) return listed;
      const single = clean(detail).match(/^(.+?) was discarded from/i)?.[1];
      return single ? [single] : [];
    });
    stages.push({ kind: "before", label: "Knocked Out", cards: [zoneCard(`knockout-${action.sourceTitle}`, knockedOut[2])] });
    stages.push({
      kind: "discard",
      label: "Discard",
      cards: [knockedOut[2], ...discarded].map((name, index) => zoneCard(`knockout-discard-${index}-${name}`, name)),
    });
  }

  const conditionDamage = parseSpecialConditionDamage(action.sourceTitle);
  if (conditionDamage) {
    const damage = conditionDamage.counters * 10;
    stages.push({
      kind: "damage",
      label: `${damage} damage`,
      cards: [zoneCard(`condition-damage-${action.sourceTitle}`, conditionDamage.targetName)],
      actor: playerActor(conditionDamage.owner, selfPlayerName),
      detail: `${damage} damage from ${conditionDamage.condition}`,
    });
  }

  const ability = action.sourceTitle.match(/['’]s (.+?) used (.+?)\./i);
  const attack = action.sourceTitle.match(/['’]s (.+?) used (.+?) on (?:.+?['’]s )?(.+?) for (\d+)\+? damage/i);
  if (attack?.[1]) {
    stages.push({ kind: "attack", label: attack[2] ?? "Attack", cards: [zoneCard(`attack-${action.sourceTitle}`, attack[1])] });
    const totalDamage = Number(attack[4]);
    const weakness = action.sourceTitle.match(/took (\d+) more damage because of (.+?) Weakness/i);
    const bonusDamage = Number(weakness?.[1] ?? 0);
    const baseDamage = totalDamage - bonusDamage;
    stages.push({
      kind: "damage",
      label: `${totalDamage} damage`,
      cards: [zoneCard(`attack-target-${action.sourceTitle}`, attack[3])],
      damageModifier: weakness?.[2] ? {
        kind: "weakness",
        type: weakness[2],
        baseDamage,
        bonusDamage,
        multiplier: baseDamage > 0 ? totalDamage / baseDamage : undefined,
      } : undefined,
    });
  }
  else if (ability?.[1]) stages.push({ kind: "ability", label: ability[2] ?? "Ability", cards: [zoneCard(`ability-${action.sourceTitle}`, ability[1])] });

  action.details.forEach((detail, index) => {
    const value = clean(detail);
    if (/opening hand/i.test(value) || /^\d+ drawn cards?$/i.test(value)) return;
    const cards = listAfter(action.details, index).map((name, cardIndex) => zoneCard(`detail-${index}-${cardIndex}-${name}`, name));
    if (/discarded? (?:a|\d+) cards?/i.test(value)) stages.push({ kind: "discard", label: "Discard", cards, hiddenCount: cards.length ? undefined : Number(value.match(/\d+/)?.[0] ?? 1) });
    else if (/^(.+?) shuffled their hand$/i.test(value)) {
      const match = value.match(/^(.+?) shuffled their hand$/i);
      stages.push({
        kind: "shuffle",
        label: "Shuffle",
        cards: [],
        actor: match?.[1] ? playerActor(match[1], selfPlayerName) : action.actor,
        detail: match?.[1] && playerActor(match[1], selfPlayerName) === "self"
          ? "you shuffle your hand into your deck"
          : "opponent shuffles their hand into their deck",
      });
    }
    else if (/shuffled? (?:a|\d+) cards?/i.test(value)) stages.push({ kind: "shuffle", label: "Shuffle", cards, hiddenCount: cards.length ? undefined : Number(value.match(/\d+/)?.[0] ?? 1) });
    else if (/drew \d+ cards? and played them to the Bench/i.test(value)) stages.push({ kind: "bench", label: "Bench", cards });
    else if (/drew (?:a|\d+) cards?/i.test(value)) stages.push({
      kind: "draw",
      label: "Draw",
      cards,
      hiddenCount: cards.length ? undefined : pluralCount(value.match(/drew (a|\d+)/i)?.[1] ?? "1"),
      actor: playerActor(value.match(/^(.+?) drew/i)?.[1] ?? action.sourceTitle, selfPlayerName),
      detail: playerActor(value.match(/^(.+?) drew/i)?.[1] ?? action.sourceTitle, selfPlayerName) === action.actor
        ? undefined
        : `${playerActor(value.match(/^(.+?) drew/i)?.[1] ?? action.sourceTitle, selfPlayerName) === "self" ? "you draw" : "opponent draws"} ${pluralCount(value.match(/drew (a|\d+)/i)?.[1] ?? "1")} cards`,
    });
    else if (/drew .+/i.test(value)) stages.push({
      kind: "draw",
      label: "Draw",
      cards: [zoneCard(`detail-draw-${index}`, value.replace(/^.+? drew /i, ""))],
      actor: playerActor(value.match(/^(.+?) drew/i)?.[1] ?? action.sourceTitle, selfPlayerName),
    });
    else if (/attached Basic .+ Energy to/i.test(value)) {
      const attachment = value.match(/attached (Basic .+? Energy) to (.+?) (?:in|on) the (?:Active Spot|Bench)$/i);
      stages.push({ kind: "attach", label: "Attach", cards: [zoneCard(`detail-attach-${index}`, attachment?.[1] ?? "Energy")] });
      if (attachment?.[2]) stages.push({ kind: "move", label: `To ${attachment[2]}`, cards: [zoneCard(`detail-attach-target-${index}`, attachment[2])] });
    }
    else if (/moved? \d+ damage counters?/i.test(value)) {
      const targets = value.match(/from (?:.+?['’]s )?(.+?) to (?:.+?['’]s )?(.+)$/i);
      const counters = pluralCount(value.match(/moved (a|\d+) damage counters?/i)?.[1] ?? "1");
      if (targets) {
        stages.push({ kind: "move", label: `From ${targets[1]}`, cards: [zoneCard(`move-from-${index}`, targets[1])], detail: `${counters * 10} damage removed` });
        stages.push({ kind: "move", label: `To ${targets[2]}`, cards: [zoneCard(`move-to-${index}`, targets[2])], detail: `${counters * 10} damage added` });
      }
    } else if (/put (?:a|\d+) damage counters?/i.test(value)) {
      const placement = getDamageCounterPlacements([detail])[0];
      stages.push({ kind: "damage", label: placement ? `${placement.counters * 10} damage` : "Damage", cards: placement ? [zoneCard(`damage-${index}`, placement.targetName)] : [], detail: placement ? `${placement.counters * 10} damage placed on ${placement.targetName}` : undefined });
    }
  });
  const coalesceBoth = (kind: "shuffle" | "draw", detail: string) => {
    const matches = stages.filter((stage) => stage.kind === kind);
    if (matches.length < 2) return;
    const actorEntries = action.details.flatMap((rawValue, detailIndex) => {
      const value = clean(rawValue);
      const pattern = kind === "draw"
        ? /^(.+?) drew (a|\d+) cards?$/i
        : /^(.+?) shuffled (a|\d+) cards? into their deck$/i;
      const match = value.match(pattern);
      if (!match?.[1] || !match[2]) return [];
      return [{
        actor: playerActor(match[1], selfPlayerName),
        cards: listAfter(action.details, detailIndex).map((name, cardIndex) =>
          zoneCard(`detail-${detailIndex}-${cardIndex}-${name}`, name)
        ),
        count: pluralCount(match[2]),
      }];
    });
    const firstIndex = stages.findIndex((stage) => stage.kind === kind);
    const combined: ReplayTransactionStage = {
      kind,
      label: kind === "draw" ? "Draw" : "Shuffle",
      cards: [],
      scope: "both",
      detail,
      actorCounts: Object.fromEntries(actorEntries.map((entry) => [entry.actor, entry.count])),
      actorCards: Object.fromEntries(
        actorEntries.filter((entry) => entry.cards.length).map((entry) => [entry.actor, entry.cards]),
      ),
    };
    stages.splice(firstIndex, 0, combined);
    for (let index = stages.length - 1; index > firstIndex; index -= 1) {
      if (stages[index].kind === kind) stages.splice(index, 1);
    }
  };
  coalesceBoth("shuffle", "both players shuffle their hand into their deck");
  const drawCounts = action.details.map(clean).flatMap((detail) => {
    const match = detail.match(/^.+? drew (a|\d+) cards?$/i);
    return match?.[1] ? [pluralCount(match[1])] : [];
  });
  coalesceBoth("draw", drawCounts.length === 2 && drawCounts[0] === drawCounts[1]
    ? `each player draws ${drawCounts[0]} cards`
    : "both players draw the logged cards");
  return groupRepeatedAttachments(stages);
}

function applyDetails(
  state: ReplayState,
  action: ReplaySourceAction,
  selfPlayerName: string,
  eventId: string,
  stages: ReplayTransactionStage[],
  followingKnockouts: Set<string>,
) {
  const effectRule = effectRuleForAction(action.sourceTitle);
  action.details.forEach((detail, index) => {
    const value = clean(detail);
    if (/opening hand/i.test(value) || /^\d+ drawn cards?$/i.test(value)) return;
    const names = listAfter(action.details, index);
    const shuffledHand = value.match(/^(.+?) shuffled their hand$/i);
    if (shuffledHand && effectRule?.shuffleEntireAffectedHand) {
      const side = state[playerActor(shuffledHand[1], selfPlayerName)];
      side.deckCount += side.handCount;
      side.handCount = 0;
      side.knownHand = [];
      return;
    }
    const drawBench = value.match(/^(.+?) drew (a|\d+) cards? and played them to the Bench$/i);
    if (drawBench) {
      const actor = playerActor(drawBench[1], selfPlayerName);
      names.forEach((name, cardIndex) => state[actor].bench.push(pokemonCard(`${eventId}-bench-${cardIndex}`, name)));
      state[actor].deckCount = Math.max(0, state[actor].deckCount - pluralCount(drawBench[2]));
      return;
    }

    const drawCount = value.match(/^(.+?) drew (a|\d+) cards?$/i);
    if (drawCount) {
      draw(state[playerActor(drawCount[1], selfPlayerName)], names, pluralCount(drawCount[2]));
      return;
    }
    const drawNamed = value.match(/^(.+?) drew (.+)$/i);
    if (drawNamed) {
      draw(state[playerActor(drawNamed[1], selfPlayerName)], [drawNamed[2]], 1);
      return;
    }
    const shuffled = value.match(/^(.+?) shuffled (a|\d+) cards? into their deck$/i);
    if (shuffled) {
      const side = state[playerActor(shuffled[1], selfPlayerName)];
      const count = pluralCount(shuffled[2]);
      names.forEach((name) => removeHand(side, name));
      if (!names.length) side.handCount = Math.max(0, side.handCount - count);
      side.deckCount += count;
      return;
    }
    const bottom = value.match(/^(.+?) put (a|\d+) cards? on the bottom of their deck$/i);
    if (bottom) {
      if (effectRule?.shuffleEntireAffectedHand) return;
      const side = state[playerActor(bottom[1], selfPlayerName)];
      const count = pluralCount(bottom[2]);
      side.handCount = Math.max(0, side.handCount - count);
      side.knownHand = [];
      side.deckCount += count;
      return;
    }
    const discardedFrom = value.match(/^(.+?) was discarded from (.+?)['’]s (.+)$/i);
    if (discardedFrom) {
      const retreatingId = stages.find((stage) => stage.kind === "move" && stage.label === "Out")?.cards[0]?.id;
      if (!retreatingId) return;
      discardAttachedCards(
        state[playerActor(discardedFrom[2], selfPlayerName)],
        discardedFrom[3],
        [discardedFrom[1]],
        eventId,
        retreatingId,
      );
      return;
    }
    const cardsDiscardedFrom = value.match(/^(?:a|\d+) cards? were discarded from (.+?)['’]s (.+)$/i);
    if (cardsDiscardedFrom) {
      const retreatingId = stages.find((stage) => stage.kind === "move" && stage.label === "Out")?.cards[0]?.id;
      if (!retreatingId) return;
      discardAttachedCards(
        state[playerActor(cardsDiscardedFrom[1], selfPlayerName)],
        cardsDiscardedFrom[2],
        names,
        eventId,
        retreatingId,
      );
      return;
    }
    const discarded = value.match(/^(.+?) discarded (a|\d+) cards?$/i);
    if (discarded) {
      const side = state[playerActor(discarded[1], selfPlayerName)];
      if (names.length) discard(side, names, eventId);
      else side.handCount = Math.max(0, side.handCount - pluralCount(discarded[2]));
      return;
    }
    const attached = value.match(/^(.+?) attached (Basic (.+?) Energy) to (.+?) (?:in|on) the (Active Spot|Bench)$/i);
    if (attached) {
      const actor = playerActor(attached[1], selfPlayerName);
      const target = findBoardCard(state[actor], attached[4]);
      if (target) {
        target.energy.push(attached[3]);
        const targetStage = stages.find((stage) =>
          stage.kind === "move"
          && stage.label === `To ${attached[4]}`
          && stage.cards[0]?.id === `detail-attach-target-${index}`
        );
        if (targetStage) targetStage.cards[0] = { ...targetStage.cards[0], id: target.id };
      }
      if (effectRule?.attachmentOrigin === "deck") {
        state[actor].deckCount = Math.max(0, state[actor].deckCount - 1);
      } else if (effectRule?.attachmentOrigin === "discard") {
        removeDiscard(state[actor], attached[2]);
      }
      return;
    }
    const moved = value.match(/^(.+?) moved (a|\d+) damage counters? from (?:.+?['’]s )?(.+?) to (?:.+?['’]s )?(.+)$/i);
    if (moved) {
      const actor = playerActor(moved[1], selfPlayerName);
      const damage = pluralCount(moved[2]) * 10;
      const from = locateBoardCard(state, moved[3], actor)?.card;
      const to = locateBoardCard(state, moved[4], actor)?.card;
      if (from) {
        from.damage = Math.max(0, from.damage - damage);
        const fromStage = stages.find((stage) => stage.cards[0]?.id === `move-from-${index}`);
        if (fromStage) fromStage.cards[0] = { ...fromStage.cards[0], id: from.id };
      }
      if (to) {
        to.damage += damage;
        const toStage = stages.find((stage) => stage.cards[0]?.id === `move-to-${index}`);
        if (toStage) toStage.cards[0] = { ...toStage.cards[0], id: to.id };
      }
      return;
    }
    const promotion = value.match(/^(.+?)['’]s (.+?) is now in the Active Spot$/i);
    if (promotion) promote(state[playerActor(promotion[1], selfPlayerName)], promotion[2]);
  });

  const counterRestrictedToDefendingBoard = effectRule?.counterTarget === "defending-board";
  const counterPreferred: ReplayActor = counterRestrictedToDefendingBoard
    ? action.actor === "self" ? "opponent" : "self"
    : action.actor;
  action.details.forEach((detail, detailIndex) => getDamageCounterPlacements([detail]).forEach((placement) => {
    const damage = placement.counters * 10;
    const targetStage = stages.find((stage) => stage.cards[0]?.id === `damage-${detailIndex}`);
    const target = locateDamageCounterTarget(
      state,
      placement.targetName,
      counterPreferred,
      damage,
      followingKnockouts,
      counterRestrictedToDefendingBoard,
    )?.card;
    if (target) {
      target.damage += damage;
      if (targetStage) targetStage.cards[0] = { ...targetStage.cards[0], id: target.id };
    } else if (targetStage) targetStage.targetResolved = false;
  }));
}

function buildEvent(
  action: ReplaySourceAction,
  selfPlayerName: string,
  opponentPlayerName: string,
  eventIndex: number,
  startsTurn: boolean,
  followingKnockouts: Set<string>,
): ReplayEvent {
  const eventId = `bex-${eventIndex}`;
  const stages = transactionStages(action, selfPlayerName);
  const summary = anonymisePlayers(
    formatBattleLogActionTitle(action.sourceTitle, { retainActor: false }) || action.sourceTitle,
    selfPlayerName,
    opponentPlayerName,
  );
  return {
    actor: action.actor,
    turn: action.turn,
    label: eventLabel(action.sourceTitle),
    sourceTitle: action.sourceTitle,
    sourceDetails: [...action.details],
    summary,
    transaction: stages.length ? ({ actor: action.actor, title: summary, stages } satisfies ReplayTransaction) : undefined,
    apply: (previous) => {
      const state = clone(previous);
      if (state.playedCard) {
        state[state.playedCard.actor].discard.unshift(state.playedCard.card);
        state.playedCard = null;
      }
      if (startsTurn) {
        allBoardCards(state[action.actor]).forEach((card) => { card.abilityUsed = false; });
        const previousActor: ReplayActor = action.actor === "self" ? "opponent" : "self";
        state[previousActor].itemLocked = false;
      }

      const title = action.sourceTitle;
      const playedBoard = title.match(/^(.+?) played (.+?) to the (Active Spot|Bench)\.$/i);
      const evolved = title.match(/^(.+?) evolved (.+?) to (.+?) (?:in|on) the (Active Spot|Bench)\.$/i);
      const attached = title.match(/^(.+?) attached (Basic (.+?) Energy) to (.+?) (?:in|on) the (Active Spot|Bench)\.$/i);
      const retreated = title.match(/^(.+?) retreated (.+?) to the Bench\.$/i);
      const attack = title.match(/^(.+?)['’]s (.+?) used (.+?) on (.+?)[’']s (.+?) for (\d+)\+? damage/i);
      const ability = title.match(/^(.+?)['’]s (.+?) used (.+?)\.$/i);
      const knockedOut = title.match(/^(.+?)['’]s (.+?) was Knocked Out!$/i);
      const drew = title.match(/^(.+?) drew (a card|.+?)\.$/i);
      const prize = title.match(/^(.+?) took (a|\d+) Prize cards?\.$/i);
      const stadium = title.match(/^(.+?) played (.+?) to the Stadium spot\.$/i);
      const conditionDamage = parseSpecialConditionDamage(title);

      if (playedBoard) {
        const actor = playerActor(playedBoard[1], selfPlayerName);
        const nextCard = pokemonCard(`${eventId}-${playedBoard[2]}`, playedBoard[2]);
        removeHand(state[actor], playedBoard[2]);
        if (playedBoard[3] === "Active Spot") state[actor].active = nextCard;
        else state[actor].bench.push(nextCard);
      } else if (evolved) {
        const actor = playerActor(evolved[1], selfPlayerName);
        const base = findBoardCard(state[actor], evolved[2]);
        if (base) {
          const beforeStage = stages.find((stage) => stage.kind === "before" && stage.cards[0]?.name === evolved[2]);
          const evolveStage = stages.find((stage) => stage.kind === "evolve" && stage.cards[0]?.name === evolved[3]);
          if (beforeStage) beforeStage.cards[0] = { ...beforeStage.cards[0], id: base.id };
          base.underlying.push(zoneCard(`${base.id}-under-${base.name}`, base.name));
          base.name = evolved[3];
          base.imageUrl = imageFor(evolved[3]);
          base.hp = references[evolved[3]]?.hp ?? base.hp;
          if (evolveStage) evolveStage.cards[0] = { ...evolveStage.cards[0], id: base.id };
        }
        removeHand(state[actor], evolved[3]);
      } else if (attached) {
        const actor = playerActor(attached[1], selfPlayerName);
        const target = findBoardCard(state[actor], attached[4]);
        if (target) target.energy.push(attached[3]);
        removeHand(state[actor], attached[2]);
      } else if (retreated) {
        const actor = playerActor(retreated[1], selfPlayerName);
        const side = state[actor];
        const promotion = action.details.map(clean).map((detail) => detail.match(/^.+?['’]s (.+?) is now in the Active Spot$/i)?.[1]).find(Boolean);
        const retreatingCard = findBoardCard(side, retreated[2]);
        const promotedCard = promotion ? findBoardCard(side, promotion) : undefined;
        const outStage = stages.find((stage) => stage.kind === "move" && stage.label === "Out");
        const inStage = stages.find((stage) => stage.kind === "move" && stage.label === "In");
        if (retreatingCard && outStage) outStage.cards[0] = { ...outStage.cards[0], id: retreatingCard.id };
        if (promotedCard && inStage) inStage.cards[0] = { ...inStage.cards[0], id: promotedCard.id };
        if (promotion) promote(side, promotion);
      } else if (attack) {
        const targetActor = playerActor(attack[4], selfPlayerName);
        const target = findBoardCard(state[targetActor], attack[5]);
        if (target) target.damage += Number(attack[6]);
        if (replayEffectRules[attack[3]]?.itemLock) state[targetActor].itemLocked = true;
      } else if (ability) {
        const actor = playerActor(ability[1], selfPlayerName);
        const source = findBoardCard(state[actor], ability[2], true);
        if (source) source.abilityUsed = true;
      } else if (knockedOut) {
        const actor = playerActor(knockedOut[1], selfPlayerName);
        const target = findBoardCard(state[actor], knockedOut[2]);
        const beforeStage = stages.find((stage) => stage.kind === "before");
        if (target && beforeStage) beforeStage.cards[0] = { ...beforeStage.cards[0], id: target.id };
        discardPokemon(state[actor], knockedOut[2], eventId);
      } else if (drew) {
        const actor = playerActor(drew[1], selfPlayerName);
        draw(state[actor], drew[2] === "a card" ? [] : [drew[2]], 1);
      } else if (prize) {
        const actor = playerActor(prize[1], selfPlayerName);
        const count = pluralCount(prize[2]);
        const names = action.details.flatMap((detail) => {
          const added = clean(detail).match(/^(.+?) was added to .+?['’]s hand$/i)?.[1];
          return added && added.toLowerCase() !== "a card" ? [added] : [];
        });
        state[actor].prizesRemaining = Math.max(0, state[actor].prizesRemaining - count);
        addToHand(state[actor], names, count, eventId);
      } else if (stadium) {
        const actor = playerActor(stadium[1], selfPlayerName);
        removeHand(state[actor], stadium[2]);
        state.stadium = { actor, name: stadium[2], imageUrl: imageFor(stadium[2]) };
      } else if (conditionDamage) {
        const actor = playerActor(conditionDamage.owner, selfPlayerName);
        const target = findBoardCard(state[actor], conditionDamage.targetName);
        if (target) {
          target.damage += conditionDamage.counters * 10;
          const damageStage = stages.find((stage) => stage.kind === "damage");
          if (damageStage) damageStage.cards[0] = { ...damageStage.cards[0], id: target.id };
        }
      } else {
        const candidate = extractBattleLogActionCardCandidate(title);
        if (candidate && /\bplayed\b/i.test(title)) {
          removeHand(state[action.actor], candidate);
          state.playedCard = { actor: action.actor, card: zoneCard(`${eventId}-played`, candidate) };
        }
      }

      if (/ended their turn/i.test(title)) state[action.actor].itemLocked = false;

      applyDetails(state, action, selfPlayerName, eventId, stages, followingKnockouts);
      (["self", "opponent"] as const).forEach((actor) => {
        const side = state[actor];
        if (side.knownHand.length > side.handCount) {
          side.knownHand = side.knownHand.slice(-side.handCount);
        }
      });
      return state;
    },
  };
}

export function compileReplayPilot(
  id: string,
  label: string,
  source: ReplayPilotSource,
  sections: LogSection[],
  selfPlayerName: string,
): ReplayPilot {
  const actions = flattenReplaySourceActions(sections, selfPlayerName);
  const opponentPlayerName = sections.find((section) => section.player && section.player !== selfPlayerName)?.player
    ?? Object.keys(sections[0]?.prizesAfterTurn ?? {}).find((name) => name !== selfPlayerName)
    ?? "Opponent";
  const firstTurnActions = new Set<number>();
  let lastKey = "";
  actions.forEach((action, index) => {
    const key = `${action.actor}-${action.turn}`;
    if (key !== lastKey && action.turn > 0) firstTurnActions.add(index);
    lastKey = key;
  });
  const events = actions.map((action, index) => {
    const followingKnockouts = new Set<string>();
    for (let nextIndex = index + 1; nextIndex < actions.length; nextIndex += 1) {
      const knockout = actions[nextIndex].sourceTitle.match(/^(.+?)['’]s (.+?) was Knocked Out!$/i);
      if (!knockout?.[1] || !knockout[2]) break;
      followingKnockouts.add(`${playerActor(knockout[1], selfPlayerName)}:${knockout[2]}`);
    }
    return buildEvent(
      action,
      selfPlayerName,
      opponentPlayerName,
      index,
      firstTurnActions.has(index),
      followingKnockouts,
    );
  });
  const openingDetails = sections[0]?.actions.flatMap((action) => action.details) ?? [];
  const knownOpening = openingDetails.find((detail) => detail.trim().startsWith("•"));
  const openingCards = knownOpening ? parseCardNames(clean(knownOpening)) : [];
  const initial: ReplayState = {
    self: { name: source.selfDeck, active: null, bench: [], deckCount: 47, handCount: 7, knownHand: openingCards.map((name, index) => zoneCard(`opening-${index}`, name)), discard: [], prizesRemaining: 6 },
    opponent: { name: source.opponentDeck, active: null, bench: [], deckCount: 47, handCount: 7, knownHand: [], discard: [], prizesRemaining: 6 },
    stadium: null,
    playedCard: null,
  };
  const frames = events.reduce<ReplayState[]>((all, nextEvent) => [...all, applyReplayConditions(all.at(-1)!, nextEvent.apply(all.at(-1)!), nextEvent, selfPlayerName)], [initial]);
  const unresolvedMutations = actions.filter((action) =>
    !/(?:drew|played|attached|retreated|evolved|used|Knocked Out|took .+ Prize|ended|wins|activated|decided|coin flip)/i.test(action.sourceTitle),
  ).length;
  return { id, label, source, events, frames, diagnostics: { evidencedActions: events.length, unresolvedMutations } };
}
