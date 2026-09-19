import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveTournamentDeckListForDisplay,
  saveTournamentDeckListAtomically,
  saveTournamentDeckListForTournament
} from "@/lib/tournaments/deck-list-workflow";
import { getTournamentRoundCreationIdentity } from "@/lib/tournaments/round-workflow";

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

test("replaying the same Tournament Deck List FormData keeps the action payload identity stable", async () => {
  const formData = new FormData();
  formData.set("tournamentId", "tournament-1");
  formData.set("creationKey", "capture-attempt-1");
  formData.set("name", "Regional list");
  formData.set("format", "Standard");
  formData.set("rawList", "2 Dragapult ex TWM 130");

  const commits: Array<Record<string, unknown>> = [];
  let committed = false;
  const results = [] as Array<{ deckListId: string; status: "committed" | "idempotent" }>;
  const adapter = {
    async loadTournament() {
      return {
        deckSprites: ["dragapult", "dusknoir"],
        format: "Standard",
        linkedDeckId: null,
        linkedDeckListId: committed ? "capture-attempt-1" : null,
        updatedAt: "2026-09-20T00:00:00.000Z"
      };
    },
    async commit(input: { payload: Record<string, unknown>; [key: string]: unknown }) {
      commits.push(input.payload);
      const result = {
        deckListId: "capture-attempt-1",
        status: committed ? "idempotent" : "committed"
      } as const;
      committed = true;
      results.push(result);
      return result;
    }
  };

  await saveTournamentDeckListAtomically({
    adapter,
    formData,
    userId: "user-1",
    defaultCreatedBy: "Trainer"
  });
  await saveTournamentDeckListAtomically({
    adapter,
    formData,
    userId: "user-1",
    defaultCreatedBy: "Trainer"
  });

  assert.deepEqual(results.map((result) => result.status), ["committed", "idempotent"]);
  assert.equal(commits.length, 2);
  const withoutVolatileFields = (payload: Record<string, unknown>) => {
    const { createdAt, updatedAt, ...stable } = payload;
    return stable;
  };
  assert.deepEqual(withoutVolatileFields(commits[0]), withoutVolatileFields(commits[1]));
});

test("replaying the same Tournament Round FormData uses one stable creation identity", () => {
  const formData = new FormData();
  formData.set("creationKey", "round-attempt-1");

  assert.deepEqual(getTournamentRoundCreationIdentity(formData), {
    creationKey: "round-attempt-1",
    roundId: "round-attempt-1"
  });
  assert.deepEqual(getTournamentRoundCreationIdentity(formData), {
    creationKey: "round-attempt-1",
    roundId: "round-attempt-1"
  });
});
