import assert from "node:assert/strict";
import test from "node:test";

import { replayEvents, replayFrames } from "@/lib/battle-replay/prototype";
import {
  resolveBoardCardPreview,
  resolveTransactionActors,
  resolveTransactionStage,
  shouldShowTransactionEvolutionStack,
} from "@/lib/battle-replay/preview";
import { prototypeBattleLogSections } from "@/lib/battle-replay/prototype-log";
import {
  flattenReplaySourceActions,
  getDamageCounterPlacements,
} from "@/lib/battle-replay/source";
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

  const duplicateBenchEvolution = replayEvents[27].transaction;
  const duplicateBenchBefore = resolveBoardCardPreview(duplicateBenchEvolution!.stages[0].cards[0], duplicateBenchEvolution!.stages[0], "self", replayFrames[28], replayFrames[27]);
  const duplicateBenchAfter = resolveBoardCardPreview(duplicateBenchEvolution!.stages[1].cards[0], duplicateBenchEvolution!.stages[1], "self", replayFrames[28], replayFrames[27]);
  assert.deepEqual(duplicateBenchBefore.energy, ["Fire"]);
  assert.deepEqual(duplicateBenchAfter.energy, ["Fire"]);

  const rareCandyStages = replayEvents[52].transaction?.stages;
  assert.deepEqual(rareCandyStages?.map((stage) => stage.label), ["Play", "From", "Evolve into"]);
  assert.deepEqual(rareCandyStages?.slice(1).map((stage) => stage.cards[0].name), ["Torchic", "Blaziken ex"]);

  const phantomDiveExpectations = [
    {
      position: 63,
      targets: [{ stageId: "63-counter-target-1", boardId: "opp-riolu-b", name: "Riolu", damage: 60, detail: "6 damage counters" }],
    },
    {
      position: 80,
      targets: [{ stageId: "opp-riolu-b", boardId: "opp-riolu-b", name: "Mega Lucario ex", damage: 120, detail: "6 damage counters" }],
    },
    {
      position: 100,
      targets: [
        { stageId: "opp-solrock-a", boardId: "opp-solrock-a", name: "Solrock", damage: 70, detail: "1 damage counter" },
        { stageId: "opp-riolu-c", boardId: "opp-riolu-c", name: "Riolu", damage: 80, detail: "5 damage counters" },
      ],
    },
    {
      position: 115,
      targets: [{ stageId: "opp-solrock-a", boardId: "opp-solrock-a", name: "Solrock", damage: 130, detail: "6 damage counters" }],
    },
  ];
  for (const expectation of phantomDiveExpectations) {
    const stages = replayEvents[expectation.position - 1].transaction?.stages;
    const placementStages = stages?.filter((stage) => stage.label === "Place counters") ?? [];
    assert.deepEqual(
      placementStages.map((stage) => ({ id: stage.cards[0].id, name: stage.cards[0].name, detail: stage.detail })),
      expectation.targets.map(({ stageId: id, name, detail }) => ({ id, name, detail })),
    );
    for (const target of expectation.targets) {
      assert.equal(
        replayFrames[expectation.position].opponent.bench.find((card) => card.id === target.boardId)?.damage,
        target.damage,
      );
    }
  }
  assert.match(replayEvents[79].summary, /6 damage counters on Mega Lucario ex/);
  assert.deepEqual(replayEvents[79].sourceDetails, [
    "- JammerUK1993 put 6 damage counters on JammerUK1993's Mega Lucario ex.",
  ]);

  const sourceActions = flattenReplaySourceActions(prototypeBattleLogSections, "JammerUK1993");
  assert.equal(sourceActions.length, 119);
  assert.deepEqual(sourceActions[79].details, [
    "- JammerUK1993 put 6 damage counters on JammerUK1993's Mega Lucario ex.",
  ]);
  assert.deepEqual(getDamageCounterPlacements(sourceActions[99].details), [
    { counters: 1, targetName: "Solrock" },
    { counters: 5, targetName: "Riolu" },
  ]);
  assert.equal(
    replayFrames[117].opponent.discard[0]?.id,
    "opp-t6-solrock",
  );
  assert.deepEqual(
    replayFrames[117].opponent.bench.filter((card) => card.name === "Solrock").map((card) => card.id),
    ["opp-solrock-b"],
  );

  const attackEvents = replayEvents.filter((event) => / used .+ on .+ for \d+\+? damage\./.test(event.sourceTitle));
  assert.equal(attackEvents.length, 10);
  assert.ok(attackEvents.every((event) => event.transaction?.stages[0].kind === "attack"));
  const firstAttackStages = attackEvents[0].transaction?.stages;
  assert.equal(firstAttackStages?.[0].cards[0].name, "Solrock");
  assert.equal(firstAttackStages?.[1].cards[0].name, "Munkidori");
  assert.equal(firstAttackStages?.[1].label, "100 damage");
  const weaknessAttack = attackEvents.find((event) => event.sourceTitle.includes("because of Fighting Weakness"));
  const weaknessDamageStage = weaknessAttack?.transaction?.stages[1];
  assert.deepEqual(weaknessDamageStage?.damageModifier, {
    kind: "weakness",
    type: "Fighting",
    baseDamage: 160,
    bonusDamage: 160,
    multiplier: 2,
  });
  assert.equal(weaknessDamageStage?.label, "320 damage");
  assert.equal(weaknessDamageStage?.detail, undefined);
  assert.ok(attackEvents.filter((event) => event !== weaknessAttack).every((event) => event.transaction?.stages[1].damageModifier === undefined));

  const opponentLillieStages = replayEvents[43].transaction?.stages;
  assert.deepEqual(opponentLillieStages?.map((stage) => stage.label), ["Play", "Shuffle", "Draw"]);
  assert.equal(opponentLillieStages?.[1].hiddenCount, 2);

  const opponentJudgeShuffle = replayEvents[70].transaction?.stages[1];
  assert.ok(opponentJudgeShuffle);
  assert.deepEqual(resolveTransactionActors(opponentJudgeShuffle, "opponent"), ["opponent", "self"]);
  assert.equal(opponentJudgeShuffle.detail, "both players shuffle their hand into their deck");
  assert.equal(
    resolveTransactionStage(opponentJudgeShuffle, "opponent", replayFrames[70]).hiddenCount,
    7,
  );
  assert.equal(
    resolveTransactionStage(opponentJudgeShuffle, "self", replayFrames[70], replayFrames[71]).hiddenCount,
    undefined,
  );
  assert.deepEqual(
    resolveTransactionStage(opponentJudgeShuffle, "self", replayFrames[70], replayFrames[71]).cards.map((card) => card.name),
    ["Night Stretcher", "Dawn", "Basic Darkness Energy", "Ultra Ball"],
  );
  const opponentJudgeDraw = replayEvents[70].transaction?.stages[2];
  assert.ok(opponentJudgeDraw);
  assert.equal(opponentJudgeDraw.scope, "both");
  assert.equal(opponentJudgeDraw.detail, "each player draws 4 cards");
  assert.deepEqual(
    resolveTransactionStage(opponentJudgeDraw, "self", replayFrames[70], replayFrames[71]).cards.map((card) => card.name),
    ["Basic Fire Energy", "Night Stretcher", "Basic Darkness Energy", "Torchic"],
  );

  const pokePadStages = replayEvents[56].transaction?.stages;
  assert.deepEqual(pokePadStages?.map((stage) => stage.label), ["Play", "Find"]);
  assert.equal(pokePadStages?.[1].cards[0].name, "Drakloak");
  assert.equal(replayFrames[57].self.handCount, 5);
  assert.equal(replayFrames[58].self.handCount, 4);

  const hiddenStages = replayEvents.flatMap((event) => event.transaction?.stages ?? []).filter((stage) => stage.hiddenCount);
  assert.ok(hiddenStages.some((stage) => stage.hiddenCount === 8));

  const switchStages = replayEvents[46].transaction?.stages;
  assert.deepEqual(switchStages?.map((stage) => stage.label), ["Play", "Out", "In"]);
  assert.deepEqual(switchStages?.slice(1).map((stage) => stage.cards[0].id), ["opp-solrock-a", "opp-solrock-b"]);
  assert.match(switchStages?.[0].cards[0].imageUrl ?? "", /\/MEG\/MEG_130_R_EN_SM\.png$/);
});
