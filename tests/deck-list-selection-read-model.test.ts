import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDeckListSelectionOptions,
  type DeckListSelectionSource
} from "@/lib/db/deck-lists";
import {
  makeDeckListSelectionKey,
  selectDeck,
  selectDeckList,
  type DeckListSelectionState
} from "@/lib/log-import/deck-list-selection";
import type { DeckListSelectionOption } from "@/types/index";

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

test("same-id lists remain distinct across strategies and standalone ownership", () => {
  const strategyA = makeDeckListSelectionKey({ deckId: "strategy-a", deckListId: "shared" });
  const strategyB = makeDeckListSelectionKey({ deckId: "strategy-b", deckListId: "shared" });
  const standalone = makeDeckListSelectionKey({ deckId: null, deckListId: "shared" });
  const options: DeckListSelectionOption[] = [
    { deckId: "strategy-a", deckName: "A", id: "shared", name: "A list", selectionKey: strategyA },
    { deckId: "strategy-b", deckName: "B", id: "shared", name: "B list", selectionKey: strategyB },
    { deckId: null, deckName: null, id: "shared", name: "Standalone", selectionKey: standalone }
  ];
  const empty: DeckListSelectionState = { deckId: "", deckListId: "", selectionKey: "" };

  assert.notEqual(strategyA, strategyB);
  assert.deepEqual(selectDeckList(empty, strategyA, options), {
    deckId: "strategy-a",
    deckListId: "shared",
    selectionKey: strategyA
  });
  assert.deepEqual(selectDeckList(empty, strategyB, options), {
    deckId: "strategy-b",
    deckListId: "shared",
    selectionKey: strategyB
  });
  assert.deepEqual(selectDeckList(empty, standalone, options), {
    deckId: "",
    deckListId: "shared",
    selectionKey: standalone
  });
});

test("changing strategy clears a Deck List selection that no longer matches", () => {
  const options: DeckListSelectionOption[] = [
    { deckId: null, deckName: null, id: "standalone", name: "Standalone" },
    { deckId: "strategy-a", deckName: "A", id: "list-a", name: "A list" }
  ];

  assert.deepEqual(
    selectDeck(
      { deckId: "strategy-a", deckListId: "standalone", selectionKey: '[null,"standalone"]' },
      "strategy-a",
      options
    ),
    { deckId: "strategy-a", deckListId: "", selectionKey: "" }
  );
  assert.deepEqual(
    selectDeck(
      { deckId: "strategy-a", deckListId: "list-a", selectionKey: '["strategy-a","list-a"]' },
      "",
      options
    ),
    { deckId: "", deckListId: "", selectionKey: "" }
  );
});
