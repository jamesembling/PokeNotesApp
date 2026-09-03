import { buildDeckListCardImageUrl } from "@/lib/deck-lists/render";

export type ReplayActor = "self" | "opponent";
type HandCard = { id: string; name: string; imageUrl?: string };

export type ReplayZoneCard = {
  id: string;
  name: string;
  imageUrl?: string;
};

export type ReplayCard = {
  id: string;
  name: string;
  imageUrl: string;
  hp: number;
  damage: number;
  energy: string[];
  underlying: ReplayZoneCard[];
  tool?: string;
};

export type ReplaySide = {
  name: string;
  active: ReplayCard | null;
  bench: ReplayCard[];
  deckCount: number;
  handCount: number;
  knownHand: HandCard[];
  discard: ReplayZoneCard[];
  prizesRemaining: number;
};

export type ReplayState = {
  self: ReplaySide;
  opponent: ReplaySide;
  stadium: { name: string; imageUrl: string; actor: ReplayActor } | null;
};

export type ReplayEvent = {
  actor: ReplayActor;
  label: string;
  summary: string;
  turn: number;
  apply: (state: ReplayState) => ReplayState;
};

export const replaySource = {
  logId: "6ddfba49-7d8d-45b4-8230-cdbf84886275",
  playedOn: "3 September 2026",
  format: "TEF-PBL",
  result: "Win",
  selfDeck: "Dragapult / Blaziken",
  opponentDeck: "Mega Lucario / Hariyama",
  selfPrizesTaken: 6,
  opponentPrizesTaken: 3,
  turns: 6,
} as const;

const image = (set: string, number: string) =>
  buildDeckListCardImageUrl(set, number, "SM");
const images = {
  munkidori: image("TWM", "95"),
  dreepy: image("TWM", "128"),
  drakloak: image("TWM", "129"),
  dragapult: image("TWM", "130"),
  torchic: image("JTG", "22"),
  blaziken: image("JTG", "24"),
  meowth: image("POR", "62"),
  solrock: image("MEG", "75"),
  lunatone: image("MEG", "74"),
  riolu: image("MEG", "76"),
  lucario: image("MEG", "77"),
  makuhita: image("MEG", "72"),
  hariyama: image("MEG", "73"),
  gravityMountain: image("SSP", "177"),
  poffin: image("MEG", "167"),
  darkness: image("SVE", "7"),
  psychic: image("SVE", "5"),
  fire: image("SVE", "2"),
  fighting: image("SVE", "6"),
  crispin: image("SCR", "133"),
  ultraBall: image("ASC", "213"),
  boss: image("ASC", "183"),
  primeCatcher: image("PRE", "119"),
  premiumPowerPro: image("ASC", "199"),
  fightingGong: image("ASC", "187"),
  pokePad: image("POR", "81"),
  lillie: image("ASC", "192"),
  specialRedCard: image("CRI", "82"),
  switch: image("PBL", "107"),
  wally: image("MEG", "132"),
  nightStretcher: image("ASC", "196"),
  carmine: image("PRE", "103"),
  rareCandy: image("MEG", "125"),
  judge: image("POR", "76"),
  areaZero: image("PRE", "94"),
  fezandipiti: image("ASC", "142"),
};

export const replayEnergyImages: Record<string, string> = {
  Darkness: images.darkness,
  Fighting: images.fighting,
  Fire: images.fire,
  Psychic: images.psychic,
};

const card = (
  id: string,
  name: string,
  imageUrl: string,
  hp: number,
): ReplayCard => ({
  id,
  name,
  imageUrl,
  hp,
  damage: 0,
  energy: [],
  underlying: [],
});
const hand = (id: string, name: string, imageUrl?: string): HandCard => ({
  id,
  name,
  imageUrl,
});
const zoneCard = (
  id: string,
  name: string,
  imageUrl?: string,
): ReplayZoneCard => ({ id, name, imageUrl });
const clone = (state: ReplayState): ReplayState => structuredClone(state);
const event = (
  actor: ReplayActor,
  turn: number,
  label: string,
  summary: string,
  mutate: (state: ReplayState) => void,
): ReplayEvent => ({
  actor,
  turn,
  label,
  summary,
  apply: (state) => {
    const next = clone(state);
    mutate(next);
    return next;
  },
});
const removeHand = (side: ReplaySide, name: string) => {
  const index = side.knownHand.findIndex((item) => item.name === name);
  if (index >= 0) side.knownHand.splice(index, 1);
  side.handCount = Math.max(0, side.handCount - 1);
};
const setHand = (side: ReplaySide, cards: HandCard[]) => {
  side.knownHand = cards;
  side.handCount = cards.length;
};
const find = (side: ReplaySide, name: string) =>
  side.bench.find((item) => item.name === name);
