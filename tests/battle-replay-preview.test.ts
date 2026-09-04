import assert from "node:assert/strict";
import test from "node:test";

import { resolveBoardCardPreview } from "@/lib/battle-replay/preview";
import type {
  ReplayState,
  ReplayTransactionStage,
  ReplayZoneCard,
} from "@/lib/battle-replay/prototype";

const solrock: ReplayZoneCard = {
  id: "found-solrock",
  name: "Solrock",
  imageUrl: "/solrock.png",
};

const state: ReplayState = {
  self: {
    name: "Self",
    active: null,
    bench: [],
    deckCount: 0,
    handCount: 0,
    knownHand: [],
    discard: [],
    prizesRemaining: 0,
  },
  opponent: {
    name: "Opponent",
    active: {
      ...solrock,
      id: "active-solrock",
      hp: 90,
      damage: 60,
      energy: ["Fighting"],
      underlying: [],
    },
    bench: [],
    deckCount: 0,
    handCount: 0,
    knownHand: [],
    discard: [],
    prizesRemaining: 0,
  },
  stadium: null,
  playedCard: null,
};

test("transaction cards inherit board state only when the stage references an in-play Pokemon", () => {
  const findStage: ReplayTransactionStage = {
    kind: "find",
    label: "Find",
    cards: [solrock],
  };

  assert.deepEqual(resolveBoardCardPreview(solrock, findStage, "opponent", state), solrock);

  const moveStage: ReplayTransactionStage = {
    kind: "move",
    label: "To Solrock",
    cards: [solrock],
  };
  assert.equal(resolveBoardCardPreview(solrock, moveStage, "self", state).damage, 60);
});
