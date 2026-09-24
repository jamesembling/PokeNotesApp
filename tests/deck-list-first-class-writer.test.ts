import assert from "node:assert/strict";
import test from "node:test";
import {
  createDeckAggregateWriter,
  createSupabaseDeckAggregateWriteAdapter,
  isDeckListStaleVersionError,
  type DeckListCommitPlan,
  type DeckListCommitResult,
  type SaveDeckListCommand
} from "@/lib/decks/deck-aggregate-writer";
import type { DeckCard } from "@/types/index";

const NOW = "2026-08-21T00:40:00.000Z";
const EXISTING_UPDATED_AT = "2026-08-20T00:40:00.000Z";
const CARDS: DeckCard[] = [
  { count: 2, name: "Dragapult ex", number: "130", set: "TWM" }
];

function command(overrides: Partial<SaveDeckListCommand> = {}): SaveDeckListCommand {
  return {
    createdBy: "Trainer",
    creationKey: "create-attempt-1",
    date: "2026-08-21",
    deckId: null,
    deckListId: "",
    format: "Standard",
    name: "Standalone list",
    notes: "Notes",
    rawList: "2 Dragapult ex TWM 130",
    submittedCreatedAt: "",
    submittedUpdatedAt: EXISTING_UPDATED_AT,
    ...overrides
  };
}

function createHarness() {
  const plans: DeckListCommitPlan[] = [];
  const writer = createDeckAggregateWriter({
    actor: { defaultCreatedBy: "Trainer", userId: "user-1" },
    adapter: {
      async commitDeckList(plan) {
        plans.push(plan);
        return {
          deckId: plan.deckId,
          deckListId: String(plan.child.id),
          status: "committed"
        } satisfies DeckListCommitResult;
      },
      async loadDeckList() {
        return {
          createdAt: "2026-08-19T00:40:00.000Z",
          date: "2026-08-19",
          deckId: null,
          id: "list-1",
          name: "Old standalone list",
          format: "Standard",
          createdBy: "Trainer",
          notes: "Old notes",
          rawList: "2 Dragapult ex TWM 130",
          parsedCards: CARDS,
          sortedCards: CARDS,
          sortedCardsVersion: 1,
          updatedAt: EXISTING_UPDATED_AT
        };
      },
      async commit() {
        assert.fail("First-class Deck List writes must use the first-class RPC adapter.");
      },
      async loadLegacyChildren() {
        assert.fail("First-class Deck List writes must not load strategy JSON.");
      }
    },
    createId: () => "new-list-id",
    now: () => NOW,
    parseCards: () => CARDS,
    sortCards: async () => CARDS
  });

  return { plans, writer };
}

test("standalone creation writes through the first-class idempotent boundary", async () => {
  const harness = createHarness();

  const result = await harness.writer.saveList(command({ deckListId: "" }));

  assert.equal(result.deckId, null);
  assert.equal(result.deckListId, "create-attempt-1");
  assert.equal(harness.plans.length, 1);
  assert.equal(harness.plans[0].creationKey, "create-attempt-1");
  assert.equal(harness.plans[0].operation, "create");
  assert.equal(harness.plans[0].deckId, null);
  assert.equal(harness.plans[0].child.id, "create-attempt-1");
});

test("a caller-supplied creation key is the stable list identity across retries", async () => {
  const plans: DeckListCommitPlan[] = [];
  const writer = createDeckAggregateWriter({
    actor: { defaultCreatedBy: "Trainer", userId: "user-1" },
    adapter: {
      async commitDeckList(plan) {
        plans.push(plan);
        return {
          deckId: plan.deckId,
          deckListId: String(plan.child.id),
          status: "idempotent"
        };
      },
      async loadDeckList() { return null; },
      async commit() { return "committed"; },
      async loadLegacyChildren() { return []; }
    },
    createId: () => "should-not-be-used",
    now: () => NOW,
    parseCards: () => CARDS,
    sortCards: async () => CARDS
  });

  const first = await writer.saveList(command({ creationKey: "retry-key" }));
  const second = await writer.saveList(command({ creationKey: "retry-key" }));

  assert.equal(first.deckListId, "retry-key");
  assert.equal(second.deckListId, "retry-key");
  assert.deepEqual(plans.map((plan) => plan.child.id), ["retry-key", "retry-key"]);
});