const evolve = (
  base: ReplayCard,
  name: string,
  imageUrl: string,
  hp: number,
): ReplayCard => ({
  ...card(base.id, name, imageUrl, hp),
  damage: base.damage,
  energy: base.energy,
  underlying: [
    ...base.underlying,
    zoneCard(`${base.id}-${base.name}`, base.name, base.imageUrl),
  ],
});
const discardCards = (side: ReplaySide, ...cards: ReplayZoneCard[]) => {
  side.discard.unshift(...[...cards].reverse());
};
const removeDiscard = (side: ReplaySide, name: string) => {
  const index = side.discard.findIndex((item) => item.name === name);
  if (index >= 0) side.discard.splice(index, 1);
};
const discardActive = (side: ReplaySide) => {
  if (!side.active) return;
  const active = side.active;
  discardCards(
    side,
    ...active.underlying,
    ...active.energy.map((energy, index) =>
      zoneCard(
        `${active.id}-energy-${energy}-${index}`,
        `Basic ${energy} Energy`,
        replayEnergyImages[energy],
      ),
    ),
    zoneCard(`${active.id}-top`, active.name, active.imageUrl),
  );
  side.active = null;
};
const promote = (side: ReplaySide, name: string) => {
  const index = side.bench.findIndex((item) => item.name === name);
  if (index < 0) return;
  const [promoted] = side.bench.splice(index, 1);
  side.active = promoted;
};

export const initialReplayState: ReplayState = {
  self: {
    name: replaySource.selfDeck,
    active: null,
    bench: [],
    deckCount: 47,
    handCount: 7,
    knownHand: [
      hand("open-crispin", "Crispin", images.crispin),
      hand("open-poffin", "Buddy-Buddy Poffin", images.poffin),
      hand("open-munkidori", "Munkidori", images.munkidori),
      hand("open-area-zero", "Area Zero Underdepths", images.areaZero),
      hand("open-blaziken", "Blaziken ex", images.blaziken),
      hand("open-fezandipiti", "Fezandipiti ex", images.fezandipiti),
      hand("open-drakloak", "Drakloak", images.drakloak),
    ],
    discard: [],
    prizesRemaining: 6,
  },
  opponent: {
    name: replaySource.opponentDeck,
    active: null,
    bench: [],
    deckCount: 47,
    handCount: 7,
    knownHand: [],
    discard: [],
    prizesRemaining: 6,
  },
  stadium: null,
};

