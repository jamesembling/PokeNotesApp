import assert from "node:assert/strict";
import test from "node:test";
import type { DeckListSelectionSource } from "@/lib/db/deck-lists";
import { composeDeckListNameOptions, resolveDeckListName } from "@/lib/deck-lists/resolve-name";
import type { DeckListSelectionOption, DeckSelectionOption } from "@/types/index";

const options: DeckListSelectionOption[] = [
  { id: "shared", name: "Strategy A copy", deckId: "strategy-a", deckName: "A" },
  { id: "shared", name: "Strategy B copy", deckId: "strategy-b", deckName: "B" },
  { id: "shared", name: "Standalone copy", deckId: null, deckName: null }
];

test("composite list-name resolution preserves same-id strategy and standalone identities", () => {
  assert.equal(resolveDeckListName(options, "strategy-a", "shared"), "Strategy A copy");
  assert.equal(resolveDeckListName(options, "strategy-b", "shared"), "Strategy B copy");
  assert.equal(resolveDeckListName(options, null, "shared"), "Standalone copy");
  assert.equal(resolveDeckListName(options, null, "missing"), undefined);
});

test("an independent relational list resolves even when the log strategy differs", () => {
  const accountOptions: DeckListSelectionSource[] = [
    {
      deckId: "strategy-a",
      deckName: "A",
      id: "shared",
      name: "Relational A",
      source: "relational"
    }
  ];

  assert.equal(
    resolveDeckListName(accountOptions, "strategy-b", "shared"),
    "Relational A"
  );
});

test("initial and paginated log windows agree on an independently referenced list", () => {
  const relational: DeckListSelectionSource = {
    deckId: "strategy-a",
    deckName: "A",
    id: "shared",
    name: "Relational A",
    source: "relational"
  };

  const initialWindowOptions = [relational];
  const paginatedWindowOptions = [relational, {
    deckId: "strategy-c",
    deckName: "C",
    id: "other",
    name: "Legacy C",
    source: "legacy" as const
  }];

  assert.equal(
    resolveDeckListName(initialWindowOptions, "strategy-b", "shared"),
    "Relational A"
  );
  assert.equal(
    resolveDeckListName(paginatedWindowOptions, "strategy-b", "shared"),
    "Relational A"
  );
});

test("exact legacy identity wins, while ambiguous legacy copies cannot overwrite relational data", () => {
  const exactLegacy: DeckListSelectionSource[] = [
    {
      deckId: "strategy-a",
      deckName: "A",
      id: "shared",
      name: "Relational A",
      source: "relational"
    },
    {
      deckId: "strategy-b",
      deckName: "B",
      id: "shared",
      name: "Legacy B",
      source: "legacy"
    }
  ];
  const ambiguousLegacy = [
    ...exactLegacy,
    { ...exactLegacy[1], name: "Legacy B duplicate" }
  ];

  assert.equal(resolveDeckListName(exactLegacy, "strategy-b", "shared"), "Legacy B");
  assert.equal(resolveDeckListName(ambiguousLegacy, "strategy-b", "shared"), "Relational A");
});

test("name hydration preserves provenance without hiding ambiguous legacy copies", () => {
  const relational: DeckListSelectionOption = {
    deckId: "strategy-a",
    deckName: "A",
    id: "shared",
    name: "Relational A",
    source: "relational"
  };
  const legacy: DeckListSelectionOption = {
    deckId: "strategy-b",
    deckName: "B",
    id: "shared",
    name: "Legacy B",
    source: "legacy"
  };
  const userDecks: DeckSelectionOption[] = [
    { deckName: "B", deckLists: [{ id: "shared", name: "Legacy B" }], id: "strategy-b" }
  ];

  const composed = composeDeckListNameOptions([relational, legacy], userDecks);
  assert.equal(resolveDeckListName(composed, "strategy-b", "shared"), "Legacy B");

  const ambiguous = composeDeckListNameOptions(
    [relational, legacy, { ...legacy, name: "Legacy B duplicate" }],
    userDecks
  );
  assert.equal(resolveDeckListName(ambiguous, "strategy-b", "shared"), "Relational A");
});
