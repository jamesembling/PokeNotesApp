import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const migration = source("supabase/migrations/20260821003055_first_class_deck_lists.sql");
const schema = source("schema.sql");

test("first-class creation rejects same-account legacy identity collisions", () => {
  const createBlock = migration.slice(
    migration.indexOf("create or replace function public.commit_first_class_deck_list("),
    migration.indexOf("create or replace function public.set_deck_list_association(")
  );

  assert.match(createBlock, /p_operation = 'create'/i);
  assert.match(createBlock, /from public\.decks[\s\S]*jsonb_array_elements[\s\S]*item\.value ->> 'id' = v_list_id/i);
  assert.match(createBlock, /deck\.user_id = v_user_id/i);
  assert.match(createBlock, /already represented by a legacy Deck List/i);
  assert.match(createBlock, /legacySourceDeckId|legacy_source_deck_id/i);
  assert.match(source("lib/decks/deck-aggregate-writer.ts"), /_legacySourceDeckId/);
});

test("legacy adoption is exact and ambiguous same-account copies fail closed", () => {
  const updateBlock = migration.slice(
    migration.indexOf("else\n    -- Updates lock the list identity"),
    migration.indexOf("-- Keep the associated legacy copy synchronized")
  );

  assert.match(updateBlock, /legacy_source_deck_id|_legacySourceDeckId/i);
  assert.match(updateBlock, /count\(\*\)/i);
  assert.match(updateBlock, /ambiguous/i);
  assert.match(updateBlock, /p_expected_updated_at/i);
  assert.match(updateBlock, /jsonb_array_elements/i);
  assert.match(updateBlock, /user_id = v_user_id/i);
});

test("strategy deletion uses the reviewed serialized RPC boundary", () => {
  const deleteBlock = migration.slice(
    migration.indexOf("create or replace function public.delete_owned_deck("),
    migration.indexOf("create or replace function public.delete_first_class_deck_list(")
  );

  assert.match(deleteBlock, /security definer[\s\S]*set search_path = pg_catalog, public/i);
  assert.match(deleteBlock, /pg_advisory_xact_lock/i);
  assert.match(deleteBlock, /from public\.decks[\s\S]*for update/i);
  assert.match(deleteBlock, /delete from public\.decks/i);
  assert.doesNotMatch(migration, /revoke delete on table public\.decks from public, anon, authenticated/i);
  assert.match(
    migration,
    /create trigger preserve_deleted_deck_references_before_delete[\s\S]*?on public\.decks/i
  );
  assert.match(migration, /grant execute on function public\.delete_owned_deck/i);

  const deleteService = source("lib/decks/delete-service.ts");
  assert.match(deleteService, /rpc\("delete_owned_deck"/);
  assert.doesNotMatch(deleteService, /from\("decks"\)[\s\S]*\.delete\(/);
  assert.match(schema, /create or replace function public\.delete_owned_deck\(/i);
});

test("Deck List and strategy mutations share centralized invalidation", () => {
  const revalidation = source("lib/server/revalidation.ts");
  const deckActions = source("app/(app)/decks/actions.ts");
  const listActions = source("app/(app)/deck-lists/actions.ts");

  assert.match(revalidation, /revalidatePath\("\/deck-lists", "layout"\)/);
  assert.match(revalidation, /revalidatePath\("\/tournaments", "layout"\)/);
  assert.match(revalidation, /deckListIds|deckListId/);
  assert.match(revalidation, /tournamentIds|tournamentId/);
  assert.match(deckActions, /from\("deck_lists"\)/);
  assert.match(deckActions, /from\("tournaments"\)/);
  assert.match(deckActions, /in\("linked_deck_list_id", deckListIds\)/);
  assert.match(deckActions, /revalidateDeckAndLogWorkspace\([\s\S]*deckList/);
  assert.match(listActions, /revalidateDeckAndLogWorkspace/);
  assert.doesNotMatch(listActions, /function revalidateDeckListWorkspace/);
});

test("log dialogs select from flat account-owned lists and preserve list-only state", () => {
  const types = source("types/index.ts");
  const api = source("app/api/deck-selection-options/route.ts");
  const provider = source("components/ui/ImportDialogDataProvider.tsx");
  const importDialog = source("components/ui/ImportLogDialog.tsx");
  const editDialog = source("components/ui/EditLogDialog.tsx");
  const lazyEdit = source("components/ui/LazyEditLogButton.tsx");
  const dock = source("components/ui/LogsManagementDock.tsx");

  assert.match(types, /export type DeckListSelectionOption/);
  assert.match(api, /getDeckListSelectionOptions/);
  assert.match(api, /deckLists/);
  assert.match(provider, /userDeckLists/);
  assert.match(importDialog, /userDeckLists/);
  assert.match(importDialog, /const availableDeckLists = userDeckLists/);
  assert.doesNotMatch(importDialog, /if \(!selectedDeckId\)[\s\S]{0,100}setSelectedDeckListId\(""\)/);
  assert.match(editDialog, /userDeckLists/);
  assert.match(editDialog, /const availableDeckLists = userDeckLists/);
  assert.doesNotMatch(editDialog, /if \(!selectedDeckId\)[\s\S]{0,100}setSelectedDeckListId\(""\)/);
  assert.match(lazyEdit, /userDeckLists/);
  assert.match(dock, /DeckListSelectionOption/);
  assert.match(dock, /userDeckLists/);
});

test("Deck Lists remain contextual and are not exposed as a standalone site section", () => {
  const sidebar = source("components/ui/Sidebar.tsx");
  const page = source("app/(app)/deck-lists/page.tsx");

  assert.doesNotMatch(sidebar, /label: "Deck Lists"/);
  assert.doesNotMatch(sidebar, /href: "\/deck-lists"/);
  assert.match(page, /redirect\("\/decks"\)/);
  assert.doesNotMatch(page, /LazyDeckListEditorButton/);
});
