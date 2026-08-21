import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  composeDeckListNameOptions,
  resolveDeckListName
} from "@/lib/deck-lists/resolve-name";
import { resolveDeckListByIdentity } from "@/lib/db/deck-lists";
import type {
  DeckList,
  DeckListSelectionOption,
  DeckSelectionOption
} from "@/types/index";

const writerSource = readFileSync(
  join(process.cwd(), "lib/decks/deck-aggregate-writer.ts"),
  "utf8"
);

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

test("name hydration composes one provenance-aware option set without hiding ambiguity", () => {
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
    {
      deckName: "B",
      deckLists: [{ id: "shared", name: "Legacy B" }],
      id: "strategy-b"
    }
  ];

  const composed = composeDeckListNameOptions([relational, legacy], userDecks);
  assert.equal(composed.length, 2);
  assert.equal(resolveDeckListName(composed, "strategy-b", "shared"), "Legacy B");

  const ambiguous = composeDeckListNameOptions(
    [relational, legacy, { ...legacy, name: "Legacy B duplicate" }],
    userDecks
  );
  assert.equal(ambiguous.length, 3);
  assert.equal(resolveDeckListName(ambiguous, "strategy-b", "shared"), "Relational A");
});

test("the server update loader reads relational identity before association state", () => {
  const loader = writerSource.slice(
    writerSource.indexOf("async loadDeckList({ deckId, deckListId })"),
    writerSource.indexOf("async loadLegacyChildren", writerSource.indexOf("async loadDeckList"))
  );

  assert.match(loader, /\.eq\("user_id", userId\)[\s\S]*\.eq\("id", deckListId\)/);
  assert.doesNotMatch(
    loader,
    /query = deckId \? query\.eq\("deck_id", deckId\) : query\.is\("deck_id", null\)/,
    "a stale association must not turn an existing relational list into not-found"
  );
  assert.match(loader, /expected|updated_at|legacy/i);
});

test("URL identity selection keeps a relational list when its requested strategy was deleted", () => {
  const relational = deckList({ deckId: "strategy-a", name: "Relational A" });
  const exactLegacy = deckList({
    deckId: "strategy-b",
    id: "list-x",
    name: "Legacy B",
    storage: "legacy"
  });

  assert.equal(
    resolveDeckListByIdentity(relational, [], "strategy-deleted", false),
    relational
  );
  assert.equal(
    resolveDeckListByIdentity(relational, [exactLegacy], "strategy-b", true),
    exactLegacy
  );
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
