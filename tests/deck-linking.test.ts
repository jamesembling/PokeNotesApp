import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveConservativeDeckLink,
  resolveLinkedDeck,
  resolvePersistableLogDeckLink
} from "@/lib/log-import/deck-linking";

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

test("resolveConservativeDeckLink returns a unique conservative match", () => {
  const resolved = resolveConservativeDeckLink(
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
      deckName: "Dragapult ex",
      deckSlug: "dragapult-ex",
      sprites: ["dragapult", "dusknoir"]
    }
  );

  assert.equal(resolved, "deck-b");
});

test("resolveConservativeDeckLink returns null for ambiguous conservative matches", () => {
  const resolved = resolveConservativeDeckLink(
    [
      {
        id: "deck-a",
        deckName: "Dragapult ex",
        deckPokemon: ["dragapult", "dusknoir"]
      },
      {
        id: "deck-b",
        deckName: "Dragapult ex",
        deckPokemon: ["dragapult", "dusknoir"]
      }
    ],
    {
      deckName: "Dragapult ex",
      deckSlug: "dragapult-ex",
      sprites: ["dragapult", "dusknoir"]
    }
  );

  assert.equal(resolved, null);
});

test("resolvePersistableLogDeckLink preserves explicit link fields", () => {
  const decision = resolvePersistableLogDeckLink(
    [
      {
        id: "deck-a",
        deckName: "Gardevoir ex",
        deckPokemon: ["gardevoir", "kirlia"]
      }
    ],
    {
      linkedDeckId: null,
      linkedDeckListId: "list-1",
      selfDeckName: "Gardevoir ex",
      selfDeckSlug: "gardevoir-ex",
      selfDeckSprites: ["gardevoir", "kirlia"]
    }
  );

  assert.deepEqual(decision, {
    status: "already-linked",
    linkedDeckId: undefined
  });
});

test("resolvePersistableLogDeckLink reports ambiguous matches without selecting one", () => {
  const decision = resolvePersistableLogDeckLink(
    [
      {
        id: "deck-a",
        deckName: "Dragapult ex",
        deckPokemon: ["dragapult", "dusknoir"]
      },
      {
        id: "deck-b",
        deckName: "Dragapult ex",
        deckPokemon: ["dragapult", "dusknoir"]
      }
    ],
    {
      selfDeckName: "Dragapult ex",
      selfDeckSlug: "dragapult-ex",
      selfDeckSprites: ["dragapult", "dusknoir"]
    }
  );

  assert.deepEqual(decision, {
    status: "ambiguous"
  });
});
