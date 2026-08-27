import assert from "node:assert/strict";
import test from "node:test";
import {
  buildStrategyWorkspaceState,
  type MatchupPlanState,
  moveStrategyNoteBetweenLanes,
  moveStrategyNote,
  parseMatchupPlan,
  parseStrategyNoteText,
  serializeMatchupPlan,
  serializeStrategyNotes
} from "./strategy-workspace";

test("existing strategy text becomes ordered notes without blank rows", () => {
  assert.deepEqual(parseStrategyNoteText("Set up early\n\n  Keep one attacker ready  "), [
    "Set up early",
    "Keep one attacker ready"
  ]);
});

test("workspace lanes map to the existing persisted strategy fields", () => {
  assert.deepEqual(
    buildStrategyWorkspaceState({
      coreStrategy: "Set up early\nControl tempo",
      generalNotes: "Check counts",
      goPreference: "First",
      resourcePlan: "Test recovery card",
      setupGoals: ["Leave one space open"]
    }),
    {
      goPreference: "First",
      lanes: {
        gamePlan: ["Set up early", "Control tempo"],
        benchPlan: ["Leave one space open"],
        tech: ["Test recovery card"],
        unsorted: ["Check counts"]
      }
    }
  );
});

test("note serialization and ordering preserve the visible lane order", () => {
  const reordered = moveStrategyNote(["First", "Second", "Third"], 2, 0);

  assert.deepEqual(reordered, ["Third", "First", "Second"]);
  assert.equal(serializeStrategyNotes(reordered), "Third\nFirst\nSecond");

  const phasedPlan: MatchupPlanState = {
    phases: {
      earlyGame: ["Open with Cleffa"],
      midGame: ["Set up the second attacker"],
      lateGame: []
    },
    strategyNotes: ["Respect their comeback turn"]
  };
  const movedPhases = moveStrategyNoteBetweenLanes(
    phasedPlan.phases,
    "earlyGame",
    0,
    "lateGame",
    0
  );
  const serializedPlan = serializeMatchupPlan({
    ...phasedPlan,
    phases: movedPhases
  });

  assert.deepEqual(parseMatchupPlan(serializedPlan), {
    phases: {
      earlyGame: [],
      midGame: ["Set up the second attacker"],
      lateGame: ["Open with Cleffa"]
    },
    strategyNotes: ["Respect their comeback turn"]
  });
  assert.deepEqual(parseMatchupPlan(serializedPlan.replace("\n", "\r\n")), {
    phases: {
      earlyGame: [],
      midGame: ["Set up the second attacker"],
      lateGame: ["Open with Cleffa"]
    },
    strategyNotes: ["Respect their comeback turn"]
  });
  assert.deepEqual(parseMatchupPlan("Legacy plan\nSecond note"), {
    phases: { earlyGame: [], midGame: [], lateGame: [] },
    strategyNotes: ["Legacy plan", "Second note"]
  });
});
