import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveTournamentDeckListForDisplay,
  saveTournamentDeckListForTournament
} from "@/lib/tournaments/deck-list-workflow";

test("Tournament detail displays a standalone Deck List after its Strategy is deleted", async () => {
  const calls: Array<{ deckId: string | null; deckListId: string; userId: string }> = [];
  const standaloneList = {
    id: "list-1",
    deckId: null,
    name: "Regional list"
  };

  const result = await resolveTournamentDeckListForDisplay({
    loadDeckList: async (userId, deckListId, deckId) => {
      calls.push({ deckId, deckListId, userId });
      return standaloneList;
    },
    tournament: {
      linkedDeckId: null,
      linkedDeckListId: "list-1"
    },
    userId: "user-1"
  });

  assert.equal(result, standaloneList);
  assert.deepEqual(calls, [
    { deckId: null, deckListId: "list-1", userId: "user-1" }
  ]);
});

test("adding a Tournament Deck List creates a standalone list without a hidden Strategy", async () => {
  const formData = new FormData();
  formData.set("tournamentId", "tournament-1");
  formData.set("creationKey", "attempt-1");
  formData.set("deckId", "stale-client-strategy");
  formData.set("name", "Regional list");
  formData.set("format", "Standard");
  formData.set("rawList", "60 cards");

  let savedDeckId: FormDataEntryValue | null = "not-called";
  const attachments: Array<{
    deckName: string;
    deckListId: string;
    deckSprites: string[];
    linkedDeckId: string | null;
    tournamentId: string;
    userId: string;
  }> = [];

  const result = await saveTournamentDeckListForTournament({
    adapter: {
      async attachDeckList(input) {
        attachments.push(input);
      },
      async loadTournament() {
        return {
          deckSprites: ["dragapult", "dusknoir"],
          format: "Standard",
          linkedDeckId: null,
          linkedDeckListId: null
        };
      },
      async saveStandaloneDeckList(submittedFormData) {
        savedDeckId = submittedFormData.get("deckId");
        return { deckId: null, deckListId: "list-1" };
      }
    },
    formData,
    userId: "user-1"
  });

  assert.equal(savedDeckId, "");
  assert.deepEqual(attachments, [
    {
      deckName: "Dragapult / Dusknoir",
      deckListId: "list-1",
      deckSprites: ["dragapult", "dusknoir"],
      linkedDeckId: null,
      tournamentId: "tournament-1",
      userId: "user-1"
    }
  ]);
  assert.deepEqual(result, { deckId: null, deckListId: "list-1" });
});
