import assert from "node:assert/strict";
import test from "node:test";
import { resolveDeckListName } from "@/lib/deck-lists/resolve-name";
import type { DeckListSelectionOption } from "@/types/index";

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
