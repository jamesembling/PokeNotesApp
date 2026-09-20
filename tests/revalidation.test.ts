import assert from "node:assert/strict";
import test from "node:test";
import { getDeckWorkspaceInvalidationPaths } from "@/lib/server/revalidation";

test("targeted Tournament metadata invalidation includes old and new Deck Strategy/List routes", () => {
  assert.deepEqual(
    getDeckWorkspaceInvalidationPaths({
      deckIds: ["deck-old", "deck-new"],
      deckListIds: ["list-old", "list-new"],
      tournamentIds: ["tournament-1"]
    }),
    [
      "/decks",
      "/logs",
      "/deck-lists",
      "/tournaments",
      "/decks/deck-old",
      "/decks/deck-new",
      "/deck-lists/list-old",
      "/deck-lists/list-new",
      "/tournaments/tournament-1"
    ]
  );
});
