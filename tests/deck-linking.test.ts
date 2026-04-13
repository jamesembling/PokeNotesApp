import assert from "node:assert/strict";
import test from "node:test";
import { resolveLinkedDeck } from "@/lib/log-import/deck-linking";

test("resolveLinkedDeck prefers an explicit linked deck when it still exists", () => {
  const resolved = resolveLinkedDeck(
    [
      {
        id: "deck-a",
        deckName: "Gardevoir ex",
        deckPokemon: ["gardevoir", "kirlia"]
      },
      {
        id: "deck-b",
        deckName: "Dragapult ex",
        deckPokemon: ["dragapult", "dusknoir"]
      }
    ],
    {
      linkedDeckId: "deck-b",
      selfDeckName: "Some Imported Name",
      selfDeckSprites: ["gardevoir"]
    }
  );

  assert.equal(resolved, "deck-b");
});

test("resolveLinkedDeck infers a deck from sprite overlap when no explicit link exists", () => {
  const resolved = resolveLinkedDeck(
    [
      {
        id: "deck-a",
        deckName: "Gardevoir ex",
        deckPokemon: ["gardevoir", "kirlia"]
      },
      {
        id: "deck-b",
        deckName: "Dragapult ex",
        deckPokemon: ["dragapult", "dusknoir"]
      }
    ],
    {
      selfDeckName: "Dragapult ex",
      selfDeckSprites: ["dragapult", "dusknoir"]
    }
  );

  assert.equal(resolved, "deck-b");
});
