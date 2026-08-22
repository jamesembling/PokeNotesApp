import assert from "node:assert/strict";
import test from "node:test";
import {
  buildStrategyWorkspaceState,
  moveStrategyNote,
  parseStrategyNoteText,
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
});

