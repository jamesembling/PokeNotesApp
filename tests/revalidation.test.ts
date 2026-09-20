import assert from "node:assert/strict";
import test from "node:test";
import { applyDeckWorkspaceInvalidation } from "@/lib/server/revalidation";

test("targeted Tournament metadata invalidation includes old and new Deck Strategy/List routes", () => {
  const calls: Array<[string, "layout" | "page"]> = [];
  applyDeckWorkspaceInvalidation({
      deckIds: ["deck-old", "deck-new"],
      deckListIds: ["list-old", "list-new"],
      tournamentIds: ["tournament-1"]
    }, (path, type) => calls.push([path, type]));
  assert.deepEqual(
    calls,
    [
      ["/decks", "layout"],
      ["/logs", "layout"],
      ["/deck-lists", "layout"],
      ["/tournaments", "layout"],
      ["/decks/deck-old", "page"],
      ["/decks/deck-new", "page"],
      ["/deck-lists/list-old", "page"],
      ["/deck-lists/list-new", "page"],
      ["/tournaments/tournament-1", "page"]
    ]
  );
});
