import assert from "node:assert/strict";
import test from "node:test";
import { compileBattleReplay, type ReplayLogSource } from "@/lib/battle-replay/compiler";
import type { LogAction, LogSection } from "@/types/index";
import type { ReplayCard, ReplaySide } from "@/lib/battle-replay/types";
import { collectMissingReplayArtworkNames, resolveReplayArtwork, selectReplayArtworkPrinting } from "@/lib/battle-replay/artwork";
import { resolveEnergyMarkers } from "@/lib/battle-replay/preview";
import { canonicalReplayGame, expectedGameChanges, type ExpectedSide } from "./fixtures/battle-replay-game";

const action = (title: string, details: string[] = []): LogAction => ({ title, details });
const section = (player: string, actions: LogAction[]): LogSection => ({
  title: player ? `${player}'s Turn` : "Setup", player, actions,
  prizesAfterTurn: { PlayerOne: 6, PlayerTwo: 6 },
});

function source(sections: LogSection[]): ReplayLogSource {
  return {
    id: "synthetic-owned-log", date: "2026-10-01", result: "Unknown", format: "Synthetic",
    selfPlayerName: "PlayerOne", opponentPlayerName: "PlayerTwo", selfDeckName: "First deck", opponentDeckName: "Second deck",
    selfPrizesTaken: 1, opponentPrizesTaken: 0, totalTurns: 1, sections,
  };
}

