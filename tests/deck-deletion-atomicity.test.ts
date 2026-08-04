import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { deleteOwnedDeck } from "@/lib/decks/delete-service";

function readSource(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function createDeleteClient(result: { data: { id: string } | null; error: Error | null }) {
  const tables: string[] = [];
  const filters: Array<[string, string]> = [];
  const query = {
    delete() {
      return this;
    },
    eq(column: string, value: string) {
      filters.push([column, value]);
      return this;
    },
    select() {
      return this;
    },
    async maybeSingle() {
      return result;
    }
  };

  return {
    client: {
      from(table: string) {
        tables.push(table);
        return query;
      }
    } as never,
    filters,
    tables
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
  assert.deepEqual(harness.tables, ["decks"]);
  assert.deepEqual(harness.filters, [
    ["id", "deck-7"],
    ["user_id", "user-3"]
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
  assert.deepEqual(harness.tables, ["decks"]);
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
});
