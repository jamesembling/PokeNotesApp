import assert from "node:assert/strict";
import test from "node:test";

import { replayEvents, replayFrames } from "@/lib/battle-replay/prototype";
import {
  getHiddenCardSlots,
  resolveBoardCardPreview,
  shouldShowTransactionEvolutionStack,
} from "@/lib/battle-replay/preview";
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

  const coinFlip = replayEvents[0].transaction;
  assert.equal(coinFlip?.stages[0].coinFace, "tails");

  const attachmentEvents = replayEvents.filter((event) => /attached Basic .+ Energy to/.test(event.sourceTitle));
  assert.equal(attachmentEvents.length, 9);
  assert.ok(attachmentEvents.every((event) => event.transaction?.stages.map((stage) => stage.kind).join(",") === "attach,move"));

  const evolutionEvents = replayEvents.filter((event) => / evolved .+ to .+ (?:in|on) the /.test(event.sourceTitle));
  assert.equal(evolutionEvents.length, 7);
  assert.ok(evolutionEvents.every((event) => event.transaction?.stages.map((stage) => stage.kind).join(",") === "before,evolve"));
  const evolutionStage = evolutionEvents[0].transaction?.stages[1];
  assert.ok(evolutionStage);
  assert.equal(shouldShowTransactionEvolutionStack(evolutionStage, {
    ...evolutionStage.cards[0],
    underlying: [solrock],
  }), false);

  const activeEvolution = replayEvents[60].transaction;
  assert.deepEqual(activeEvolution?.stages.map((stage) => stage.label), ["From", "Evolve into"]);
  const activeBefore = resolveBoardCardPreview(activeEvolution!.stages[0].cards[0], activeEvolution!.stages[0], "self", replayFrames[61], replayFrames[60]);
  const activeAfter = resolveBoardCardPreview(activeEvolution!.stages[1].cards[0], activeEvolution!.stages[1], "self", replayFrames[61], replayFrames[60]);
  assert.deepEqual(activeBefore.energy, ["Fire", "Psychic"]);
  assert.deepEqual(activeAfter.energy, ["Fire", "Psychic"]);
  assert.equal(shouldShowTransactionEvolutionStack(activeEvolution!.stages[0], activeBefore), false);

  const rareCandyStages = replayEvents[52].transaction?.stages;
  assert.deepEqual(rareCandyStages?.map((stage) => stage.label), ["Play", "From", "Evolve into"]);
  assert.deepEqual(rareCandyStages?.slice(1).map((stage) => stage.cards[0].name), ["Torchic", "Blaziken ex"]);

  const phantomDiveStages = replayEvents[62].transaction?.stages;
  assert.deepEqual(phantomDiveStages?.map((stage) => stage.label), ["Attack", "200 damage", "Place counters"]);
  assert.equal(phantomDiveStages?.[2].detail, "6 damage counters · Bench");

  const hiddenStages = replayEvents.flatMap((event) => event.transaction?.stages ?? []).filter((stage) => stage.hiddenCount);
  assert.ok(hiddenStages.some((stage) => stage.hiddenCount === 8));
  assert.ok(hiddenStages.every((stage) => getHiddenCardSlots(stage.hiddenCount).length === stage.hiddenCount));

  const switchStages = replayEvents[46].transaction?.stages;
  assert.deepEqual(switchStages?.map((stage) => stage.label), ["Play", "Out", "In"]);
  assert.deepEqual(switchStages?.slice(1).map((stage) => stage.cards[0].id), ["opp-solrock-a", "opp-solrock-b"]);
  assert.match(switchStages?.[0].cards[0].imageUrl ?? "", /\/MEG\/MEG_130_R_EN_SM\.png$/);
});
