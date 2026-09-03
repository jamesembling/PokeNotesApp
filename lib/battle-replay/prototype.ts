import { buildDeckListCardImageUrl } from "@/lib/deck-lists/render";

export type ReplayActor = "self" | "opponent";

export type ReplayCard = {
  id: string;
  name: string;
  imageUrl: string;
  hp: number;
  damage: number;
  energy: string[];
  underlyingCount: number;
  tool?: string;
};

export type ReplaySide = {
  name: string;
  active: ReplayCard | null;
  bench: ReplayCard[];
  deckCount: number;
  handCount: number;
  discard: Array<{ name: string; imageUrl: string }>;
  discardCount: number;
  prizesRemaining: number;
};

export type ReplayState = {
  self: ReplaySide;
  opponent: ReplaySide;
  stadium: { name: string; imageUrl: string } | null;
};

export type ReplayEvent = {
  actor: ReplayActor;
  label: string;
  summary: string;
  turn: number;
  apply: (state: ReplayState) => ReplayState;
};

const cardImage = (set: string, number: string) => buildDeckListCardImageUrl(set, number, "SM");

const images = {
  buddy: cardImage("TEF", "144"),
  charizard: cardImage("OBF", "125"),
  charmander: cardImage("MEW", "004"),
  dragapult: cardImage("TWM", "130"),
  dreepy: cardImage("TWM", "128"),
  pidgey: cardImage("OBF", "162"),
  boss: cardImage("PAL", "172"),
  psychic: cardImage("SVE", "005"),
  rareCandy: cardImage("SVI", "191"),
  stadium: cardImage("TWM", "165")
};

const pokemon = (id: string, name: string, imageUrl: string, hp: number): ReplayCard => ({
  id,
  name,
  imageUrl,
  hp,
  damage: 0,
  energy: [],
  underlyingCount: 0
});

export const initialReplayState: ReplayState = {
  self: {
    name: "JammerUK1993",
    active: null,
    bench: [],
    deckCount: 47,
    handCount: 7,
    discard: [],
    discardCount: 0,
    prizesRemaining: 6
  },
  opponent: {
    name: "FixtureOpponent",
    active: null,
    bench: [],
    deckCount: 47,
    handCount: 7,
    discard: [],
    discardCount: 0,
    prizesRemaining: 6
  },
  stadium: null
};

function updateSide(
  state: ReplayState,
  actor: ReplayActor,
  update: (side: ReplaySide) => ReplaySide
): ReplayState {
  return { ...state, [actor]: update(state[actor]) };
}

function playPokemon(
  actor: ReplayActor,
  zone: "active" | "bench",
  card: ReplayCard
): ReplayEvent["apply"] {
  return (state) =>
    updateSide(state, actor, (side) => ({
      ...side,
      active: zone === "active" ? card : side.active,
      bench: zone === "bench" ? [...side.bench, card] : side.bench,
      handCount: Math.max(0, side.handCount - 1)
    }));
}

