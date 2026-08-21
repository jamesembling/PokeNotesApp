import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveDeckListReference,
  type DeckListReferenceRecord
} from "@/lib/decks/deck-list-reference";

const standaloneList: DeckListReferenceRecord = {
  deckId: null,
  id: "list-standalone",
  name: "Standalone list",
  userId: "user-1"
};

const associatedList: DeckListReferenceRecord = {
  deckId: "deck-1",
  id: "list-associated",
  name: "Associated list",
  userId: "user-1"
};

test("standalone Deck List references canonicalize without a Deck Strategy", () => {
  assert.deepEqual(
    resolveDeckListReference({
      linkedDeckListId: standaloneList.id,
      linkedDeckId: null,
      list: standaloneList,
      userId: standaloneList.userId
    }),
    {
      deckId: null,
      deckListId: standaloneList.id,
      list: standaloneList
    }
  );
});

test("an omitted strategy id uses the current optional association", () => {
  assert.deepEqual(
    resolveDeckListReference({
      linkedDeckListId: associatedList.id,
      list: associatedList,
      userId: associatedList.userId
    }),
    {
      deckId: associatedList.deckId,
      deckListId: associatedList.id,
      list: associatedList
    }
  );
});

test("a supplied strategy id must match the list association", () => {
  assert.throws(
    () =>
      resolveDeckListReference({
        linkedDeckId: "deck-other",
        linkedDeckListId: associatedList.id,
        list: associatedList,
        userId: associatedList.userId
      }),
    /does not belong to the supplied Deck Strategy/
  );
});

test("a list owned by another account is rejected without revealing it", () => {
  assert.throws(
    () =>
      resolveDeckListReference({
        linkedDeckListId: standaloneList.id,
        list: standaloneList,
        userId: "user-other"
      }),
    /Deck List could not be found/
  );
});

test("a missing list id leaves a strategy-only reference unchanged", () => {
  assert.deepEqual(
    resolveDeckListReference({
      linkedDeckId: "deck-1",
      list: null,
      userId: "user-1"
    }),
    {
      deckId: "deck-1",
      deckListId: null,
      list: null
    }
  );
});