export const replayEvents: ReplayEvent[] = [
  event("self", 0, "Setup", "You placed Munkidori in the Active Spot.", (s) => {
    s.self.active = card("self-munkidori", "Munkidori", images.munkidori, 110);
    removeHand(s.self, "Munkidori");
  }),
  event(
    "opponent",
    0,
    "Setup",
    "The opponent placed Solrock Active and two Riolu on the Bench.",
    (s) => {
      s.opponent.active = card("opp-solrock-a", "Solrock", images.solrock, 90);
      s.opponent.bench = [
        card("opp-riolu-a", "Riolu", images.riolu, 70),
        card("opp-riolu-b", "Riolu", images.riolu, 70),
      ];
      s.opponent.handCount -= 3;
    },
  ),
  event(
    "opponent",
    1,
    "Bench",
    "Ultra Ball found Lunatone, which the opponent played to the Bench.",
    (s) => {
      s.opponent.bench.push(
        card("opp-lunatone", "Lunatone", images.lunatone, 90),
      );
      s.opponent.handCount = 2;
      s.opponent.deckCount = 45;
      discardCards(
        s.opponent,
        zoneCard("opp-t1-boss", "Boss's Orders", images.boss),
        zoneCard("opp-t1-prime", "Prime Catcher", images.primeCatcher),
        zoneCard("opp-t1-ultra", "Ultra Ball", images.ultraBall),
      );
    },
  ),
  event("self", 1, "Draw", "You drew Basic Psychic Energy.", (s) => {
    s.self.knownHand.push(
      hand("turn-one-psychic", "Basic Psychic Energy", images.psychic),
    );
    s.self.handCount += 1;
    s.self.deckCount = 46;
  }),
  event(
    "self",
    1,
    "Bench",
    "Buddy-Buddy Poffin put two Dreepy onto your Bench.",
    (s) => {
      s.self.bench.push(
        card("self-dreepy-a", "Dreepy", images.dreepy, 70),
        card("self-dreepy-b", "Dreepy", images.dreepy, 70),
      );
      removeHand(s.self, "Buddy-Buddy Poffin");
      s.self.deckCount = 44;
      discardCards(
        s.self,
        zoneCard("self-t1-poffin", "Buddy-Buddy Poffin", images.poffin),
      );
    },
  ),
  event(
    "self",
    1,
    "Energy",
    "Crispin attached Fire Energy to Dreepy, then Darkness Energy was attached to Munkidori.",
    (s) => {
      find(s.self, "Dreepy")?.energy.push("Fire");
      s.self.active?.energy.push("Darkness");
      removeHand(s.self, "Crispin");
      s.self.deckCount = 42;
      discardCards(
        s.self,
        zoneCard("self-t1-crispin", "Crispin", images.crispin),
      );
    },
  ),
  event(
    "opponent",
    2,
    "Evolve",
    "The opponent evolved a Benched Riolu into Mega Lucario ex.",
    (s) => {
      const index = s.opponent.bench.findIndex((item) => item.name === "Riolu");
      if (index >= 0)
        s.opponent.bench[index] = evolve(
          s.opponent.bench[index],
          "Mega Lucario ex",
          images.lucario,
          340,
        );
      s.opponent.deckCount = 44;
      s.opponent.handCount = 2;
    },
  ),
  event(
    "opponent",
    2,
    "Judge",
    "Judge shuffled your 5-card hand into the deck and gave you 4 new cards.",
    (s) => {
      setHand(s.self, [
        hand("judge-drakloak", "Drakloak", images.drakloak),
        hand("judge-poke-pad", "Poké Pad"),
        hand("judge-meowth", "Meowth ex", images.meowth),
        hand("judge-torchic", "Torchic", images.torchic),
      ]);
      s.self.deckCount = 43;
      s.opponent.deckCount = 41;
      s.opponent.handCount = 4;
      discardCards(
        s.opponent,
        zoneCard("opp-t2-judge", "Judge", images.judge),
      );
    },
  ),
  event(
    "opponent",
    2,
    "Attack",
    "Solrock used Cosmic Beam for 100 damage on Munkidori.",
    (s) => {
      if (s.self.active) s.self.active.damage += 100;
      s.opponent.deckCount = 36;
      s.opponent.handCount = 3;
      s.opponent.bench.push(
        card("opp-makuhita", "Makuhita", images.makuhita, 80),
      );
      s.opponent.active?.energy.push("Fighting");
      discardCards(
        s.opponent,
        zoneCard(
          "opp-t2-premium",
          "Premium Power Pro",
          images.premiumPowerPro,
        ),
        zoneCard("opp-t2-gong", "Fighting Gong", images.fightingGong),
        zoneCard(
          "opp-t2-fighting",
          "Basic Fighting Energy",
          images.fighting,
        ),
        zoneCard("opp-t2-poke-pad", "Poké Pad", images.pokePad),
      );
    },
  ),
  event(
    "self",
    2,
    "Develop",
    "You built two Drakloak, Benched Torchic, Meowth ex and a third Dreepy, then refreshed your hand with Lillie's Determination.",
    (s) => {
      s.self.bench.push(card("self-torchic", "Torchic", images.torchic, 60));
      s.self.bench = s.self.bench.map((item) =>
        item.name === "Dreepy"
          ? evolve(item, "Drakloak", images.drakloak, 90)
          : item,
      );
      s.self.bench.push(card("self-meowth", "Meowth ex", images.meowth, 170));
      s.self.bench.push(card("self-dreepy-c", "Dreepy", images.dreepy, 70));
      s.self.active?.energy.push("Psychic");
      setHand(s.self, [
        hand("turn-two-stretcher", "Night Stretcher"),
        hand("turn-two-dragapult", "Dragapult ex", images.dragapult),
        hand("turn-two-candy", "Rare Candy"),
        hand("turn-two-boss", "Boss's Orders"),
        hand("turn-two-dawn", "Dawn"),
        hand("turn-two-blaziken", "Blaziken ex", images.blaziken),
      ]);
      s.self.deckCount = 30;
      discardCards(
        s.self,
        zoneCard("self-t2-poke-pad", "Poké Pad", images.pokePad),
        zoneCard(
          "self-t2-lillie",
          "Lillie's Determination",
          images.lillie,
        ),
        zoneCard(
          "self-t2-psychic",
          "Basic Psychic Energy",
          images.psychic,
        ),
        zoneCard(
          "self-t2-special-red",
          "Special Red Card",
          images.specialRedCard,
        ),
        zoneCard("self-t2-ultra", "Ultra Ball", images.ultraBall),
      );
    },
  ),
  event(
    "self",
    2,
    "Ability",
    "Munkidori moved 30 damage from itself to Mega Lucario ex.",
    (s) => {
      if (s.self.active) s.self.active.damage -= 30;
      const lucario = find(s.opponent, "Mega Lucario ex");
      if (lucario) lucario.damage += 30;
    },
  ),
  event(
    "self",
    2,
    "Attack",
    "Munkidori used Mind Bend for 60 damage on Solrock.",
    (s) => {
      if (s.opponent.active) s.opponent.active.damage += 60;
    },
  ),
  event(
    "opponent",
    3,
    "Stadium",
    "The opponent played Gravity Mountain beside their Active Pokémon.",
    (s) => {
      s.opponent.bench.push(
        card("opp-solrock-b", "Solrock", images.solrock, 90),
      );
      s.opponent.deckCount = 28;
      s.opponent.handCount = 7;
      discardCards(
        s.opponent,
        zoneCard("opp-t3-poke-pad", "Poké Pad", images.pokePad),
        zoneCard(
          "opp-t3-lillie",
          "Lillie's Determination",
          images.lillie,
        ),
      );
      s.stadium = {
        name: "Gravity Mountain",
        imageUrl: images.gravityMountain,
        actor: "opponent",
      };
    },
  ),
  event(
    "opponent",
    3,
    "Switch",
    "The opponent switched to a fresh Solrock and attached Fighting Energy.",
    (s) => {
      const oldActive = s.opponent.active;
      promote(s.opponent, "Solrock");
      if (oldActive) s.opponent.bench.push(oldActive);
      s.opponent.active?.energy.push("Fighting");
      s.opponent.deckCount = 25;
      s.opponent.handCount = 7;
      discardCards(
        s.opponent,
        zoneCard(
          "opp-t3-fighting",
          "Basic Fighting Energy",
          images.fighting,
        ),
        zoneCard("opp-t3-switch", "Switch", images.switch),
      );
    },
  ),
  event(
    "opponent",
    3,
    "Knock Out",
    "Solrock used Cosmic Beam for 70 damage. Munkidori was Knocked Out and the opponent took a Prize.",
    (s) => {
      if (s.self.active) s.self.active.damage += 70;
      discardActive(s.self);
      promote(s.self, "Drakloak");
      s.opponent.prizesRemaining -= 1;
      s.opponent.handCount = 8;
    },
  ),
  event(
    "self",
    3,
    "Evolve",
    "Rare Candy evolved Torchic into Blaziken ex. Seething Spirit attached Psychic Energy to your Active Drakloak, and your board developed another Drakloak.",
    (s) => {
      s.self.bench = s.self.bench.map((item) =>
        item.name === "Torchic"
          ? evolve(item, "Blaziken ex", images.blaziken, 320)
          : item,
      );
      const dreepy = find(s.self, "Dreepy");
      if (dreepy)
        Object.assign(dreepy, evolve(dreepy, "Drakloak", images.drakloak, 90));
      s.self.active?.energy.push("Psychic");
      removeDiscard(s.self, "Basic Psychic Energy");
      s.self.deckCount = 24;
      setHand(s.self, [
        hand("turn-three-stretcher", "Night Stretcher", images.nightStretcher),
        hand("turn-three-dragapult", "Dragapult ex", images.dragapult),
        hand("turn-three-boss", "Boss's Orders", images.boss),
        hand("turn-three-dawn", "Dawn"),
        hand("turn-three-darkness", "Basic Darkness Energy", images.darkness),
        hand("turn-three-ultra-ball", "Ultra Ball", images.ultraBall),
      ]);
      discardCards(
        s.self,
        zoneCard("self-t3-rare-candy", "Rare Candy", images.rareCandy),
        zoneCard("self-t3-poke-pad", "Poké Pad", images.pokePad),
        zoneCard(
          "self-t3-poffin",
          "Buddy-Buddy Poffin",
          images.poffin,
        ),
      );
    },
  ),
  event(
    "self",
    3,
    "Evolve",
    "You evolved the Active Drakloak into Dragapult ex.",
    (s) => {
      if (s.self.active)
        s.self.active = evolve(
          s.self.active,
          "Dragapult ex",
          images.dragapult,
          320,
        );
      removeHand(s.self, "Dragapult ex");
    },
  ),
  event(
    "self",
    3,
    "Boss's Orders",
    "Boss's Orders brought Mega Lucario ex into the Active Spot.",
    (s) => {
      const oldActive = s.opponent.active;
      promote(s.opponent, "Mega Lucario ex");
      if (oldActive) s.opponent.bench.push(oldActive);
      setHand(s.self, [
        hand("turn-three-stretcher", "Night Stretcher", images.nightStretcher),
        hand("turn-three-dawn", "Dawn"),
        hand("turn-three-darkness", "Basic Darkness Energy", images.darkness),
        hand("turn-three-ultra-ball", "Ultra Ball", images.ultraBall),
      ]);
      discardCards(
        s.self,
        zoneCard("self-t3-boss", "Boss's Orders", images.boss),
      );
    },
  ),
  event(
    "self",
    3,
    "Attack",
    "Dragapult ex used Phantom Dive for 200 damage and placed 60 damage on a Benched Riolu.",
    (s) => {
      if (s.opponent.active) s.opponent.active.damage += 200;
      const riolu = find(s.opponent, "Riolu");
      if (riolu) riolu.damage += 60;
    },
  ),
  event(
    "opponent",
    4,
    "Counterattack",
    "Hariyama pulled Meowth ex Active. Mega Lucario ex used Aura Jab for 320 damage.",
    (s) => {
      setHand(s.self, [
        hand("judge-two-fire", "Basic Fire Energy", images.fire),
        hand("judge-two-stretcher", "Night Stretcher"),
        hand("judge-two-darkness", "Basic Darkness Energy", images.darkness),
        hand("judge-two-torchic", "Torchic", images.torchic),
      ]);
      const rioluIndex = s.opponent.bench.findIndex(
        (item) => item.name === "Riolu",
      );
      if (rioluIndex >= 0)
        s.opponent.bench[rioluIndex] = evolve(
          s.opponent.bench[rioluIndex],
          "Mega Lucario ex",
          images.lucario,
          340,
        );
      const makuhita =
        find(s.opponent, "Makuhita") ??
        card("opp-hariyama", "Hariyama", images.hariyama, 140);
      if (!find(s.opponent, "Hariyama"))
        s.opponent.bench.push(
          evolve(makuhita, "Hariyama", images.hariyama, 140),
        );
      const benchedLucario = s.opponent.bench.find(
        (item) => item.name === "Mega Lucario ex",
      );
      if (benchedLucario) benchedLucario.energy.push("Fighting", "Fighting");
      find(s.opponent, "Hariyama")?.energy.push("Fighting");
      s.opponent.active?.energy.push("Fighting");
      s.opponent.deckCount = 19;
      s.opponent.handCount = 4;
      s.self.deckCount = 24;
      discardCards(
        s.opponent,
        zoneCard(
          "opp-t4-fighting",
          "Basic Fighting Energy",
          images.fighting,
        ),
        zoneCard(
          "opp-t4-premium",
          "Premium Power Pro",
          images.premiumPowerPro,
        ),
        zoneCard("opp-t4-judge", "Judge", images.judge),
      );
      if (s.self.active) s.self.bench.push(s.self.active);
      promote(s.self, "Meowth ex");
      if (s.self.active) s.self.active.damage += 320;
    },
  ),
  event(
    "opponent",
    4,
    "Knock Out",
    "Meowth ex was Knocked Out. The opponent took 2 Prize cards and Dragapult ex returned Active.",
    (s) => {
      discardActive(s.self);
      promote(s.self, "Dragapult ex");
      s.opponent.prizesRemaining -= 2;
      s.opponent.handCount = 6;
    },
  ),
  event(
    "self",
    4,
    "Knock Out",
    "Dragapult ex used Phantom Dive for 200 damage. Mega Lucario ex was Knocked Out and you took 3 Prizes.",
    (s) => {
      if (s.opponent.active) s.opponent.active.damage += 200;
      discardActive(s.opponent);
      promote(s.opponent, "Solrock");
      s.self.prizesRemaining -= 3;
      s.self.deckCount = 21;
      setHand(s.self, [
        hand("turn-four-stretcher", "Night Stretcher", images.nightStretcher),
        hand("turn-four-darkness", "Basic Darkness Energy", images.darkness),
        hand("turn-four-torchic", "Torchic", images.torchic),
        hand("turn-four-dragapult", "Dragapult ex", images.dragapult),
        hand("turn-four-ultra-ball", "Ultra Ball", images.ultraBall),
        hand("turn-four-poffin", "Buddy-Buddy Poffin", images.poffin),
        hand("prize-unfair-stamp", "Unfair Stamp"),
        hand("prize-crispin", "Crispin", images.crispin),
        hand("prize-fire", "Basic Fire Energy", images.fire),
      ]);
    },
  ),
  event(
    "opponent",
    5,
    "Attack",
    "Solrock used Cosmic Beam for 100 damage on Dragapult ex.",
    (s) => {
      const lucario = find(s.opponent, "Mega Lucario ex");
      if (lucario) {
        lucario.damage = Math.max(0, lucario.damage - 120);
        lucario.energy = [];
      }
      s.opponent.bench.push(card("opp-riolu-c", "Riolu", images.riolu, 70));
      find(s.opponent, "Hariyama")?.energy.push("Fighting");
      if (s.self.active) s.self.active.damage += 100;
      s.opponent.deckCount = 15;
      s.opponent.handCount = 7;
      discardCards(
        s.opponent,
        zoneCard(
          "opp-t5-fighting",
          "Basic Fighting Energy",
          images.fighting,
        ),
        zoneCard(
          "opp-t5-wally",
          "Wally's Compassion",
          images.wally,
        ),
        zoneCard(
          "opp-t5-premium",
          "Premium Power Pro",
          images.premiumPowerPro,
        ),
      );
    },
  ),
  event(
    "self",
    5,
    "Ability",
    "Munkidori returned from the discard and moved 30 damage from Dragapult ex to Riolu.",
    (s) => {
      s.self.bench.push(
        card("self-munkidori-returned", "Munkidori", images.munkidori, 110),
      );
      removeDiscard(s.self, "Munkidori");
      removeDiscard(s.self, "Basic Darkness Energy");
      s.self.deckCount = 17;
      setHand(s.self, [
        hand("turn-five-dragapult", "Dragapult ex", images.dragapult),
        hand("turn-five-unfair-stamp", "Unfair Stamp"),
        hand("turn-five-crispin", "Crispin", images.crispin),
        hand("turn-five-fire", "Basic Fire Energy", images.fire),
        hand("turn-five-blaziken", "Blaziken ex", images.blaziken),
        hand("turn-five-combusken", "Combusken"),
        hand("turn-five-moltres", "Moltres"),
        hand("turn-five-boss", "Boss's Orders", images.boss),
      ]);
      discardCards(
        s.self,
        zoneCard(
          "self-t5-poffin",
          "Buddy-Buddy Poffin",
          images.poffin,
        ),
        zoneCard("self-t5-torchic", "Torchic", images.torchic),
        zoneCard("self-t5-ultra", "Ultra Ball", images.ultraBall),
        zoneCard(
          "self-t5-stretcher",
          "Night Stretcher",
          images.nightStretcher,
        ),
      );
      if (s.self.active) s.self.active.damage -= 30;
      const riolu = find(s.opponent, "Riolu");
      if (riolu) riolu.damage += 30;
    },
  ),
  event(
    "self",
    5,
    "Double Knock Out",
    "Phantom Dive Knocked Out Hariyama and the damaged Riolu. You took 2 Prize cards.",
    (s) => {
      const oldActive = s.opponent.active;
      promote(s.opponent, "Hariyama");
      if (oldActive) s.opponent.bench.push(oldActive);
      discardActive(s.opponent);
      s.opponent.bench = s.opponent.bench.filter(
        (item) => item.name !== "Riolu",
      );
      discardCards(
        s.opponent,
        zoneCard("opp-t5-riolu", "Riolu", images.riolu),
      );
      promote(s.opponent, "Mega Lucario ex");
      s.self.prizesRemaining -= 2;
      discardCards(
        s.self,
        zoneCard("self-t5-boss", "Boss's Orders", images.boss),
      );
      setHand(s.self, [
        hand("turn-five-dragapult", "Dragapult ex", images.dragapult),
        hand("turn-five-unfair-stamp", "Unfair Stamp"),
        hand("turn-five-crispin", "Crispin", images.crispin),
        hand("turn-five-fire", "Basic Fire Energy", images.fire),
        hand("turn-five-blaziken", "Blaziken ex", images.blaziken),
        hand("turn-five-combusken", "Combusken"),
        hand("turn-five-moltres", "Moltres"),
        hand("prize-boss", "Boss's Orders", images.boss),
        hand("prize-drakloak", "Drakloak", images.drakloak),
      ]);
    },
  ),
  event(
    "opponent",
    6,
    "Attack",
    "Mega Lucario ex used Aura Jab for 130 damage on Dragapult ex.",
    (s) => {
      s.opponent.bench.push(
        card("opp-meowth", "Meowth ex", images.meowth, 170),
      );
      s.opponent.active?.energy.push("Fighting");
      const solrock = find(s.opponent, "Solrock");
      if (solrock) solrock.energy.push("Fighting");
      const lunatone = find(s.opponent, "Lunatone");
      if (lunatone) lunatone.energy.push("Fighting", "Fighting");
      s.opponent.deckCount = 0;
      s.opponent.handCount = 7;
      discardCards(
        s.opponent,
        zoneCard("opp-t6-boss", "Boss's Orders", images.boss),
        zoneCard("opp-t6-makuhita", "Makuhita", images.makuhita),
        zoneCard(
          "opp-t6-lillie",
          "Lillie's Determination",
          images.lillie,
        ),
        zoneCard("opp-t6-ultra", "Ultra Ball", images.ultraBall),
        zoneCard("opp-t6-lucario", "Mega Lucario ex", images.lucario),
        zoneCard("opp-t6-judge", "Judge", images.judge),
        zoneCard("opp-t6-carmine", "Carmine", images.carmine),
        zoneCard("opp-t6-gong-a", "Fighting Gong", images.fightingGong),
        zoneCard(
          "opp-t6-fighting",
          "Basic Fighting Energy",
          images.fighting,
        ),
        zoneCard("opp-t6-gong-b", "Fighting Gong", images.fightingGong),
      );
      if (s.self.active) s.self.active.damage += 130;
    },
  ),
  event(
    "self",
    6,
    "Final attack",
    "Boss's Orders brought Meowth ex Active. Phantom Dive Knocked it Out and also Knocked Out Solrock on the Bench.",
    (s) => {
      const oldActive = s.opponent.active;
      promote(s.opponent, "Meowth ex");
      if (oldActive) s.opponent.bench.push(oldActive);
      discardActive(s.opponent);
      const knockedOutSolrock = s.opponent.bench.find(
        (item) => item.name === "Solrock",
      );
      s.opponent.bench = s.opponent.bench.filter(
        (item) => item.id !== knockedOutSolrock?.id,
      );
      if (knockedOutSolrock) {
        const currentActive = s.opponent.active;
        knockedOutSolrock.energy = ["Fighting"];
        s.opponent.active = knockedOutSolrock;
        discardActive(s.opponent);
        s.opponent.active = currentActive;
      }
      s.self.prizesRemaining -= 1;
      s.self.deckCount = 16;
      discardCards(
        s.self,
        zoneCard("self-t6-boss", "Boss's Orders", images.boss),
      );
      setHand(s.self, [
        ...s.self.knownHand.filter((item) => item.name !== "Boss's Orders"),
        hand("turn-six-dawn", "Dawn"),
        hand("final-prize-munkidori", "Munkidori", images.munkidori),
      ]);
    },
  ),
  event("self", 6, "Result", "All Prize cards taken. You won.", () => {}),
];

export const replayFrames = replayEvents.reduce<ReplayState[]>(
  (frames, action) => {
    frames.push(action.apply(frames[frames.length - 1]));
    return frames;
  },
  [initialReplayState],
);

export const representativeCardImages = images;