// 9/10: direct production compiler boundary; independent expected frames protect
// ordering, recorded transitions and the serializable Server Component contract.
test("saved Battle Log actions compile into deterministic source-faithful frames", async () => {
  const complete = compileBattleReplay(canonicalReplayGame);
  const projectCard = (card: ReplayCard | null) => card && ({
    name: card.name, damage: card.damage, energy: card.energy,
    underlying: card.underlying.map((item) => item.name), conditions: card.conditions ?? [], tool: card.tool ?? null,
  });
  const projectSide = (side: ReplaySide) => ({
    active: projectCard(side.active), bench: side.bench.map(projectCard), hand: side.handCount,
    known: side.knownHand.map((card) => card.name), discard: side.discard.map((card) => card.name),
  });
  const blank: ExpectedSide = { active: null, bench: [], hand: null, known: [], discard: [] };
  let expected = { self: structuredClone(blank), opponent: structuredClone(blank), stadium: null as string | null };
  const expectedFrames = [structuredClone(expected)];
  for (const change of expectedGameChanges) {
    expected = { self: { ...expected.self, ...change.self }, opponent: { ...expected.opponent, ...change.opponent }, stadium: change.stadium === undefined ? expected.stadium : change.stadium };
    expectedFrames.push(structuredClone(expected));
  }
  assert.equal(complete.frames.length, expectedFrames.length);
  complete.frames.forEach((frame, index) => {
    assert.deepEqual({ self: projectSide(frame.self), opponent: projectSide(frame.opponent), stadium: frame.stadium?.name ?? null }, expectedFrames[index], `frame ${index}: ${complete.events[index - 1]?.sourceTitle ?? "initial"}`);
    assert.equal(frame.self.deckCount, null, "a log without a deck count cannot invent one");
    assert.equal(frame.opponent.deckCount, null);
    for (const side of [frame.self, frame.opponent]) for (const card of [side.active, ...side.bench]) if (card) assert.equal(card.hp, null);
  });
  assert.deepEqual(complete.diagnostics.unresolvedActions, []);
  assert.deepEqual(complete, compileBattleReplay(canonicalReplayGame));
  const serialized = JSON.parse(JSON.stringify(complete));
  for (const position of [34, 0, 22, 7, 26, 34, 1]) assert.deepEqual(serialized.frames[position], complete.frames[position], "seeking never recomputes or changes the immutable recorded frame");
  assert.equal(complete.frames[7].self.active?.abilityUsed, true);
  assert.equal(complete.frames[28].self.prizesRemaining, 5);
  assert.deepEqual(resolveEnergyMarkers(["Grass", "Grass", "Grass", "Grass", "Grass", "Fire"]), [{ type: "Grass", count: 5 }, { type: "Fire", count: 1 }]);
  assert.deepEqual(resolveEnergyMarkers(Array(6).fill("Grass")), [{ type: "Grass", count: 6 }]);
  assert.deepEqual(resolveEnergyMarkers(["Grass", "Grass", "Grass", "Double Turbo Energy", "Double Turbo Energy", "Double Turbo Energy"]), [{ type: "Grass", count: 3 }, { type: "Double Turbo Energy", count: 3 }]);
  assert.deepEqual(resolveEnergyMarkers(["Grass", "Fire"]), [{ type: "Grass" }, { type: "Fire" }]);
  assert.deepEqual(resolveEnergyMarkers([]), []);
  const plain = { name: "Seedling", set: "TWM", number: "1" };
  assert.equal(selectReplayArtworkPrinting("Seedling", [{ ...plain, name: "Seedling ex" }]), null);
  assert.deepEqual(selectReplayArtworkPrinting("Seedling", [{ ...plain, name: "Seedling ex" }, plain]), plain);
  const artSource = compileBattleReplay(source([section("", [
    action("PlayerOne played Seedling to the Active Spot."),
    action("PlayerOne played Seedling to the Bench."),
    action("PlayerTwo played Other to the Active Spot."),
  ])]));
  assert.deepEqual(collectMissingReplayArtworkNames(artSource), ["Seedling", "Other"]);
  const lookedUp: string[] = [];
  const originalArtSource = structuredClone(artSource);
  const artwork = await resolveReplayArtwork(artSource, async (name) => {
    lookedUp.push(name);
    if (name === "Other") throw new Error("Synthetic provider unavailable");
    return [plain];
  });
  assert.deepEqual(lookedUp.sort(), ["Other", "Seedling"], "duplicate frame identities need only one exact-name artwork lookup");
  assert.deepEqual(Object.keys(artwork), ["Seedling"]);
  assert.match(artwork.Seedling, /TWM_001_R_EN_LG\.png$/);
  assert.deepEqual(artSource, originalArtSource, "representative artwork must not rewrite recorded identity or HP");

  const originTitle = "PlayerOne's Seedling used Recover.";
  const movementSource = source([section("", [
    action("PlayerOne drew 7 cards for the opening hand.", ["• Seedling, Basic Grass Energy, Supply, Buddy, Sprout, Forest Seal Stone, Double Turbo Energy"]),
    action("PlayerOne played Seedling to the Active Spot."),
    action("PlayerOne discarded a card.", ["- Basic Grass Energy"]),
    action(originTitle, ["PlayerOne attached Basic Grass Energy to Seedling in the Active Spot."]),
    action("PlayerOne played Buddy to the Bench."),
    action("PlayerOne's Seedling is now Paralyzed."),
    action("PlayerOne's Buddy was switched with PlayerOne's Seedling to become the Active Pokémon.", ["PlayerOne's Buddy is now in the Active Spot."]),
    action("PlayerOne evolved Seedling to Sprout on the Bench."),
    action("PlayerOne attached Forest Seal Stone to Sprout on the Bench."),
    action("PlayerOne attached Double Turbo Energy to Sprout on the Bench."),
    action("PlayerOne's Sprout was Knocked Out!", ["3 cards were discarded from PlayerOne's Sprout.", "• Basic Grass Energy, Double Turbo Energy, Forest Seal Stone"]),
    action("PlayerOne moved Seedling from their discard pile to their hand."),
    action("PlayerOne shuffled Double Turbo Energy from their discard pile into their deck."),
  ])]);
  const movements = compileBattleReplay({ ...movementSource,
    effectTags: { [originTitle]: "ability", "PlayerOne attached Forest Seal Stone to Sprout on the Bench.": "tool" },
    effectOrigins: { [originTitle]: "discard" },
  });
  assert.deepEqual(movements.frames[4].self.active?.energy, ["Grass"]);
  assert.deepEqual(movements.frames[4].self.discard, []);
  assert.equal(movements.frames[4].self.handCount, 5, "catalog-proven discard attachment must not also debit hand");
  assert.equal(movements.frames[7].self.active?.name, "Buddy");
  assert.deepEqual(movements.frames[7].self.bench.map((card) => card.name), ["Seedling"]);
  assert.deepEqual(movements.frames[7].self.bench[0].conditions, [], "switching clears the outgoing Pokémon's conditions");
  assert.deepEqual(movements.frames[11].self.discard.map((card) => card.name), ["Sprout", "Seedling", "Basic Grass Energy", "Double Turbo Energy", "Forest Seal Stone"], "KO and its explicit attachment detail must discard each physical card once");
  assert.deepEqual(movements.frames[12].self.discard.map((card) => card.name), ["Sprout", "Basic Grass Energy", "Double Turbo Energy", "Forest Seal Stone"]);
  assert.deepEqual(movements.frames[13].self.discard.map((card) => card.name), ["Sprout", "Basic Grass Energy", "Forest Seal Stone"]);
  assert.equal(movements.frames[13].self.deckCount, null);
  assert.deepEqual(movements.diagnostics.unresolvedActions, []);

  const input = source([
    section("", [
      action("PlayerOne chose heads for the opening coin flip.", ["PlayerOne won the coin toss."]),
      action("PlayerOne decided to go first.", [
        "PlayerOne drew 7 cards for the opening hand.", "- 7 drawn cards.",
        "• Seedling, Sprout, Basic Grass Energy, Supply, Seedling, Supply, Supply",
        "PlayerTwo drew 7 cards for the opening hand.", "- 7 drawn cards.",
      ]),
      action("PlayerOne played Seedling to the Active Spot."),
      action("PlayerTwo played Rival to the Active Spot."),
    ]),
    { ...section("PlayerOne", [
      action("PlayerOne drew Supply."),
      action("PlayerOne attached Basic Grass Energy to Seedling in the Active Spot."),
      action("PlayerOne's Seedling is now Poisoned."),
      action("PlayerOne evolved Seedling to Sprout in the Active Spot."),
      action("PlayerOne's Sprout used Tap on PlayerTwo’s Rival for 20 damage."),
      action("PlayerTwo's Rival was Knocked Out!"),
      action("PlayerOne took a Prize card.", ["Supply was added to PlayerOne's hand."]),
    ]), prizesAfterTurn: { PlayerOne: 5, PlayerTwo: 6 } },
    { ...section("PlayerTwo", [
      action("PlayerTwo drew a card."),
      action("PlayerTwo played Replacement to the Active Spot."),
      action("PlayerTwo ended their turn."),
    ]), prizesAfterTurn: { PlayerOne: 5, PlayerTwo: 6 } },
    { ...section("PlayerOne", [
      action("PlayerOne's Sprout used its Ability Gather."),
      action("PlayerOne shuffled 2 cards from their hand into their deck.", ["• Supply, Seedling"]),
    ]), prizesAfterTurn: { PlayerOne: 5, PlayerTwo: 6 } },
  ]);
  const before = structuredClone(input);
  const replay = compileBattleReplay(input);
  assert.deepEqual(input, before, "compilation must not mutate the saved record");
  assert.deepEqual(replay, compileBattleReplay(input));
  assert.deepEqual(JSON.parse(JSON.stringify(replay)), replay, "no functions or undefined values cross the renderer boundary");
  assert.equal(replay.events.length, 16);
  assert.equal(replay.frames.length, 17);
  assert.deepEqual(replay.events.map((event) => event.sourceTitle), input.sections.flatMap((part) => part.actions.map((item) => item.title)));
  assert.deepEqual(replay.events[1].sourceDetails, input.sections[0].actions[1].details);
  assert.deepEqual(replay.events.map((event) => event.sourceSectionIndex), [0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 3, 3]);
  assert.equal(replay.events[4].turn, replay.events[11].turn, "both players have a first turn");
  assert.notEqual(replay.events[4].sourceSectionIndex, replay.events[11].sourceSectionIndex);
  assert.equal(replay.events[9].actor, "opponent", "an opponent knockout can happen inside the owner's turn");
  assert.equal(replay.events[9].sourceSectionIndex, replay.events[8].sourceSectionIndex);
  assert.equal(replay.source.result, "Unknown");
  assert.equal(replay.source.playedOn, "2026-10-01");
  assert.deepEqual(replay.diagnostics.unresolvedActions, []);
  assert.equal(replay.frames[0].self.handCount, null);
  assert.equal(replay.frames[0].self.deckCount, null);
  assert.equal(replay.frames[2].self.handCount, 7);
  assert.equal(replay.frames[4].self.handCount, 6);
  assert.deepEqual(replay.frames[7].self.active?.conditions, ["Poisoned"]);
  const evolved = replay.frames[8].self.active;
  assert.equal(evolved?.name, "Sprout");
  assert.equal(evolved?.id, replay.frames[3].self.active?.id);
  assert.deepEqual(evolved?.underlying.map((card) => card.name), ["Seedling"]);
  assert.deepEqual(evolved?.energy, ["Grass"]);
  assert.deepEqual(evolved?.conditions, []);
  assert.equal(evolved?.hp, null);
  assert.equal(evolved?.imageUrl, "");
  assert.equal(replay.frames[9].opponent.active?.damage, 20);
  assert.equal(replay.frames[10].opponent.active, null);
  assert.deepEqual(replay.frames[10].opponent.discard.map((card) => card.name), ["Rival"]);
  assert.equal(replay.frames[11].self.prizesRemaining, 5);
  assert.equal(replay.frames[11].self.handCount, 6);
  assert.equal(replay.events[14].label, "Ability");
  assert.equal(replay.frames[15].self.active?.abilityUsed, true);
  assert.equal(replay.frames[16].self.handCount, 4, "an explicitly recorded hand shuffle can move hand cards");
  assert.ok(replay.frames[16].self.knownHand.every((card) => card.name === "Supply"));
  assert.equal(replay.status, "partial", "unknown HP and deck count remain explicit limitations");
});

