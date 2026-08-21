import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("Battle Log persistence uses the account-owned Deck List reference boundary", () => {
  const actions = source("app/(app)/logs/actions.ts");
  assert.ok(
    (actions.match(/validateDeckListReference\(/g) ?? []).length >= 3,
    "import, edit, and bulk Battle Log writes must validate references"
  );
  assert.match(actions, /linked_deck_id: validatedReference\.deckId/);
  assert.match(actions, /linked_deck_list_id: validatedReference\.deckListId/);
  assert.match(actions, /selectedDeckListId \? null : suggestedLinkedDeckId/);
  assert.match(actions, /getDecks\(user\.id\)/);
});

test("Deck List detail UI exposes attach and detach through the reviewed action", () => {
  const page = source("app/(app)/deck-lists/[listId]/page.tsx");
  assert.match(page, /setDeckListAssociationAction/);
  assert.match(page, /name="deckId"/);
  assert.match(page, /value="">Standalone<\/option>/);
  assert.match(page, /name="updatedAt"/);
});

test("first-class read paths rebuild stale visual ordering from parsed cards", () => {
  const deckLists = source("lib/db/deck-lists.ts");
  const decks = source("lib/db/decks.ts");
  assert.match(deckLists, /getReadSortedDeckCards\(/);
  assert.match(decks, /getReadSortedDeckCards\(/);
  assert.match(source("lib/deck-lists/read-sort.ts"), /shouldRebuildDeckListVisualSort/);
});
