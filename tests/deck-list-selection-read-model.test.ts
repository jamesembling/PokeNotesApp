import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDeckListSelectionOptions,
  type DeckListSelectionSource
} from "@/lib/db/deck-lists";

test("selection options are flat account-owned records with nullable strategy ownership", () => {
  const sources: DeckListSelectionSource[] = [
    {
      deckId: null,
      deckName: null,
      id: "standalone",
      name: "Standalone list",
      selectionKey: '[null,"standalone"]'
    },
    {
      deckId: "deck-1",
      deckName: "Dragapult plan",
      id: "associated",
      name: "League list",
      selectionKey: '["deck-1","associated"]'
    }
  ];

  assert.deepEqual(buildDeckListSelectionOptions(sources), sources);
});

test("duplicate legacy identities under one strategy are not silently adopted", () => {
  const sources: DeckListSelectionSource[] = [
    { deckId: "deck-a", deckName: "A", id: "duplicate", name: "A copy" },
    { deckId: "deck-a", deckName: "A", id: "duplicate", name: "A second copy" }
  ];

  assert.deepEqual(buildDeckListSelectionOptions(sources), []);
});