// 10/10: uncertainty must prevent invented state while independent explicit
// evidence survives and later exact zone facts can recover useful reconstruction.
test("unsupported details and ambiguous targets preserve evidence and expose uncertainty", () => {
  const twins = compileBattleReplay(source([
    section("", [
      action("PlayerOne played Seedling to the Active Spot."),
      action("PlayerOne played Twin to the Bench."),
      action("PlayerOne played Twin to the Bench."),
    ]),
    section("PlayerOne", [
      action("PlayerOne attached Basic Grass Energy to Twin on the Bench."),
      action("PlayerOne attached Basic Fire Energy to Twin on the Bench."),
      action("PlayerOne's Seedling used its Ability Gather.", ["- PlayerOne attached Basic Grass Energy to Seedling in the Active Spot.", "- PlayerOne drew Supply."]),
    ]),
  ]));
  assert.equal(twins.events[3].unresolved, undefined, "identical bare copies have equivalent visible outcomes");
  assert.deepEqual(twins.frames[4].self.bench.map((card) => card.energy), [["Grass"], []]);
  assert.match(twins.events[4].unresolved?.[0] ?? "", /which Twin/);
  assert.deepEqual(twins.frames[5].self.bench.map((card) => card.energy), [["Grass"], []], "distinct physical copies must not be guessed");
  assert.ok(twins.frames[5].self.uncertainZones?.includes("board"));
  assert.equal(twins.events[4].transaction, undefined, "a rejected attachment cannot animate as successful");
  assert.match(twins.events[5].unresolved?.[0] ?? "", /origin/);
  assert.equal(twins.frames[6].self.active?.abilityUsed, true, "the explicit Ability itself remains evidenced");
  assert.deepEqual(twins.frames[6].self.active?.energy, []);
  assert.deepEqual(twins.frames[6].self.knownHand.map((card) => card.name), ["Supply"], "a later independent draw survives an unsupported attachment detail");

  const recovery = compileBattleReplay(source([section("PlayerOne", [
    action("PlayerOne drew 3 cards for the opening hand.", ["• Seedling, Supply, Supply"]),
    action("PlayerOne played Seedling to the Active Spot."),
    action("PlayerOne rearranged unknown cards in their hand."),
    action("PlayerOne drew Supply."),
    action("PlayerOne shuffled their hand into their deck."),
    action("PlayerOne drew 2 cards.", ["- Seedling, Supply"]),
    action("PlayerOne played Seedling to the Bench."),
    action("PlayerOne conceded the game."),
  ])]));
  assert.equal(recovery.frames[2].self.handCount, 2);
  assert.equal(recovery.frames[3].self.handCount, null, "an unsupported hand mutation must not leave an exact stale count");
  assert.deepEqual(recovery.frames[3].self.knownHand, []);
  assert.equal(recovery.frames[4].self.handCount, null);
  assert.deepEqual(recovery.frames[4].self.knownHand.map((card) => card.name), ["Supply"]);
  assert.equal(recovery.frames[5].self.handCount, 0);
  assert.deepEqual(recovery.frames[5].self.knownHand, []);
  assert.equal(recovery.frames[6].self.handCount, 2);
  assert.deepEqual(recovery.frames[6].self.knownHand.map((card) => card.name), ["Seedling", "Supply"]);
  assert.equal(recovery.frames[7].self.handCount, 1);
  assert.deepEqual(recovery.frames[7].self.bench.map((card) => card.name), ["Seedling"]);
  assert.ok(!recovery.frames[7].self.uncertainZones?.includes("hand"), "an entire-hand replacement restores hand certainty");
  assert.equal(recovery.frames[7].self.deckCount, null);
  assert.deepEqual(recovery.diagnostics.unresolvedActions, [2]);

  for (const detail of [
    "PlayerOne healed 10 damage from PlayerOne's Seedling.",
    "PlayerOne healed 10 damage from PlayerOne's Seedling",
    "- PlayerOne healed 10 damage from PlayerOne's Seedling.",
    "• PlayerOne healed 10 damage from PlayerOne's Seedling",
  ]) {
    const independentDetails = compileBattleReplay(source([section("PlayerOne", [
      action("PlayerOne played Seedling to the Active Spot."),
      action("PlayerOne put 2 damage counters on PlayerOne's Seedling."),
      action("PlayerOne's Seedling used its Ability Gather.", ["PlayerOne drew 2 cards.", detail]),
    ])]));
    assert.deepEqual(independentDetails.frames[3].self.knownHand, [], "a following operation is never a drawn card's identity");
    assert.equal(independentDetails.frames[3].self.active?.damage, 10, "the independent healing detail must execute after a hidden draw");
    assert.deepEqual(independentDetails.diagnostics.unresolvedActions, []);
  }

  const staleHand = compileBattleReplay(source([section("PlayerOne", [
    action("PlayerOne drew 2 cards for the opening hand.", ["• Seedling, Supply"]),
    action("PlayerOne played Twin to the Bench."),
    action("PlayerOne attached Basic Grass Energy to Twin on the Bench."),
  ])]));
  assert.deepEqual(staleHand.frames[2].self.bench.map((card) => card.name), ["Twin"], "a stale hand cannot erase an explicitly recorded board placement");
  assert.equal(staleHand.frames[2].self.handCount, null);
  assert.deepEqual(staleHand.frames[2].self.knownHand, []);
  assert.deepEqual(staleHand.frames[3].self.bench[0]?.energy, ["Grass"], "subsequent recorded actions remain usable after count drift");

  const canonicalTitle = "PlayerOne's Seedling used Gather.";
  const usedSource = source([section("PlayerOne", [
    action("PlayerOne played Seedling to the Active Spot."),
    action(canonicalTitle, ["PlayerOne drew Supply."]),
  ])]);
  const unavailableMetadata = compileBattleReplay(usedSource);
  assert.ok(unavailableMetadata.events[1].unresolved?.length);
  assert.equal(Boolean(unavailableMetadata.frames[2].self.active?.abilityUsed), false);
  assert.deepEqual(unavailableMetadata.frames[2].self.knownHand.map((card) => card.name), ["Supply"]);
  const ability = compileBattleReplay({ ...usedSource, effectTags: { [canonicalTitle]: "ability" } });
  assert.equal(ability.events[1].label, "Ability");
  assert.equal(ability.frames[2].self.active?.abilityUsed, true);
  assert.deepEqual(ability.diagnostics.unresolvedActions, []);
  const attack = compileBattleReplay({ ...usedSource, effectTags: { [canonicalTitle]: "attack" } });
  assert.equal(attack.events[1].label, "Attack");
  assert.equal(Boolean(attack.frames[2].self.active?.abilityUsed), false, "catalogued attacks cannot silently become Abilities");

  const unresolvedShuffle = compileBattleReplay(source([section("PlayerOne", [
    action("PlayerOne drew 2 cards for the opening hand.", ["• Supply, Seedling"]),
    action("PlayerOne shuffled 2 cards into their deck.", ["• Supply, Seedling"]),
  ])]));
  assert.ok(unresolvedShuffle.events[1].unresolved?.length);
  assert.equal(unresolvedShuffle.frames[2].self.handCount, null, "missing shuffle origin cannot select hand or preserve its old exact count");
  assert.deepEqual(unresolvedShuffle.frames[2].self.knownHand, []);
  assert.equal(unresolvedShuffle.frames[2].self.deckCount, null);

  const contradictions = compileBattleReplay(source([section("PlayerOne", [
    action("PlayerOne played Seedling to the Active Spot."),
    action("PlayerTwo played Rival to the Active Spot."),
    action("PlayerOne's Seedling used Tap on PlayerTwo's Rival for 20 damage.", ["Damage breakdown:", "Total damage: 40 damage", "PlayerOne drew Supply."]),
  ])]));
  assert.ok(contradictions.events[2].unresolved?.length);
  assert.equal(contradictions.frames[3].opponent.active?.damageKnown, false, "contradictory attack totals cannot display certain damage");
  assert.deepEqual(contradictions.frames[3].self.knownHand.map((card) => card.name), ["Supply"]);
  assert.equal(contradictions.status, "partial");
});

