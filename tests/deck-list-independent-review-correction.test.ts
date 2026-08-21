import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { validateDeckListReference } from "@/lib/db/deck-lists";
import {
  buildDeckListSelectionOptions,
  type DeckListSelectionSource
} from "@/lib/db/deck-lists";
import {
  selectDeck,
  selectDeckList,
  makeDeckListSelectionKey,
  type DeckListSelectionState
} from "@/lib/log-import/deck-list-selection";
import type { DeckListSelectionOption } from "@/types/index";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function createSupabase(input: { deckLists?: Record<string, unknown>[]; decks?: Record<string, unknown>[] }) {
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
        execute() {
          return (rowsByTable[table] ?? []).filter((row) =>
            filters.every(({ column, value }) => row[column] === value)
          );
        },
        async maybeSingle() {
          return { data: query.execute()[0] ?? null, error: null };
        },
        then(resolve: (value: { data: Record<string, unknown>[]; error: null }) => unknown) {
          return Promise.resolve(resolve({ data: query.execute(), error: null }));
        }
      };

      return query;
    }
  };
}

test("legacy reference validation keeps a same-account cross-strategy copy visible", async () => {
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

test("selection options retain same-account legacy and relational copies by strategy identity", () => {
  const sources: DeckListSelectionSource[] = [
    { deckId: "strategy-a", deckName: "A", id: "shared-id", name: "Relational A", source: "relational" },
    { deckId: "strategy-b", deckName: "B", id: "shared-id", name: "Legacy B", source: "legacy" }
  ];

  assert.deepEqual(buildDeckListSelectionOptions(sources), [
    sources[0],
    sources[1]
  ].map(({ source: _source, ...option }) => ({
    ...option,
    selectionKey: JSON.stringify([option.deckId, option.id])
  })));
});

test("database reference and read-model boundaries match strategy-scoped legacy identity", () => {
  const migration = source("supabase/migrations/20260821003055_first_class_deck_lists.sql");
  const freshSchema = source("schema.sql");
  const referenceBlock = migration.slice(
    migration.indexOf("create or replace function public.can_use_deck_list_reference("),
    migration.indexOf("-- The pre-existing compatibility RPC")
  );
  const readModel = migration.slice(migration.indexOf("create or replace function public.get_initial_logs_page_data("));

  assert.match(referenceBlock, /deck_list\.user_id = p_user_id/);
  assert.match(referenceBlock, /deck_list\.id = p_deck_list_id/);
  assert.doesNotMatch(referenceBlock, /deck_list\.deck_id = p_deck_id/);
  assert.match(readModel, /legacy_deck\.id = ordered_logs\.linked_deck_id/);
  assert.match(readModel, /legacy_item\.value ->> 'id' = ordered_logs\.linked_deck_list_id/);

  const deletionBlock = migration.slice(
    migration.indexOf("create or replace function public.preserve_deleted_deck_legacy_references("),
    migration.indexOf("revoke all on function public.delete_owned_deck")
  );
  assert.match(deletionBlock, /preserve_deleted_deck_legacy_references/i);
  assert.match(deletionBlock, /update public\.logs[\s\S]*linked_deck_list_id/);
  assert.match(deletionBlock, /update public\.tournaments[\s\S]*linked_deck_list_id/);

  const legacyDeleteTrigger = migration.slice(
    migration.indexOf("create or replace function public.remove_deleted_deck_list_legacy_copy()"),
    migration.indexOf("-- This helper is used by logs")
  );
  assert.match(legacyDeleteTrigger, /linked_deck_id is null|linked_deck_id = old\.deck_id/);

  for (const sql of [migration, freshSchema]) {
    const helper = sql.slice(
      sql.indexOf("create or replace function public.preserve_deleted_deck_legacy_references("),
      sql.indexOf("create or replace function public.delete_owned_deck(")
    );
    assert.match(helper, /v_legacy_count > 1/);
    assert.match(helper, /insert into public\.deck_lists/);
    assert.match(helper, /gen_random_uuid\(\)/);
    assert.match(helper, /update public\.logs/);
    assert.match(helper, /update public\.tournaments/);
    assert.match(helper, /revoke all on function public\.preserve_deleted_deck_legacy_references/);
    assert.match(sql, /relational_list\.id = ordered_logs\.linked_deck_list_id/);
    assert.match(sql, /legacy_deck\.user_id = ordered_logs\.user_id/);
    assert.match(sql, /select count\(\*\)[\s\S]*\) <> 1/);
    assert.match(sql, /having count\(\*\) = 1/);
  }
});

test("flat selectors reconcile Deck List strategy pairs from the option model", () => {
  const importDialog = source("components/ui/ImportLogDialog.tsx");
  const editDialog = source("components/ui/EditLogDialog.tsx");
  const logsManager = source("components/ui/LogsManager.tsx");

  for (const file of [importDialog, editDialog, logsManager]) {
    assert.match(file, /deckList\.deckId/);
    assert.doesNotMatch(file, /onChange=\{setSelectedDeckListId\}/);
  }
});

test("flat selector state keeps standalone lists and clears incompatible pairs", () => {
  const options: DeckListSelectionOption[] = [
    { deckId: null, deckName: null, id: "standalone", name: "Standalone" },
    { deckId: "strategy-a", deckName: "A", id: "list-a", name: "A list" }
  ];
  const empty: DeckListSelectionState = { deckId: "", deckListId: "", selectionKey: "" };

  assert.deepEqual(selectDeckList(empty, "standalone", options), {
    deckId: "",
    deckListId: "standalone",
    selectionKey: '[null,"standalone"]'
  });
  assert.deepEqual(selectDeckList(empty, "list-a", options), {
    deckId: "strategy-a",
    deckListId: "list-a",
    selectionKey: '["strategy-a","list-a"]'
  });
  assert.deepEqual(
    selectDeck(
      { deckId: "strategy-a", deckListId: "standalone", selectionKey: '[null,"standalone"]' },
      "strategy-a",
      options
    ),
    { deckId: "strategy-a", deckListId: "", selectionKey: "" }
  );
  assert.deepEqual(
    selectDeck(
      {
        deckId: "strategy-a",
        deckListId: "list-a",
        selectionKey: '["strategy-a","list-a"]'
      },
      "",
      options
    ),
    { deckId: "", deckListId: "", selectionKey: "" }
  );
});

test("Deck List mutations let successful redirects escape error handling", () => {
  const actions = source("app/(app)/deck-lists/actions.ts");
  for (const action of ["deleteDeckListAction", "setDeckListAssociationAction"]) {
    const start = actions.indexOf(`export async function ${action}`);
    const body = actions.slice(start, actions.indexOf("\n}", start) + 2);
    const catchEnd = body.lastIndexOf("  }\n}");
    const redirectIndex = body.indexOf("redirect(");
    assert.ok(start >= 0, `${action} exists`);
    assert.ok(redirectIndex > catchEnd, `${action} redirects after its catch block`);
    assert.match(body, /resolveActionFailure/);
  }
});

test("strategy deletion never adopts an unrelated standalone list collision", () => {
  const migration = source("supabase/migrations/20260821003055_first_class_deck_lists.sql");
  const freshSchema = source("schema.sql");

  for (const sql of [migration, freshSchema]) {
    const helper = sql.slice(
      sql.indexOf("create or replace function public.preserve_deleted_deck_legacy_references("),
      sql.indexOf("create or replace function public.delete_owned_deck(")
    );

    assert.doesNotMatch(
      helper,
      /deck_list\.deck_id\s*=\s*p_deck_id\s+or\s+deck_list\.deck_id\s+is\s+null/i
    );
    assert.match(
      helper,
      /where\s+log\.user_id\s*=\s*p_user_id\s+and\s+log\.linked_deck_id\s*=\s*p_deck_id[\s\S]*?linked_deck_list_id\s*=\s*null/i
    );
    assert.match(
      helper,
      /where\s+tournament\.user_id\s*=\s*p_user_id\s+and\s+tournament\.linked_deck_id\s*=\s*p_deck_id[\s\S]*?linked_deck_list_id\s*=\s*null/i
    );
  }
});

test("Deck List detail retains strategy-scoped legacy records without a standalone index", () => {
  const db = source("lib/db/deck-lists.ts");
  const indexPage = source("app/(app)/deck-lists/page.tsx");
  const detailPage = source("app/(app)/deck-lists/[listId]/page.tsx");

  assert.match(db, /mergeDeckListReadModels/);
  assert.match(db, /parseLegacyDeckList/);
  assert.match(db, /getDeckListById\([\s\S]*deckId\?/);
  assert.match(db, /from\("decks"\)[\s\S]*deck_lists/);
  assert.match(indexPage, /redirect\("\/decks"\)/);
  assert.doesNotMatch(indexPage, /deckList\.deckId/);
  assert.match(detailPage, /searchParams/);
  assert.match(detailPage, /getDeckListById\([\s\S]*deckId/);
  assert.match(detailPage, /deckId=\{deckList\.deckId/);
});

test("composite selector identity preserves same-id strategy copies and canonical payload ids", () => {
  const sharedA = makeDeckListSelectionKey({ deckId: "strategy-a", deckListId: "shared-id" });
  const sharedB = makeDeckListSelectionKey({ deckId: "strategy-b", deckListId: "shared-id" });
  const standalone = makeDeckListSelectionKey({ deckId: null, deckListId: "shared-id" });
  const options: DeckListSelectionOption[] = [
    { deckId: "strategy-a", deckName: "A", id: "shared-id", name: "A list", selectionKey: sharedA },
    { deckId: "strategy-b", deckName: "B", id: "shared-id", name: "B list", selectionKey: sharedB },
    { deckId: null, deckName: null, id: "standalone", name: "Standalone", selectionKey: standalone }
  ];

  const empty: DeckListSelectionState = { deckId: "", deckListId: "", selectionKey: "" };
  assert.notEqual(sharedA, sharedB);
  assert.deepEqual(selectDeckList(empty, sharedA, options), {
    deckId: "strategy-a",
    deckListId: "shared-id",
    selectionKey: sharedA
  });
  assert.deepEqual(selectDeckList(empty, sharedB, options), {
    deckId: "strategy-b",
    deckListId: "shared-id",
    selectionKey: sharedB
  });
  assert.deepEqual(selectDeckList(empty, standalone, options), {
    deckId: "",
    deckListId: "standalone",
    selectionKey: standalone
  });

  const importDialog = source("components/ui/ImportLogDialog.tsx");
  const editDialog = source("components/ui/EditLogDialog.tsx");
  const logsManager = source("components/ui/LogsManager.tsx");
  const dock = source("components/ui/LogsManagementDock.tsx");
  for (const file of [importDialog, editDialog, logsManager, dock]) {
    assert.match(file, /selectionKey/);
    assert.doesNotMatch(file, /value: deckList\.id/);
  }
  assert.match(logsManager, /linkedDeckListId:.*selectedDeckList/);
});

test("first-class create and association preserve visual order without rewriting independent lists", () => {
  const migration = source("supabase/migrations/20260821003055_first_class_deck_lists.sql");
  const freshSchema = source("schema.sql");

  for (const sql of [migration, freshSchema]) {
    const createBlock = sql.slice(
      sql.indexOf("create or replace function public.commit_first_class_deck_list("),
      sql.indexOf("revoke all on function public.commit_first_class_deck_list")
    );
    const associationBlock = sql.slice(
      sql.indexOf("create or replace function public.set_deck_list_association("),
      sql.indexOf("revoke all on function public.set_deck_list_association")
    );

    assert.match(createBlock, /coalesce\(min\(position\)\s*-\s*1,\s*0\)/i);
    assert.match(createBlock, /position,\s*created_at/i);
    assert.match(associationBlock, /v_new_position\s+integer/i);
    assert.match(associationBlock, /coalesce\(min\(position\)\s*-\s*1,\s*0\)/i);
    assert.match(associationBlock, /set\s+deck_id\s*=\s*v_new_deck_id,\s*position\s*=\s*v_new_position/i);
    assert.match(associationBlock, /jsonb_build_array\(v_list_json\)\s*\|\|/i);
  }
});

test("legacy-only detail is edit/adopt-only and never targets a same-id relational row", () => {
  const detailPage = source("app/(app)/deck-lists/[listId]/page.tsx");
  assert.match(detailPage, /deckList\.storage\s*===\s*["']legacy["']/);
  assert.match(detailPage, /exact-adopt/i);
  assert.match(detailPage, /Delete and association controls are unavailable/i);

  for (const sql of [
    source("supabase/migrations/20260821003055_first_class_deck_lists.sql"),
    source("schema.sql")
  ]) {
    const commitBlock = sql.slice(
      sql.indexOf("create or replace function public.commit_first_class_deck_list("),
      sql.indexOf("revoke all on function public.commit_first_class_deck_list")
    );

    assert.match(commitBlock, /if\s+v_current\.id\s+is\s+not\s+null\s+and\s+v_current\.deck_id\s+is\s+distinct\s+from\s+v_deck_id/i);
    assert.match(commitBlock, /v_current\.deck_id\s+is distinct from v_deck_id/i);
    assert.match(commitBlock, /_legacySourceDeckId/);
    assert.match(commitBlock, /v_target_id\s*:=\s*gen_random_uuid\(\)::text/i);
    assert.match(
      commitBlock,
      /from public\.decks[\s\S]*where user_id = v_user_id[\s\S]*and id = v_deck_id[\s\S]*for update/i
    );
    assert.match(
      commitBlock,
      /update public\.logs[\s\S]*linked_deck_id = v_deck_id[\s\S]*linked_deck_list_id = v_list_id/i
    );
    assert.match(
      commitBlock,
      /update public\.tournaments[\s\S]*linked_deck_id = v_deck_id[\s\S]*linked_deck_list_id = v_list_id/i
    );
    const canonicalCopyExclusions = commitBlock.match(
      /and not \(\s*v_current\.deck_id\s+is not null\s+and deck\.id\s*=\s*v_current\.deck_id\s+and item\.value ->> 'id'\s*=\s*v_current\.id\s*\)/gi
    ) ?? [];
    assert.equal(canonicalCopyExclusions.length, 2);
    assert.match(commitBlock, /if v_legacy_match_count\s*<>\s*1 then/i);
    assert.match(commitBlock, /if v_legacy_match_count\s*>\s*1 then/i);
  }
});

test("exact legacy adoption redirects to the committed target instead of the colliding id", () => {
  const actions = source("app/(app)/decks/actions.ts");
  assert.match(actions, /deckListId\s*&&\s*result\.deckListId\s*!==\s*deckListId/);
  assert.match(actions, /\/deck-lists\/\$\{encodeURIComponent\(result\.deckListId\)\}/);
  assert.match(actions, /deckId=\$\{encodeURIComponent\(result\.deckId\)\}/);
});
