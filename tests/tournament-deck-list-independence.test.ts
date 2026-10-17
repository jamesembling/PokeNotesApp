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
  formData.set("expectedUpdatedAt", "2026-09-20T00:00:00.000Z");
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
  formData.set("expectedUpdatedAt", "2026-09-20T00:00:00.000Z");
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
        updatedAt: committed ? "2026-09-20T00:05:00.000Z" : "2026-09-20T00:00:00.000Z"
      };
    },
    async commit(input: { payload: Record<string, unknown>; [key: string]: unknown }) {
      assert.equal(input.expectedTournamentUpdatedAt, "2026-09-20T00:00:00.000Z");
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

test("existing-list capture rejects legacy-only identities and carries rebuilt ordering without changing Strategy links", async () => {
  const formData = new FormData();
  formData.set("tournamentId", "tournament-1");
  formData.set("expectedUpdatedAt", "2026-09-20T00:00:00.000Z");
  formData.set("creationKey", "source-capture-1");
  formData.set("sourceDeckId", "strategy-1");
  formData.set("sourceDeckListId", "legacy-list-1");

  await assert.rejects(
    saveTournamentDeckListAtomically({
      adapter: {
        async loadTournament() {
          return {
            deckSprites: ["dragapult"],
            format: "Standard",
            linkedDeckId: "strategy-1",
            linkedDeckListId: null,
            updatedAt: "2026-09-20T00:00:00.000Z"
          };
        },
        async loadSourceDeckList() {
          return {
            id: "legacy-list-1",
            storage: "legacy",
            deckId: "strategy-1",
            name: "Legacy",
            format: "Standard",
            date: "2026-09-20",
            createdBy: "Fixture",
            notes: "",
            rawList: "legacy",
            parsedCards: [],
            sortedCards: [],
            updatedAt: "2026-09-20T00:00:00.000Z"
          };
        },
        async commit() {
          throw new Error("legacy source must never reach the RPC");
        }
      },
      formData,
      userId: "user-1",
      defaultCreatedBy: "Fixture"
    }),
    /first-class Deck List/i
  );

  const commits: Array<Record<string, unknown>> = [];
  formData.set("sourceDeckListId", "relational-list-1");
  const result = await saveTournamentDeckListAtomically({
    adapter: {
      async loadTournament() {
        return {
          deckSprites: ["dragapult"],
          format: "Standard",
          linkedDeckId: "strategy-1",
          linkedDeckListId: null,
          updatedAt: "2026-09-20T00:00:00.000Z"
        };
      },
      async loadSourceDeckList() {
        return {
          id: "relational-list-1",
          storage: "relational",
          deckId: "strategy-1",
          name: "Relational",
          format: "Standard",
          date: "2026-09-20",
          createdBy: "Fixture",
          notes: "",
          rawList: "canonical",
          parsedCards: [{ name: "Dragapult ex" }],
          sortedCards: [{ name: "Dragapult ex" }],
          sortedCardsVersion: 3,
          updatedAt: "2026-09-20T00:00:00.000Z"
        };
      },
      async commit(input) {
        commits.push(input.payload);
        return { deckListId: "relational-list-1", status: "committed" as const };
      }
    },
    formData,
    userId: "user-1",
    defaultCreatedBy: "Fixture"
  });

  assert.deepEqual(result, { deckListId: "relational-list-1", status: "committed" });
  assert.deepEqual(commits[0], {
    sourceDeckId: "strategy-1",
    sourceDeckListId: "relational-list-1",
    associateStrategy: false,
    parsedCards: [{ name: "Dragapult ex" }],
    sortedCards: [{ name: "Dragapult ex" }],
    sortedCardsVersion: 3
  });

  // An editor showing the old snapshot must not receive the server's newer version.
  const sourceAdapter = {
    async loadTournament() {
      return {
        deckSprites: ["dragapult"], format: "Standard", linkedDeckId: null,
        linkedDeckListId: "newer-snapshot", updatedAt: "2026-09-20T00:05:00.000Z"
      };
    },
    async loadSourceDeckList() {
      return {
        id: "relational-list-1", name: "Source", format: "Standard", date: "2026-09-20",
        createdBy: "Fixture", notes: "", rawList: "canonical", parsedCards: [], sortedCards: [],
        updatedAt: "2026-09-20T00:00:00.000Z"
      };
    },
    async commit(input: { expectedTournamentUpdatedAt: string; allowReplace: boolean }) {
      assert.equal(input.expectedTournamentUpdatedAt, "2026-09-20T00:00:00.000Z");
      assert.equal(input.allowReplace, true);
      throw new Error("Tournament changed in another tab");
    }
  };
  formData.set("replaceDeckList", "true");
  await assert.rejects(saveTournamentDeckListAtomically({
    adapter: sourceAdapter, formData, userId: "user-1", defaultCreatedBy: "Fixture"
  }), /changed in another tab/);
  for (const invalid of ["", "invalid-date"]) {
    formData.set("expectedUpdatedAt", invalid);
    await assert.rejects(saveTournamentDeckListAtomically({
      adapter: sourceAdapter, formData, userId: "user-1", defaultCreatedBy: "Fixture"
    }), /Refresh this Tournament/);
  }
});
