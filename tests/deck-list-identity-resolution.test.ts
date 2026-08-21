import assert from "node:assert/strict";
import test from "node:test";
import { resolveDeckListByIdentity } from "@/lib/db/deck-lists";
import type { DeckList } from "@/types/index";

function deckList(overrides: Partial<DeckList>): DeckList {
  return {
    createdAt: "2026-08-20T00:00:00.000Z",
    createdBy: "Trainer",
    date: "2026-08-20",
    deckId: null,
    format: "Standard",
    id: "list-x",
    name: "List X",
    notes: "",
    parsedCards: [],
    rawList: "",
    sortedCards: [],
    storage: "relational",
    updatedAt: "2026-08-20T00:00:00.000Z",
    ...overrides
  };
}

test("a deleted strategy cannot hide an independently owned relational list", () => {
  const relational = deckList({ deckId: "strategy-a", name: "Relational A" });
  const exactLegacy = deckList({
    deckId: "strategy-b",
    name: "Legacy B",
    storage: "legacy"
  });

  assert.equal(resolveDeckListByIdentity(relational, [], "strategy-deleted", false), relational);
  assert.equal(resolveDeckListByIdentity(relational, [exactLegacy], "strategy-b", true), exactLegacy);
  assert.equal(
    resolveDeckListByIdentity(
      relational,
      [exactLegacy, { ...exactLegacy, name: "Legacy B duplicate" }],
      "strategy-b",
      true
    ),
    null
  );
});

test("an exact relational mirror wins unless legacy identity is ambiguous", () => {
  const relational = deckList({ deckId: "strategy-a", name: "Relational A" });
  const mirror = deckList({ deckId: "strategy-a", name: "Relational A", storage: "legacy" });

  assert.equal(resolveDeckListByIdentity(relational, [mirror], "strategy-a", true), relational);
  assert.equal(
    resolveDeckListByIdentity(
      relational,
      [mirror, { ...mirror, name: "Duplicate" }],
      "strategy-a",
      true
    ),
    null
  );
});