// 9/10: the compiler's public input seam must reject unusable and over-budget
// saved sources without throwing, truncating their story or substituting a pilot.
test("unusable and oversized saved sources return an unavailable replay", () => {
  const empty = compileBattleReplay(source([]));
  assert.equal(empty.status, "unsupported");
  assert.equal(empty.events.length, 0);
  assert.equal(empty.frames.length, 1);
  const invalid = source([section("", [action("PlayerOne drew a card.")])]);
  Reflect.set(invalid.sections[0].actions[0], "details", null);
  assert.equal(compileBattleReplay(invalid).status, "unsupported");
  assert.equal(compileBattleReplay({ ...source([]), selfPlayerName: "" }).status, "unsupported");
  const oversized = compileBattleReplay(source([section("PlayerOne", Array.from({ length: 601 }, () => action("PlayerOne drew a card.")))]));
  assert.equal(oversized.status, "unsupported");
  assert.equal(oversized.events.length, 0);
  assert.match(oversized.diagnostics.messages[0], /limit/);
  const foreignLanguage = compileBattleReplay(source([section("PlayerOne", [action("PlayerOne zieht eine Karte.")])]));
  assert.equal(foreignLanguage.status, "unsupported");
  assert.equal(foreignLanguage.events.length, 1, "unknown-language actions remain available as source evidence");
  assert.ok(foreignLanguage.events[0].unresolved?.length);
  assert.equal(foreignLanguage.frames[1].self.handCount, null);
});
