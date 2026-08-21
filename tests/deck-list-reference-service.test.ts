import assert from "node:assert/strict";
import test from "node:test";
import { validateDeckListReference } from "@/lib/db/deck-lists";

type FakeRow = Record<string, unknown>;

function createSupabase(input: { deckLists?: FakeRow[]; decks?: FakeRow[] }) {
  const rowsByTable = {
    deck_lists: input.deckLists ?? [],
    decks: input.decks ?? []
  };

  return {
    from(table: keyof typeof rowsByTable) {
      const filters: Array<{ column: string; value: unknown }> = [];
      const query = {
        select() {
          return query;
        },
        eq(column: string, value: unknown) {
          filters.push({ column, value });
          return query;
        },
        is(column: string, value: unknown) {
          filters.push({ column, value });
          return query;
        },
        execute() {
          return (rowsByTable[table] ?? []).filter((row) =>
            filters.every(({ column, value }) =>
              value === null ? row[column] === null : row[column] === value
            )
          );
        },
        async maybeSingle() {
          return { data: query.execute()[0] ?? null, error: null };
        },
        then(resolve: (value: { data: FakeRow[]; error: null }) => unknown) {
          return Promise.resolve(resolve({ data: query.execute(), error: null }));
        }
      };

      return query;
    }
  };
}

test("standalone first-class lists resolve to a null strategy", async () => {
  const supabase = createSupabase({
    deckLists: [
      { deck_id: null, id: "standalone", name: "Travel list", user_id: "user-1" }
    ]
  });

  const result = await validateDeckListReference({
    linkedDeckListId: "standalone",
    supabase: supabase as never,
    userId: "user-1"
  });

  assert.equal(result.deckId, null);
  assert.equal(result.deckListId, "standalone");
  assert.equal(result.list?.name, "Travel list");
});

test("a supplied strategy can reference an account-owned first-class list independently", async () => {
  const supabase = createSupabase({
    deckLists: [
      { deck_id: "strategy-a", id: "list-1", name: "League list", user_id: "user-1" }
    ],
    decks: [{ id: "strategy-b", deck_lists: [], user_id: "user-1" }]
  });

  const result = await validateDeckListReference({
    linkedDeckId: "strategy-b",
    linkedDeckListId: "list-1",
    supabase: supabase as never,
    userId: "user-1"
  });

  assert.equal(result.deckId, "strategy-b");
  assert.equal(result.deckListId, "list-1");
});

test("legacy JSON remains a read-compatible fallback for an owned strategy", async () => {
  const supabase = createSupabase({
    decks: [
      {
        deck_lists: [{ id: "legacy-list", name: "Legacy list" }],
        deck_name: "Legacy strategy",
        id: "strategy-1",
        user_id: "user-1"
      }
    ]
  });

  const result = await validateDeckListReference({
    linkedDeckId: "strategy-1",
    linkedDeckListId: "legacy-list",
    supabase: supabase as never,
    userId: "user-1"
  });

  assert.equal(result.deckId, "strategy-1");
  assert.equal(result.deckListId, "legacy-list");
});

test("an exact legacy copy wins over a same-id relational list from another strategy", async () => {
  const supabase = createSupabase({
    deckLists: [
      { deck_id: "strategy-a", id: "shared-id", name: "Relational A", user_id: "user-1" }
    ],
    decks: [
      {
        deck_lists: [{ id: "shared-id", name: "Legacy B" }],
        deck_name: "Strategy B",
        id: "strategy-b",
        user_id: "user-1"
      }
    ]
  });

  const result = await validateDeckListReference({
    linkedDeckId: "strategy-b",
    linkedDeckListId: "shared-id",
    supabase: supabase as never,
    userId: "user-1"
  });

  assert.equal(result.deckId, "strategy-b");
  assert.equal(result.list?.name, "Legacy B");
});

test("legacy JSON cannot be selected without an explicitly supplied strategy", async () => {
  const supabase = createSupabase({
    decks: [
      {
        deck_lists: [{ id: "legacy-list", name: "Legacy list" }],
        deck_name: "Legacy strategy",
        id: "strategy-1",
        user_id: "user-1"
      }
    ]
  });

  await assert.rejects(
    validateDeckListReference({
      linkedDeckListId: "legacy-list",
      supabase: supabase as never,
      userId: "user-1"
    }),
    /could not be found/
  );
});

test("a list owned by another account is not selectable", async () => {
  const supabase = createSupabase({
    deckLists: [
      { deck_id: null, id: "private-list", name: "Private", user_id: "user-2" }
    ]
  });

  await assert.rejects(
    validateDeckListReference({
      linkedDeckListId: "private-list",
      supabase: supabase as never,
      userId: "user-1"
    }),
    /could not be found/
  );
});
