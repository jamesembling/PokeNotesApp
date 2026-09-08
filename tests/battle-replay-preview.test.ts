import { applyReplayConditions } from "@/lib/battle-replay/conditions";
import assert from "node:assert/strict";
import test from "node:test";

import { replayEvents, replayFrames } from "@/lib/battle-replay/prototype";
import {
  resolveBoardCardPreview,
  resolveOpeningCoinToss,
  resolveOpeningTurnChoice,
  resolveResultOnlyCoinFlip,
  resolveTransactionActors,
  resolveTransactionStage,
  shouldShowTransactionEvolutionStack,
} from "@/lib/battle-replay/preview";
import { prototypeBattleLogSections } from "@/lib/battle-replay/prototype-log";
import {
  replayPilots,
  resolveReplayLocation,
} from "@/lib/battle-replay/pilots";
import {
  flattenReplaySourceActions,
  getDamageCounterPlacements,
} from "@/lib/battle-replay/source";
import type {
  ReplayActor,
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
  const affected = applyReplayConditions(state, structuredClone(state), {
    sourceTitle: "OtherPlayer's Solrock is now Poisoned.",
    sourceDetails: ["OtherPlayer's Solrock is now Burned.", "OtherPlayer's Solrock is now Asleep."],
  }, "SelfPlayer");
  assert.deepEqual(affected.opponent.active?.conditions, ["Poisoned", "Burned", "Asleep"]);
  assert.equal(state.opponent.active?.conditions, undefined);
  assert.deepEqual(resolveBoardCardPreview(solrock, { kind: "ability", label: "Ability", cards: [solrock] }, "opponent", affected).conditions, ["Poisoned", "Burned", "Asleep"]);
  const recovered = applyReplayConditions(affected, structuredClone(affected), {
    sourceTitle: "OtherPlayer's Solrock woke up.", sourceDetails: ["OtherPlayer's Solrock recovered from Burned."],
  }, "SelfPlayer");
  assert.deepEqual(recovered.opponent.active?.conditions, ["Poisoned"]);
  const evolved = structuredClone(affected);
  evolved.opponent.active!.name = "Evolved Pokémon";
  applyReplayConditions(affected, evolved, { sourceTitle: "Evolution", sourceDetails: [] }, "SelfPlayer");
  assert.deepEqual(evolved.opponent.active?.conditions, []);
  const benched = structuredClone(affected);
  benched.opponent.bench = [benched.opponent.active!];
  benched.opponent.active = null;
  applyReplayConditions(affected, benched, { sourceTitle: "Retreat", sourceDetails: [] }, "SelfPlayer");
  assert.deepEqual(benched.opponent.bench[0].conditions, []);
  const wrongOwner = applyReplayConditions(state, structuredClone(state), { sourceTitle: "SelfPlayer's Solrock is now Poisoned.", sourceDetails: [] }, "SelfPlayer");
  assert.deepEqual(wrongOwner.opponent.active?.conditions, []);

  assert.deepEqual(resolveReplayLocation("bex-0815", "92"), {
    pilotId: "bex-0815",
    actionIndex: 92,
  });
  assert.deepEqual(resolveReplayLocation("missing", "not-a-position"), {
    pilotId: "original",
    actionIndex: 0,
  });
  assert.deepEqual(resolveReplayLocation("bex-0815", "9999"), {
    pilotId: "bex-0815",
    actionIndex: replayPilots[1].frames.length - 1,
  });
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

  assert.deepEqual(resolveOpeningCoinToss(replayEvents[0]), {
    caller: "self", choice: "tails", winner: "opponent", result: "heads",
  });
  assert.deepEqual(resolveOpeningCoinToss(replayPilots[1].events[0]), {
    caller: "self", choice: "heads", winner: "self", result: "heads",
  });
  assert.equal(resolveOpeningCoinToss(replayEvents[1]), null);
  assert.deepEqual(resolveOpeningTurnChoice(replayEvents[1]), { actor: "opponent", order: "first" });
  assert.deepEqual(resolveOpeningTurnChoice(replayPilots[1].events[1]), { actor: "self", order: "first" });
  assert.deepEqual(resolveOpeningTurnChoice({ ...replayEvents[1], sourceTitle: "Player decided to go second." }), { actor: "opponent", order: "second" });
  assert.equal(resolveOpeningTurnChoice(replayEvents[0]), null);

  assert.deepEqual(resolveOpeningCoinToss({ ...replayEvents[0], sourceDetails: [] }), {
    caller: "self", choice: "tails", winner: null, result: null,
  });
  assert.deepEqual(resolveOpeningCoinToss({ ...replayEvents[0], actor: "opponent" }), {
    caller: "opponent", choice: "tails", winner: "self", result: "heads",
  });

  const attachmentEvents = replayEvents.filter((event) => /attached Basic .+ Energy to/.test(event.sourceTitle));
  assert.equal(attachmentEvents.length, 9);
  assert.ok(attachmentEvents.every((event) => event.transaction?.stages.map((stage) => stage.kind).join(",") === "attach,move"));

  const firstDuplicateRecon = replayEvents[53].transaction?.stages[0];
  const secondDuplicateRecon = replayEvents[54].transaction?.stages[0];
  assert.ok(firstDuplicateRecon);
  assert.ok(secondDuplicateRecon);
  assert.deepEqual(
    [replayFrames[54].self.active, ...replayFrames[54].self.bench]
      .filter((card) => card?.name === "Drakloak")
      .map((card) => card?.abilityUsed),
    [true, undefined],
  );
  assert.deepEqual(
    [replayFrames[55].self.active, ...replayFrames[55].self.bench]
      .filter((card) => card?.name === "Drakloak")
      .map((card) => card?.abilityUsed),
    [true, true],
  );
  assert.ok(
    [replayFrames[54].opponent.active, ...replayFrames[54].opponent.bench]
      .every((card) => !card?.abilityUsed),
  );
  assert.equal(
    resolveBoardCardPreview(
      secondDuplicateRecon.cards[0],
      secondDuplicateRecon,
      "self",
      replayFrames[55],
      replayFrames[54],
    ).id,
    "self-dreepy-b",
  );
  const firstTurnFourPosition = replayEvents.findIndex((event) => event.turn === 4) + 1;
  assert.ok(firstTurnFourPosition > 0);
  assert.ok(
    [replayFrames[firstTurnFourPosition].self.active, ...replayFrames[firstTurnFourPosition].self.bench]
      .every((card) => !card?.abilityUsed),
  );

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
  assert.match(switchStages?.[0].cards[0].imageUrl ?? "", /\/MEG\/MEG_130_R_EN_LG\.png$/);

  const secondPilot = replayPilots.find((pilot) => pilot.id === "bex-0815");
  assert.ok(secondPilot);
  assert.equal(secondPilot.events.length, 132);
  assert.equal(secondPilot.frames.length, 133);
  assert.equal(secondPilot.events[0].sourceTitle, "B3xCharz24 chose heads for the opening coin flip.");
  assert.equal(secondPilot.events.at(-1)?.sourceTitle, "All Prize cards taken. B3xCharz24 wins.");
  assert.deepEqual(secondPilot.frames[0].self.knownHand.map((card) => card.name), [
    "Lillie's Determination",
    "Dawn",
    "Torchic",
    "Dreepy",
    "Buddy-Buddy Poffin",
    "Ultra Ball",
    "Basic Darkness Energy",
  ]);
  assert.ok(secondPilot.frames.every((frame) =>
    frame.self.knownHand.length <= frame.self.handCount
      && frame.opponent.knownHand.length <= frame.opponent.handCount,
  ));
  const unfairStamp = secondPilot.events.find((event) => event.sourceTitle === "Guintu played Unfair Stamp.");
  assert.deepEqual(unfairStamp?.transaction?.stages.map((stage) => [stage.kind, stage.scope]), [
    ["play", undefined],
    ["shuffle", "both"],
    ["draw", "both"],
  ]);
  assert.deepEqual(unfairStamp?.transaction?.stages[1].actorCounts, {
    opponent: 10,
    self: 8,
  });
  assert.deepEqual(unfairStamp?.transaction?.stages[2].actorCounts, {
    opponent: 5,
    self: 2,
  });
  const unfairStampIndex = secondPilot.events.indexOf(unfairStamp!);
  const unfairStampBefore = secondPilot.frames[unfairStampIndex];
  const unfairStampAfter = secondPilot.frames[unfairStampIndex + 1];
  const resolvedSelfShuffle = resolveTransactionStage(
    unfairStamp!.transaction!.stages[1],
    "self",
    unfairStampBefore,
    unfairStampAfter,
  );
  assert.deepEqual(resolvedSelfShuffle.cards.map((card) => card.name), [
    "Psyduck",
    "Lillie's Clefairy ex",
    "Crispin",
    "Buddy-Buddy Poffin",
    "Drakloak",
    "Basic Fire Energy",
    "Buddy-Buddy Poffin",
    "Night Stretcher",
  ]);
  assert.equal(resolvedSelfShuffle.hiddenCount, undefined);
  assert.equal(
    resolveTransactionStage(unfairStamp!.transaction!.stages[2], "opponent", unfairStampBefore, unfairStampAfter).hiddenCount,
    5,
  );
  assert.deepEqual(
    resolveTransactionStage(unfairStamp!.transaction!.stages[2], "self", unfairStampBefore, unfairStampAfter).cards.map((card) => card.name),
    ["Crispin", "Dawn"],
  );

  const crispin = secondPilot.events[40];
  assert.equal(crispin.sourceTitle, "Guintu played Crispin.");
  assert.deepEqual(crispin.transaction?.stages.map((stage) => stage.kind), ["play", "draw", "attach", "move"]);
  assert.deepEqual(crispin.transaction?.stages.map((stage) => stage.label), ["Play", "Draw", "Attach", "To Drakloak"]);
  assert.equal(crispin.transaction?.stages[2].cards[0].name, "Basic Fire Energy");
  assert.deepEqual(
    resolveBoardCardPreview(
      crispin.transaction!.stages[3].cards[0],
      crispin.transaction!.stages[3],
      "opponent",
      secondPilot.frames[41],
      secondPilot.frames[40],
    ).energy,
    ["Fire"],
  );

  for (const position of [41, 108, 120]) {
    const before: ReplayState = secondPilot.frames[position - 1];
    const after: ReplayState = secondPilot.frames[position];
    const actor: ReplayActor = secondPilot.events[position - 1].actor;
    assert.equal(after[actor].deckCount, before[actor].deckCount - 2);
  }

  const prizeExpectations = [
    { position: 21, count: 1, names: [] },
    { position: 55, count: 1, names: ["Night Stretcher"] },
    { position: 78, count: 1, names: [] },
    { position: 83, count: 2, names: [] },
    { position: 93, count: 2, names: ["Dragapult ex", "Poké Pad"] },
    { position: 112, count: 2, names: ["Munkidori", "Drakloak"] },
    { position: 131, count: 1, names: ["Lillie's Determination"] },
  ];
  for (const { position, count, names } of prizeExpectations) {
    const actor: ReplayActor = secondPilot.events[position - 1].actor;
    const before: ReplayState["self"] = secondPilot.frames[position - 1][actor];
    const after: ReplayState["self"] = secondPilot.frames[position][actor];
    assert.equal(after.handCount, before.handCount + count);
    assert.ok(names.every((name) => after.knownHand.some((card) => card.name === name)));
    assert.equal(secondPilot.events[position - 1].transaction?.stages[0].label, "Take Prize");
  }
  assert.equal(secondPilot.events[20].transaction?.stages[1].actor, "self");
  assert.equal(secondPilot.events[20].transaction?.stages[1].detail, "you promote Dreepy");
  assert.equal(secondPilot.events[54].transaction?.stages[1].actor, "opponent");
  assert.equal(secondPilot.events[54].transaction?.stages[1].detail, "opponent promotes Drakloak");

  const retreatExpectations = [
    { position: 10, pokemon: "Dreepy", energy: ["Darkness"] },
    { position: 40, pokemon: "Moltres", energy: ["Fire"] },
    { position: 106, pokemon: "Blaziken ex", energy: ["Fire", "Psychic"] },
    { position: 127, pokemon: "Dragapult ex", energy: ["Fire"] },
  ];
  for (const { position, pokemon, energy } of retreatExpectations) {
    const actor: ReplayActor = secondPilot.events[position - 1].actor;
    const after: ReplayState["self"] = secondPilot.frames[position][actor];
    const retreated = after.bench.find((card) => card.name === pokemon);
    assert.ok(retreated);
    assert.ok(energy.every((type) => !retreated.energy.includes(type)));
    assert.ok(energy.every((type) => after.discard.some((card) => card.name === `Basic ${type} Energy`)));
    assert.deepEqual(secondPilot.events[position - 1].transaction?.stages.map((stage) => stage.kind), ["move", "discard", "move"]);
    assert.deepEqual(
      secondPilot.events[position - 1].transaction?.stages[1].cards.map((card) => card.name),
      energy.map((type) => `Basic ${type} Energy`),
    );
  }

  const specialRedCard = secondPilot.events[86];
  assert.deepEqual(specialRedCard.transaction?.stages.map((stage) => stage.kind), ["play", "shuffle", "draw"]);
  assert.deepEqual(specialRedCard.transaction?.stages.slice(1).map((stage) => stage.actor), ["opponent", "opponent"]);
  assert.deepEqual(resolveTransactionActors(specialRedCard.transaction!.stages[1], "self"), ["opponent"]);
  assert.equal(secondPilot.frames[87].self.handCount, secondPilot.frames[86].self.handCount - 1);
  assert.equal(secondPilot.frames[87].opponent.handCount, 3);
  assert.equal(
    secondPilot.frames[87].opponent.deckCount,
    secondPilot.frames[86].opponent.deckCount + secondPilot.frames[86].opponent.handCount - 3,
  );
  assert.ok(secondPilot.frames[88].self.discard.some((card) => card.name === "Special Red Card"));

  const secondPilotEvolutions = secondPilot.events.filter((event) => / evolved .+ to .+ (?:in|on) the /.test(event.sourceTitle));
  assert.ok(secondPilotEvolutions.length > 0);
  assert.ok(secondPilotEvolutions.every((event) => event.transaction?.stages.map((stage) => stage.kind).join(",") === "before,evolve"));

  const secondPilotKnockouts = secondPilot.events.filter((event) => / was Knocked Out!$/.test(event.sourceTitle));
  assert.ok(secondPilotKnockouts.length > 0);
  assert.ok(secondPilotKnockouts.every((event) => event.transaction?.stages.map((stage) => stage.kind).join(",") === "before,discard"));
  assert.deepEqual(secondPilot.events[91].transaction?.stages[1].cards.map((card) => card.name), [
    "Dragapult ex",
    "Basic Fire Energy",
    "Basic Psychic Energy",
    "Drakloak",
    "Dreepy",
  ]);
  assert.equal(secondPilot.frames[82].self.discard.length - secondPilot.frames[81].self.discard.length, 5);
  assert.equal(secondPilot.frames[92].opponent.discard.length - secondPilot.frames[91].opponent.discard.length, 5);

  const lastDitchCatch = secondPilot.events[43];
  assert.match(lastDitchCatch.transaction?.stages[1].cards[0].imageUrl ?? "", /\/DRI\/DRI_176_R_EN_LG\.png$/);
  assert.equal(lastDitchCatch.transaction?.stages[1].cards[0].name, "Team Rocket's Petrel");

  assert.equal(secondPilot.events[44].sourceTitle, "Guintu's Budew used Itchy Pollen on B3xCharz24’s Drakloak for 10 damage.");
  assert.equal(secondPilot.frames[45].self.itemLocked, true);
  assert.equal(secondPilot.frames[46].self.itemLocked, true);
  assert.equal(secondPilot.frames[56].self.itemLocked, false);

  assert.ok(secondPilot.events[52].transaction?.stages.every((stage) =>
    !stage.detail?.includes("B3xCharz24") && !stage.detail?.includes("Guintu")
  ));
  assert.deepEqual(secondPilot.events[60].transaction?.stages.map((stage) => stage.label), [
    "Adrena-Brain",
    "From Drakloak",
    "To Dragapult ex",
  ]);
  const splitCounterAttack = secondPilot.events[73];
  const fezandipitiStage = splitCounterAttack.transaction?.stages.at(-1);
  assert.equal(fezandipitiStage?.cards[0].id, secondPilot.frames[74].opponent.bench.find(
    (card) => card.name === "Fezandipiti ex",
  )?.id);
  assert.equal(resolveBoardCardPreview(
    fezandipitiStage!.cards[0],
    fezandipitiStage!,
    "self",
    secondPilot.frames[74],
    secondPilot.frames[73],
  ).damage, 10);
  const impossibleCounterAttack = secondPilot.events[80];
  const unresolvedDrakloakStage = impossibleCounterAttack.transaction?.stages.at(-1);
  const survivingDrakloak = secondPilot.frames[81].self.bench.find(
    (card) => card.name === "Drakloak",
  );
  assert.equal(unresolvedDrakloakStage?.targetResolved, false);
  assert.equal(survivingDrakloak?.damage, 60);
  assert.equal(resolveBoardCardPreview(
    unresolvedDrakloakStage!.cards[0],
    unresolvedDrakloakStage!,
    "opponent",
    secondPilot.frames[81],
    secondPilot.frames[80],
  ).damage, undefined);
  assert.ok(secondPilot.frames.slice(81, 104).every((frame) =>
    frame.self.bench.every((card) => card.damage < card.hp)
  ));
  secondPilot.events.forEach((event, index) => {
    if (!event.sourceTitle.includes("used Phantom Dive")) return;
    const defendingActor: ReplayActor = event.actor === "self" ? "opponent" : "self";
    const defendingIds = new Set([
      secondPilot.frames[index + 1][defendingActor].active,
      ...secondPilot.frames[index + 1][defendingActor].bench,
    ].flatMap((card) => card ? [card.id] : []));
    event.transaction?.stages.slice(2).forEach((stage) => {
      if (stage.targetResolved === false) return;
      assert.ok(defendingIds.has(stage.cards[0].id));
    });
  });
  const laterAdrenaBrain = secondPilot.events[97];
  assert.equal(laterAdrenaBrain.sourceTitle, "Guintu's Munkidori used Adrena-Brain.");
  assert.equal(secondPilot.frames[98].self.bench.find(
    (card) => card.name === "Drakloak",
  )?.damage, 80);
  assert.equal(secondPilot.frames[104].self.bench.find(
    (card) => card.name === "Dragapult ex" && card.id === survivingDrakloak?.id,
  )?.damage, 80);
  const evidencedLethalPlacement = secondPilot.events[108].transaction?.stages.at(-1);
  assert.notEqual(evidencedLethalPlacement?.targetResolved, false);
  const knockedOutDreepy = secondPilot.frames[109].opponent.bench.find(
    (card) => card.name === "Dreepy",
  );
  assert.ok(knockedOutDreepy && knockedOutDreepy.damage >= knockedOutDreepy.hp);
  assert.equal(secondPilot.frames[111].opponent.bench.some(
    (card) => card.name === "Dreepy",
  ), false);
  const secondPilotFinal = secondPilot.frames.at(-1)!;
  assert.equal(secondPilotFinal.self.prizesRemaining, 0);
  assert.equal(secondPilotFinal.opponent.prizesRemaining, 2);

  const burnPilot = replayPilots.find((pilot) => pilot.id === "burn-2026-09-08");
  assert.ok(burnPilot);
  const burnAppliedIndex = burnPilot.events.findIndex((event) =>
    event.sourceDetails.some((detail) => detail.includes("is now Burned"))
  );
  const burnDamageIndex = burnPilot.events.findIndex((event) =>
    event.sourceTitle.includes("for the Special Condition Burned")
  );
  const burnRecoveredIndex = burnPilot.events.findIndex((event) =>
    event.sourceTitle.includes("is no longer Burned")
  );
  const burnRecoveryFlipIndex = burnPilot.events.findIndex((event) =>
    event.sourceTitle.includes("flipped a coin and it landed on")
  );
  const factoryPlayedIndex = burnPilot.events.findIndex((event) =>
    event.sourceTitle.includes("played Team Rocket's Factory to the Stadium spot")
  );
  assert.ok(burnAppliedIndex >= 0 && burnDamageIndex > burnAppliedIndex && burnRecoveredIndex > burnDamageIndex);
  assert.ok(factoryPlayedIndex >= 0);
  assert.match(
    burnPilot.frames[factoryPlayedIndex + 1].stadium?.imageUrl ?? "",
    /\/DRI\/DRI_173_R_EN_LG\.png$/,
  );
  assert.ok(burnRecoveryFlipIndex > burnDamageIndex);
  assert.deepEqual(resolveResultOnlyCoinFlip(burnPilot.events[burnRecoveryFlipIndex]), {
    actor: "self",
    result: "heads",
  });
  assert.equal(resolveResultOnlyCoinFlip(burnPilot.events[0]), null);
  assert.deepEqual(burnPilot.frames[burnAppliedIndex + 1].self.active?.conditions, ["Burned"]);
  assert.equal(
    burnPilot.frames[burnDamageIndex + 1].self.active?.damage,
    (burnPilot.frames[burnDamageIndex].self.active?.damage ?? 0) + 20,
  );
  assert.deepEqual(burnPilot.frames[burnDamageIndex + 1].self.active?.conditions, ["Burned"]);
  assert.deepEqual(burnPilot.frames[burnRecoveredIndex + 1].self.active?.conditions, []);
  assert.equal(burnPilot.events[burnDamageIndex].transaction?.stages[0]?.actor, "self");
  assert.equal(burnPilot.events[burnDamageIndex].transaction?.stages[0]?.label, "20 damage");
});