test("legacy-only lists remain loadable and editable through the compatibility adapter", async () => {
  const plans: DeckListCommitPlan[] = [];
  const legacyList = {
    id: "legacy-list",
    name: "Legacy list",
    format: "Standard",
    date: "2026-08-19",
    createdBy: "Trainer",
    notes: "Old notes",
    rawList: "2 Dragapult ex TWM 130",
    parsedCards: CARDS,
    sortedCards: CARDS,
    sortedCardsVersion: 2,
    createdAt: "2026-08-19T00:40:00.000Z",
    updatedAt: EXISTING_UPDATED_AT
  };
  const writer = createDeckAggregateWriter({
    actor: { defaultCreatedBy: "Trainer", userId: "user-1" },
    adapter: {
      async commitDeckList(plan) {
        plans.push(plan);
        return { deckId: "strategy-1", deckListId: "legacy-list", status: "committed" };
      },
      async loadDeckList() { return null; },
      async commit() { return "committed"; },
      async loadLegacyChildren() { return [legacyList]; }
    },
    createId: () => "new-list-id",
    now: () => NOW,
    parseCards: () => CARDS,
    sortCards: async () => CARDS
  });

  const result = await writer.saveList(command({
    deckId: "strategy-1",
    deckListId: "legacy-list",
    name: "Edited legacy list"
  }));

  assert.equal(result.deckListId, "legacy-list");
  assert.equal(plans[0]?.operation, "update");
  assert.equal(plans[0]?.expectedChildUpdatedAt, EXISTING_UPDATED_AT);
  assert.equal(plans[0]?.legacySourceDeckId, "strategy-1");
});

test("a server-loaded legacy-only list is still adopted with its exact source strategy", async () => {
  const plans: DeckListCommitPlan[] = [];
  const legacyList = {
    id: "legacy-server-list",
    name: "Legacy server list",
    format: "Standard",
    date: "2026-08-19",
    createdBy: "Trainer",
    notes: "Old notes",
    rawList: "2 Dragapult ex TWM 130",
    parsedCards: CARDS,
    sortedCards: CARDS,
    sortedCardsVersion: 2,
    createdAt: "2026-08-19T00:40:00.000Z",
    updatedAt: EXISTING_UPDATED_AT,
    deckId: "strategy-1",
    storage: "legacy" as const
  };
  const writer = createDeckAggregateWriter({
    actor: { defaultCreatedBy: "Trainer", userId: "user-1" },
    adapter: {
      async commitDeckList(plan) {
        plans.push(plan);
        return { deckId: "strategy-1", deckListId: legacyList.id, status: "committed" };
      },
      async loadDeckList() { return legacyList; },
      async commit() { return "committed"; },
      async loadLegacyChildren() { return [legacyList]; }
    },
    now: () => NOW,
    parseCards: () => CARDS,
    sortCards: async () => CARDS
  });

  await writer.saveList(command({
    deckId: "strategy-1",
    deckListId: legacyList.id,
    name: "Edited server legacy list"
  }));

  assert.equal(plans[0]?.operation, "update");
  assert.equal(plans[0]?.legacySourceDeckId, "strategy-1");
});

test("standalone updates carry the observed version for stale-write rejection", async () => {
  const harness = createHarness();

  await harness.writer.saveList(
    command({
      creationKey: "",
      deckListId: "list-1",
      name: "Updated standalone list"
    })
  );

  assert.equal(harness.plans[0].operation, "update");
  assert.equal(harness.plans[0].expectedChildUpdatedAt, EXISTING_UPDATED_AT);
  assert.equal(harness.plans[0].deckId, null);
});

test("missing first-class Deck List RPC errors fail without a legacy write", async () => {
  const missingRpcError = {
    code: "42883",
    message: "function public.commit_first_class_deck_list(...) does not exist"
  };
  const rpcCalls: string[] = [];
  const adapter = createSupabaseDeckAggregateWriteAdapter({
    supabase: {
      rpc: async (name: string) => {
        rpcCalls.push(name);
        return { data: null, error: missingRpcError };
      }
    } as never,
    userId: "user-1"
  });
  assert.ok(adapter.commitDeckList);

  await assert.rejects(
    adapter.commitDeckList({
      child: { id: "list-1" },
      creationKey: "list-1",
      deckId: "strategy-1",
      expectedChildUpdatedAt: EXISTING_UPDATED_AT,
      operation: "update",
      updatedAt: NOW
    }),
    (error) => error === missingRpcError
  );
  assert.deepEqual(rpcCalls, ["commit_first_class_deck_list"]);
});

test("stale RPC errors are narrowly classified for refresh-and-retry guidance", () => {
  assert.equal(
    isDeckListStaleVersionError({
      code: "P0001",
      message: "Deck List changed; refresh-and-retry before saving."
    }),
    true
  );
  assert.equal(
    isDeckListStaleVersionError({
      code: "P0001",
      message: "Deck List association changed; refresh-and-retry before changing its association."
    }),
    true
  );
  assert.equal(
    isDeckListStaleVersionError({ code: "P0001", message: "Deck Strategy could not be found." }),
    false
  );
  assert.equal(
    isDeckListStaleVersionError({ code: "23505", message: "Deck List changed; refresh-and-retry." }),
    false
  );
});
