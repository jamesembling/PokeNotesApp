import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { deleteOwnedDeck } from "@/lib/decks/delete-service";

function readSource(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

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

test("deck deletion is one owned database mutation and returns its deleted row", async () => {
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

test("a forced deck delete failure cannot leave an earlier log unlink behind", async () => {
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

test("database cascades clear both deck and list links inside the delete transaction", () => {
  const ownershipMigration = readSource(
    "supabase/migrations/20260711172840_enforce_tenant_parent_ownership.sql"
  );
  const orphanLinkMigration = readSource(
    "supabase/migrations/20260711175105_clear_orphaned_deck_list_links.sql"
  );
  const actions = readSource("app/(app)/decks/actions.ts");

  assert.match(
    ownershipMigration,
    /foreign key \(user_id, linked_deck_id\)[\s\S]*?references public\.decks \(user_id, id\)[\s\S]*?on delete set null \(linked_deck_id\)/
  );
  assert.match(
    orphanLinkMigration,
    /if new\.linked_deck_id is null then[\s\S]*?new\.linked_deck_list_id := null/
  );
  assert.doesNotMatch(actions, /from\("logs"\)[\s\S]{0,300}linked_deck_id: null/);
  assert.match(actions, /deleteOwnedDeck\(\{ deckId, supabase, userId: user\.id \}\)/);
  assert.doesNotMatch(actions, /from\("decks"\)[\s\S]{0,300}\.delete\(/);
});
