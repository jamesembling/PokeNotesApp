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
  "Basic Darkness Energy": { set: "SVE", number: "7" },
  "Basic Fire Energy": { set: "SVE", number: "2" },
  "Basic Psychic Energy": { set: "SVE", number: "5" },
  "Blaziken ex": { set: "JTG", number: "24", hp: 320 },
  "Boss's Orders": { set: "ASC", number: "183" },
  "Buddy-Buddy Poffin": { set: "MEG", number: "167" },
  Budew: { set: "ASC", number: "16", hp: 30 },
  Combusken: { set: "JTG", number: "23", hp: 90 },
  Crispin: { set: "SCR", number: "133" },
  Dawn: { set: "PFL", number: "87" },
  Dragapult: { set: "TWM", number: "130", hp: 320 },
  "Dragapult ex": { set: "TWM", number: "130", hp: 320 },
  Drakloak: { set: "TWM", number: "129", hp: 90 },
  Dreepy: { set: "TWM", number: "128", hp: 70 },
  "Fezandipiti ex": { set: "ASC", number: "142", hp: 210 },
  "Lillie's Clefairy ex": { set: "JTG", number: "56", hp: 190 },
  "Lillie's Determination": { set: "ASC", number: "192" },
  Judge: { set: "POR", number: "76" },
  Meowth: { set: "POR", number: "62", hp: 200 },
  "Meowth ex": { set: "POR", number: "62", hp: 200 },
  Moltres: { set: "PFL", number: "14", hp: 120 },
  Munkidori: { set: "TWM", number: "95", hp: 110 },
  "Night Stretcher": { set: "ASC", number: "196" },
  "Poké Pad": { set: "POR", number: "81" },
  Psyduck: { set: "ASC", number: "226", hp: 70 },
  "Rare Candy": { set: "MEG", number: "125" },
  "Risky Ruins": { set: "MEG", number: "127" },
  "Special Red Card": { set: "CRI", number: "82" },
  "Team Rocket's Petrel": { set: "DRI", number: "176" },
  Torchic: { set: "JTG", number: "22", hp: 60 },
  "Ultra Ball": { set: "ASC", number: "213" },
  "Unfair Stamp": { set: "TWM", number: "165" },
};

const imageFor = (name: string) => {
  const reference = references[name];
  return reference
    ? buildDeckListCardImageUrl(reference.set, reference.number, "SM")
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
const attackEffects: Record<string, { itemLock?: boolean }> = {
  "Itchy Pollen": { itemLock: true },
};

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
) {
  const fallback: ReplayActor = preferred === "self" ? "opponent" : "self";
  const candidates = ([preferred, fallback] as const).flatMap((actor) =>
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

function transactionStages(action: ReplaySourceAction, selfPlayerName: string): ReplayTransactionStage[] {
  const stages: ReplayTransactionStage[] = [];
  const stadiumCandidate = action.sourceTitle.match(/\bplayed (.+?) to the Stadium spot\.$/i)?.[1];
  const candidate = stadiumCandidate ?? extractBattleLogActionCardCandidate(action.sourceTitle);
  if (candidate && /\bplayed\b/i.test(action.sourceTitle) && !/\b(?:Active Spot|Bench)\b/i.test(action.sourceTitle)) {
    stages.push({ kind: "play", label: "Play", cards: [zoneCard(`overlay-${action.legacyIndex ?? action.sourceTitle}`, candidate)] });
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
    else if (/shuffled? (?:a|\d+) cards?/i.test(value)) stages.push({ kind: "shuffle", label: "Shuffle", cards, hiddenCount: cards.length ? undefined : Number(value.match(/\d+/)?.[0] ?? 1) });
    else if (/drew \d+ cards? and played them to the Bench/i.test(value)) stages.push({ kind: "bench", label: "Bench", cards });
    else if (/drew (?:a|\d+) cards?/i.test(value)) stages.push({ kind: "draw", label: "Draw", cards, hiddenCount: cards.length ? undefined : pluralCount(value.match(/drew (a|\d+)/i)?.[1] ?? "1") });
    else if (/drew .+/i.test(value)) stages.push({ kind: "draw", label: "Draw", cards: [zoneCard(`detail-draw-${index}`, value.replace(/^.+? drew /i, ""))] });
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
  return stages;
}

function applyDetails(
  state: ReplayState,
  action: ReplaySourceAction,
  selfPlayerName: string,
  eventId: string,
  stages: ReplayTransactionStage[],
  followingKnockouts: Set<string>,
) {
  action.details.forEach((detail, index) => {
    const value = clean(detail);
    if (/opening hand/i.test(value) || /^\d+ drawn cards?$/i.test(value)) return;
    const names = listAfter(action.details, index);
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
      const side = state[playerActor(bottom[1], selfPlayerName)];
      const count = pluralCount(bottom[2]);
      side.handCount = Math.max(0, side.handCount - count);
      side.knownHand = [];
      side.deckCount += count;
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

  const counterPreferred: ReplayActor = /\bused .+ on .+ for \d+/i.test(action.sourceTitle)
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
          base.underlying.push(zoneCard(`${base.id}-under-${base.name}`, base.name));
          base.name = evolved[3];
          base.imageUrl = imageFor(evolved[3]);
          base.hp = references[evolved[3]]?.hp ?? base.hp;
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
        if (promotion) promote(side, promotion);
      } else if (attack) {
        const targetActor = playerActor(attack[4], selfPlayerName);
        const target = findBoardCard(state[targetActor], attack[5]);
        if (target) target.damage += Number(attack[6]);
        if (attackEffects[attack[3]]?.itemLock) state[targetActor].itemLocked = true;
      } else if (ability) {
        const actor = playerActor(ability[1], selfPlayerName);
        const source = findBoardCard(state[actor], ability[2], true);
        if (source) source.abilityUsed = true;
      } else if (knockedOut) {
        discardPokemon(state[playerActor(knockedOut[1], selfPlayerName)], knockedOut[2], eventId);
      } else if (drew) {
        const actor = playerActor(drew[1], selfPlayerName);
        draw(state[actor], drew[2] === "a card" ? [] : [drew[2]], 1);
      } else if (prize) {
        const actor = playerActor(prize[1], selfPlayerName);
        const count = pluralCount(prize[2]);
        state[actor].prizesRemaining = Math.max(0, state[actor].prizesRemaining - count);
      } else if (stadium) {
        const actor = playerActor(stadium[1], selfPlayerName);
        removeHand(state[actor], stadium[2]);
        state.stadium = { actor, name: stadium[2], imageUrl: imageFor(stadium[2]) };
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
  const frames = events.reduce<ReplayState[]>((all, nextEvent) => [...all, nextEvent.apply(all.at(-1)!)], [initial]);
  const unresolvedMutations = actions.filter((action) =>
    !/(?:drew|played|attached|retreated|evolved|used|Knocked Out|took .+ Prize|ended|wins|activated|decided|coin flip)/i.test(action.sourceTitle),
  ).length;
  return { id, label, source, events, frames, diagnostics: { evidencedActions: events.length, unresolvedMutations } };
}
