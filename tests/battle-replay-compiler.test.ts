import assert from "node:assert/strict";
import test from "node:test";
import { compileBattleReplay, type ReplayLogSource } from "@/lib/battle-replay/compiler";
import type { LogAction, LogSection } from "@/types/index";

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
test("saved Battle Log actions compile into deterministic source-faithful frames", () => {
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

// 10/10: malformed/unsupported action details and duplicate physical targets must
// not produce an apparently successful but invented board transition.
test("unsupported details and ambiguous targets preserve the last evidenced board", () => {
  const replay = compileBattleReplay(source([
    section("", [
      action("PlayerOne played Seedling to the Active Spot."),
      action("PlayerOne played Twin to the Bench."),
      action("PlayerOne played Twin to the Bench."),
    ]),
    section("PlayerOne", [
      action("PlayerOne played Supply.", ["- PlayerOne reordered every future draw."]),
      action("PlayerOne attached Basic Grass Energy to Twin on the Bench."),
      action("PlayerOne's Seedling used its Ability Gather.", ["- PlayerOne attached Basic Grass Energy to Seedling in the Active Spot."]),
      action("PlayerOne drew a card."),
      action("PlayerOne's Seedling used Phantom Dive for 200 damage."),
      action("PlayerOne's Seedling used Gather."),
      action("PlayerOne shuffled 2 cards into their deck.", ["• Seedling, Supply"]),
    ]),
  ]));
  assert.equal(replay.events.length, 10);
  assert.deepEqual(replay.diagnostics.unresolvedActions, [3, 4, 5, 7, 8, 9]);
  assert.equal(replay.diagnostics.unresolvedMutations, 6);
  assert.match(replay.events[3].unresolved?.[0] ?? "", /Unresolved detail/);
  assert.match(replay.events[4].unresolved?.[0] ?? "", /which Twin/);
  assert.match(replay.events[5].unresolved?.[0] ?? "", /origin/);
  assert.deepEqual(replay.frames[4], { ...replay.frames[3], partial: true });
  assert.deepEqual(replay.frames[5], replay.frames[4]);
  assert.deepEqual(replay.frames[6], replay.frames[5]);
  assert.equal(replay.frames[7].partial, true);
  assert.deepEqual(replay.frames[7].self.active?.energy, []);
  assert.equal(replay.frames[7].self.handCount, null);
  assert.equal(replay.frames[7].self.knownHand.length, 0, "a hidden draw must stay hidden");
  assert.equal(replay.status, "partial");
  assert.ok(replay.events[4].transaction === undefined, "unsafe attachment overlays must not imply success");
  assert.match(replay.events[7].unresolved?.[0] ?? "", /supported attack/);
  assert.equal(replay.events[7].label, "Action");
  assert.equal(replay.events[7].transaction, undefined);
  assert.deepEqual(replay.frames[8], replay.frames[7]);
  assert.equal(replay.frames[8].self.active?.abilityUsed, false, "an unsupported attack cannot mark an Ability used");
  assert.deepEqual(replay.frames[9], replay.frames[8], "an unlabelled use cannot assert an Ability either");
  assert.match(replay.events[9].unresolved?.[0] ?? "", /origin/);
  assert.deepEqual(replay.frames[10], replay.frames[9], "an unspecified shuffle cannot choose the hand as its origin");

  const knownHandShuffle = compileBattleReplay(source([section("", [
    action("PlayerOne drew 2 cards for the opening hand.", ["• Supply, Seedling"]),
    action("PlayerOne shuffled 2 cards into their deck.", ["• Supply, Seedling"]),
  ])]));
  assert.equal(knownHandShuffle.frames[2].self.handCount, 2);
  assert.deepEqual(knownHandShuffle.frames[2].self.knownHand.map((card) => card.name), ["Supply", "Seedling"]);
  assert.equal(knownHandShuffle.frames[2].self.deckCount, null);
  assert.ok(knownHandShuffle.events[1].unresolved?.length);
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
