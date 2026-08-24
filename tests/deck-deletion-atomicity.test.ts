import assert from "node:assert/strict";
import test from "node:test";
import { deleteOwnedDeck } from "@/lib/decks/delete-service";

function createDeleteClient(result: { data: { id: string } | null; error: Error | null }) {
  const rpcCalls: Array<{ name: string; args: Record<string, string> }> = [];

  return {
    client: {
      rpc(name: string, args: Record<string, string>) {
        rpcCalls.push({ args, name });
        return Promise.resolve(result);
      }
    } as never,
    rpcCalls
  };
}

test("deck deletion adapter forwards the id to the owned-deck RPC and returns its row", async () => {
  const harness = createDeleteClient({ data: { id: "deck-7" }, error: null });

  const deleted = await deleteOwnedDeck({
    deckId: "deck-7",
    supabase: harness.client,
    userId: "user-3"
  });

  assert.deepEqual(deleted, { id: "deck-7" });
  assert.deepEqual(harness.rpcCalls, [
    { name: "delete_owned_deck", args: { p_deck_id: "deck-7" } }
  ]);
});

test("deck deletion adapter propagates RPC failure without a fallback unlink", async () => {
  const failure = new Error("forced delete failure");
  const harness = createDeleteClient({ data: null, error: failure });

  await assert.rejects(
    deleteOwnedDeck({
      deckId: "deck-7",
      supabase: harness.client,
      userId: "user-3"
    }),
    (error) => error === failure
  );
  assert.deepEqual(harness.rpcCalls, [
    { name: "delete_owned_deck", args: { p_deck_id: "deck-7" } }
  ]);
});