export const replayEvents: ReplayEvent[] = [
  {
    actor: "self",
    turn: 0,
    label: "Setup",
    summary: "Dreepy was placed in the Active Spot.",
    apply: playPokemon("self", "active", pokemon("self-dreepy-a", "Dreepy", images.dreepy, 70))
  },
  {
    actor: "opponent",
    turn: 0,
    label: "Setup",
    summary: "Charmander was placed in the Active Spot.",
    apply: playPokemon(
      "opponent",
      "active",
      pokemon("opponent-charmander", "Charmander", images.charmander, 70)
    )
  },
  {
    actor: "opponent",
    turn: 0,
    label: "Bench",
    summary: "Pidgey was placed on the Bench.",
    apply: playPokemon("opponent", "bench", pokemon("opponent-pidgey", "Pidgey", images.pidgey, 60))
  },
  {
    actor: "self",
    turn: 1,
    label: "Draw",
    summary: "Drew Buddy-Buddy Poffin.",
    apply: (state) => updateSide(state, "self", (side) => ({
      ...side,
      deckCount: side.deckCount - 1,
      handCount: side.handCount + 1
    }))
  },
  {
    actor: "self",
    turn: 1,
    label: "Bench",
    summary: "Played Dreepy to the Bench.",
    apply: playPokemon("self", "bench", pokemon("self-dreepy-b", "Dreepy", images.dreepy, 70))
  },
  {
    actor: "self",
    turn: 1,
    label: "Energy",
    summary: "Attached Basic Psychic Energy to Active Dreepy.",
    apply: (state) => updateSide(state, "self", (side) => ({
      ...side,
      active: side.active ? { ...side.active, energy: [...side.active.energy, "Psychic"] } : null,
      handCount: Math.max(0, side.handCount - 1)
    }))
  },
  {
    actor: "self",
    turn: 1,
    label: "Attack",
    summary: "Dreepy used Gnaw for 30 damage.",
    apply: (state) => updateSide(state, "opponent", (side) => ({
      ...side,
      active: side.active ? { ...side.active, damage: side.active.damage + 30 } : null
    }))
  },
  {
    actor: "opponent",
    turn: 2,
    label: "Evolve",
    summary: "Charmander evolved into Charizard ex.",
    apply: (state) => updateSide(state, "opponent", (side) => ({
      ...side,
      active: {
        ...pokemon("opponent-charizard", "Charizard ex", images.charizard, 330),
        damage: side.active?.damage ?? 0,
        energy: ["Fire", "Fire"],
        underlyingCount: (side.active?.underlyingCount ?? 0) + 1
      },
      deckCount: side.deckCount - 2,
      handCount: Math.max(0, side.handCount - 2),
      discard: [{ name: "Rare Candy", imageUrl: images.rareCandy }, ...side.discard],
      discardCount: side.discardCount + 1
    }))
  },
  {
    actor: "opponent",
    turn: 2,
    label: "Attack",
    summary: "Charizard ex used Burning Darkness for 180 damage.",
    apply: (state) => updateSide(state, "self", (side) => ({
      ...side,
      active: side.active ? { ...side.active, damage: 180 } : null
    }))
  },
  {
    actor: "opponent",
    turn: 2,
    label: "KO",
    summary: "Dreepy was Knocked Out. FixtureOpponent took 1 Prize card.",
    apply: (state) => ({
      ...updateSide(state, "self", (side) => ({
        ...side,
        active: null,
        discard: side.active
          ? [{ name: side.active.name, imageUrl: side.active.imageUrl }, ...side.discard]
          : side.discard,
        discardCount: side.active
          ? side.discardCount + 1 + side.active.energy.length + side.active.underlyingCount
          : side.discardCount
      })),
      opponent: {
        ...state.opponent,
        handCount: state.opponent.handCount + 1,
        prizesRemaining: state.opponent.prizesRemaining - 1
      }
    })
  },
  {
    actor: "self",
    turn: 2,
    label: "Promote",
    summary: "Benched Dreepy was promoted to the Active Spot.",
    apply: (state) => updateSide(state, "self", (side) => ({
      ...side,
      active: side.bench[0] ?? null,
      bench: side.bench.slice(1)
    }))
  },
  {
    actor: "self",
    turn: 3,
    label: "Evolve",
    summary: "Dreepy evolved into Dragapult ex.",
    apply: (state) => updateSide(state, "self", (side) => ({
      ...side,
      active: side.active
        ? {
            ...pokemon(side.active.id, "Dragapult ex", images.dragapult, 320),
            energy: side.active.energy,
            underlyingCount: side.active.underlyingCount + 1
          }
        : null,
      handCount: Math.max(0, side.handCount - 2),
      discard: [{ name: "Rare Candy", imageUrl: images.rareCandy }, ...side.discard],
      discardCount: side.discardCount + 1
    }))
  },
  {
    actor: "self",
    turn: 3,
    label: "Energy",
    summary: "Attached Neo Upper Energy to Dragapult ex.",
    apply: (state) => updateSide(state, "self", (side) => ({
      ...side,
      active: side.active
        ? { ...side.active, energy: [...side.active.energy, "Neo Upper Energy"] }
        : null,
      handCount: Math.max(0, side.handCount - 1)
    }))
  },
  {
    actor: "self",
    turn: 3,
    label: "Supporter",
    summary: "Played Boss's Orders.",
    apply: (state) => updateSide(state, "self", (side) => ({
      ...side,
      handCount: Math.max(0, side.handCount - 1),
      discard: [{ name: "Boss's Orders", imageUrl: images.boss }, ...side.discard],
      discardCount: side.discardCount + 1
    }))
  },
  {
    actor: "self",
    turn: 3,
    label: "Stadium",
    summary: "Played Jamming Tower to the Stadium Spot.",
    apply: (state) => ({
      ...state,
      self: { ...state.self, handCount: Math.max(0, state.self.handCount - 1) },
      stadium: { name: "Jamming Tower", imageUrl: images.stadium }
    })
  },
  {
    actor: "self",
    turn: 3,
    label: "Attack",
    summary: "Dragapult ex dealt 200 damage to Charizard ex and placed 6 damage counters on Pidgey.",
    apply: (state) => updateSide(state, "opponent", (side) => ({
      ...side,
      active: side.active ? { ...side.active, damage: side.active.damage + 200 } : null,
      bench: side.bench.map((card, index) => index === 0 ? { ...card, damage: card.damage + 60 } : card)
    }))
  },
  {
    actor: "self",
    turn: 3,
    label: "KO",
    summary: "Pidgey was Knocked Out by Phantom Dive's damage counters. JammerUK1993 took 1 Prize card.",
    apply: (state) => ({
      ...updateSide(state, "opponent", (side) => ({
        ...side,
        bench: side.bench.slice(1),
        discard: side.bench[0]
          ? [{ name: side.bench[0].name, imageUrl: side.bench[0].imageUrl }, ...side.discard]
          : side.discard,
        discardCount: side.bench[0]
          ? side.discardCount + 1 + side.bench[0].energy.length + side.bench[0].underlyingCount
          : side.discardCount
      })),
      self: {
        ...state.self,
        handCount: state.self.handCount + 1,
        prizesRemaining: state.self.prizesRemaining - 1
      }
    })
  }
];

export const replayFrames = replayEvents.reduce<ReplayState[]>((frames, event) => {
  frames.push(event.apply(frames[frames.length - 1]));
  return frames;
}, [initialReplayState]);

export const representativeCardImages = images;
