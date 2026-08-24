import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveDeckListsDuringCompatibility,
  resolveDeckMatchupsDuringCompatibility
} from "@/lib/decks/aggregate-compatibility";
import type { DeckList, DeckMatchup } from "@/types/index";

function deckList(id: string, name: string): DeckList {
  return {
    id,
    name,
    format: "Standard",
    date: "2026-07-11",
    createdBy: "Trainer",
    notes: "",
    rawList: "1 Example Card TST 1",
    parsedCards: [],
    sortedCards: [],
    createdAt: "2026-07-11T00:00:00.000Z",
    updatedAt: "2026-07-11T00:00:00.000Z"
  };
}

function matchup(id: string, deckName: string): DeckMatchup {
  return {
    id,
    deckName,
    deckPokemon: ["example-pokemon"],
    format: "Standard",
    goPreference: "",
    matchupFavor: "Even",
    idealBench: "",
    techsNeeded: "",
    matchupPlan: "",
    createdAt: "2026-07-11T00:00:00.000Z",
    updatedAt: "2026-07-11T00:00:00.000Z"
  };
}

test("fully migrated deck lists keep relational values and ordering", () => {
  const legacy = [deckList("one", "Legacy one"), deckList("two", "Legacy two")];
  const relational = [
    deckList("two", "Relational two"),
    deckList("one", "Relational one")
  ];

  assert.deepEqual(
    resolveDeckListsDuringCompatibility(legacy, relational).map(
      ({ id, name }) => ({ id, name })
    ),
    [
      { id: "two", name: "Relational two" },
      { id: "one", name: "Relational one" }
    ]
  );
});

test("partial migrations preserve legacy-only and relational-only list and matchup records", () => {
  const legacy = [deckList("one", "Legacy one"), deckList("two", "Legacy two")];
  const relational = [deckList("two", "Relational two")];

  assert.deepEqual(
    resolveDeckListsDuringCompatibility(legacy, relational).map(({ id, name }) => ({ id, name })),
    [
      { id: "one", name: "Legacy one" },
      { id: "two", name: "Relational two" }
    ]
  );

  const relationalOnly = [
    deckList("one", "Relational one"),
    deckList("two", "Relational two")
  ];

  assert.deepEqual(
    resolveDeckListsDuringCompatibility([deckList("one", "Legacy one")], relationalOnly).map(
      ({ id, name }) => ({ id, name })
    ),
    [
      { id: "one", name: "Relational one" },
      { id: "two", name: "Relational two" }
    ]
  );

  const matchupLegacy = [matchup("one", "Legacy one"), matchup("two", "Legacy two")];
  const matchupRelational = [matchup("one", "Relational one")];

  assert.deepEqual(
    resolveDeckMatchupsDuringCompatibility(matchupLegacy, matchupRelational).map(
      ({ id, deckName }) => ({ id, deckName })
    ),
    [
      { id: "one", deckName: "Relational one" },
      { id: "two", deckName: "Legacy two" }
    ]
  );
});

test("duplicate relational ids cannot make a partial aggregate look complete", () => {
  const legacy = [deckList("one", "Legacy one"), deckList("two", "Legacy two")];
  const relational = [
    deckList("one", "Relational one"),
    deckList("one", "Relational duplicate")
  ];

  assert.deepEqual(
    resolveDeckListsDuringCompatibility(legacy, relational).map(({ id, name }) => ({ id, name })),
    [
      { id: "one", name: "Relational duplicate" },
      { id: "two", name: "Legacy two" }
    ]
  );
});

test("missing relational deck lists retain the complete legacy collection", () => {
  const legacy = [deckList("one", "Legacy one"), deckList("two", "Legacy two")];

  assert.deepEqual(resolveDeckListsDuringCompatibility(legacy), legacy);
  assert.notEqual(resolveDeckListsDuringCompatibility(legacy), legacy);
});
