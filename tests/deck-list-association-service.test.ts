import assert from "node:assert/strict";
import test from "node:test";
import { setDeckListAssociation } from "@/lib/decks/deck-list-association-service";

test("association service sends a canonical attach request to the guarded RPC", async () => {
  const calls: Array<{ functionName: string; args: Record<string, unknown> }> = [];
  const supabase = {
    async rpc(functionName: string, args: Record<string, unknown>) {
      calls.push({ args, functionName });
      return {
        data: {
          deckList: { deck_id: "strategy-1", id: "list-1" },
          status: "committed"
        },
        error: null
      };
    }
  };

  const result = await setDeckListAssociation({
    deckId: "strategy-1",
    deckListId: "list-1",
    expectedUpdatedAt: "2026-08-21T00:40:00.000Z",
    supabase: supabase as never,
    updatedAt: "2026-08-21T00:41:00.000Z"
  });

  assert.deepEqual(result, {
    deckId: "strategy-1",
    deckListId: "list-1",
    status: "committed"
  });
  assert.deepEqual(calls, [
    {
      functionName: "set_deck_list_association",
      args: {
        p_deck_id: "strategy-1",
        p_deck_list_id: "list-1",
        p_expected_updated_at: "2026-08-21T00:40:00.000Z",
        p_updated_at: "2026-08-21T00:41:00.000Z"
      }
    }
  ]);
});

test("association service sends null for an explicit detach", async () => {
  const captured: { args: Record<string, unknown> | null } = { args: null };
  const supabase = {
    async rpc(_functionName: string, nextArgs: Record<string, unknown>) {
      captured.args = nextArgs;
      return {
        data: {
          deckList: { deck_id: null, id: "list-1" },
          status: "committed"
        },
        error: null
      };
    }
  };

  const result = await setDeckListAssociation({
    deckId: null,
    deckListId: "list-1",
    expectedUpdatedAt: "2026-08-21T00:40:00.000Z",
    supabase: supabase as never,
    updatedAt: "2026-08-21T00:41:00.000Z"
  });

  assert.equal(result.deckId, null);
  assert.equal(captured.args?.p_deck_id, null);
});

test("association service requires the observed list version", async () => {
  await assert.rejects(
    setDeckListAssociation({
      deckId: null,
      deckListId: "list-1",
      expectedUpdatedAt: "",
      supabase: {} as never
    }),
    /Deck List version is required/
  );
});

test("association service converts a stale RPC version into refresh-and-retry guidance", async () => {
  const supabase = {
    async rpc() {
      return {
        data: null,
        error: {
          code: "P0001",
          message: "Deck List association changed; refresh-and-retry before changing its association."
        }
      };
    }
  };

  await assert.rejects(
    setDeckListAssociation({
      deckId: null,
      deckListId: "list-1",
      expectedUpdatedAt: "2026-08-21T00:40:00.000Z",
      supabase: supabase as never
    }),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "DECK_LIST_STALE_VERSION" &&
      /refresh the Deck List and try again/i.test(error.message)
  );
});
