import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  isDeckListStaleVersionError,
  isMissingFirstClassDeckListRpc
} from "@/lib/decks/deck-aggregate-writer";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260821003055_first_class_deck_lists.sql"),
  "utf8"
);
const schema = readFileSync(join(process.cwd(), "schema.sql"), "utf8");

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("Deck List identity is account-scoped in migration and fresh schema", () => {
  assert.match(migration, /drop constraint if exists deck_lists_pkey/i);
  assert.match(migration, /add constraint deck_lists_pkey primary key \(user_id, id\)/i);
  assert.doesNotMatch(migration, /create unique index[^;]+on public\.deck_lists \(id\)/i);
  assert.match(migration, /where user_id = v_user_id\s+and id = v_list_id/i);

  const finalState = schema.slice(schema.indexOf("-- Final first-class Deck List state"));
  assert.match(finalState, /drop constraint if exists deck_lists_pkey/i);
  assert.match(finalState, /add constraint deck_lists_pkey primary key \(user_id, id\)/i);
});

test("the opposite-lock legacy RPC is revoked and only the reviewed wrapper is callable", () => {
  assert.match(
    migration,
    /commit_deck_aggregate_child_legacy_parent_first[\s\S]{0,500}revoke all on function/i
  );
  assert.match(
    migration,
    /revoke all on function public\.commit_deck_aggregate_child_legacy_parent_first\(/i
  );
  assert.match(
    migration,
    /create or replace function public\.commit_deck_aggregate_child\([\s\S]*?security definer/i
  );
});

test("RPC rollout fallback requires the intended first-class function/signature", () => {
  assert.equal(
    isMissingFirstClassDeckListRpc({
      code: "42883",
      message:
        "function public.commit_first_class_deck_list(text, text, jsonb, text, timestamp with time zone, timestamp with time zone) does not exist"
    }),
    true
  );
  assert.equal(
    isMissingFirstClassDeckListRpc({
      code: "PGRST202",
      details:
        "Searched for the function public.commit_first_class_deck_list with parameters p_deck_id, p_operation, p_payload, p_creation_key, p_expected_updated_at, p_updated_at"
    }),
    true
  );
  assert.equal(
    isMissingFirstClassDeckListRpc({
      code: "42883",
      message: "function public.commit_first_class_deck_list_internal(text) does not exist"
    }),
    false
  );
  assert.equal(
    isMissingFirstClassDeckListRpc({ code: "42883", message: "operator does not exist" }),
    false
  );
});

test("stale Deck List RPC errors are narrowly classified for actionable retry UX", () => {
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
  assert.match(source("lib/decks/deck-aggregate-writer.ts"), /DECK_LIST_STALE_VERSION/);
  assert.match(source("lib/decks/deck-list-association-service.ts"), /DECK_LIST_STALE_VERSION/);
  assert.match(source("app/(app)/decks/actions.ts"), /saveDeckList/);
});

test("Deck List deletion and association invalidate Tournament index and detail routes", () => {
  const actions = source("app/(app)/deck-lists/actions.ts");
  const revalidation = source("lib/server/revalidation.ts");
  assert.match(actions, /from\("tournaments"\)/);
  assert.match(actions, /revalidateDeckAndLogWorkspace/);
  assert.match(actions, /tournamentIds/);
  assert.match(revalidation, /revalidatePath\("\/tournaments", "layout"\)/);
  assert.match(revalidation, /revalidatePath\(`\/tournaments\/\$\{[^}]+\}`/);
});

test("standalone list-only consumers hydrate details, ordering, sharing, and saved-log views", () => {
  const names = source("lib/db/log-linked-deck-list-names.ts");
  const context = source("app/api/log-detail-context/route.ts");
  const shareAction = source("app/(app)/logs/actions.ts");
  const tournamentPage = source("app/(app)/tournaments/[id]/page.tsx");
  const deckListRoute = source("app/api/deck-list/route.ts");
  const initialReadModel = source("supabase/migrations/20260821003055_first_class_deck_lists.sql");

  assert.match(names, /getDeckListSelectionOptions/);
  assert.match(names, /if \(!log\.linkedDeckListId\)/);
  assert.match(context, /getDeckListById/);
  assert.match(shareAction, /getDeckListById/);
  assert.doesNotMatch(tournamentPage, /getDeckListById/);
  assert.match(tournamentPage, /getDeckWithList/);
  assert.match(deckListRoute, /if \(!listId\)/);
  assert.match(initialReadModel, /create or replace function public\.get_initial_logs_page_data/);
  assert.match(
    initialReadModel,
    /relational_list\.user_id = ordered_logs\.user_id[\s\S]*relational_list\.id = ordered_logs\.linked_deck_list_id/i
  );
  assert.match(
    initialReadModel,
    /relational_list\.id = ordered_logs\.linked_deck_list_id[\s\S]*select count\(\*\)[\s\S]*\) <> 1/i
  );
});

test("Deck List deletion requires deliberate confirmation and explains reference cleanup", () => {
  const page = source("app/(app)/deck-lists/[listId]/page.tsx");
  const button = source("components/ui/DeleteDeckListButton.tsx");

  assert.match(page, /DeleteDeckListButton/);
  assert.doesNotMatch(page, /<Button type="submit" variant="destructive">Delete List<\/Button>/);
  assert.match(button, /linked logs|tournaments|references/i);
  assert.match(button, /disabled=\{isSubmitting\}/);
  assert.match(button, /onSubmit=\{\(\) => setIsSubmitting\(true\)\}/);
});

test("Deck List direct DML is revoked while reviewed RPCs are definer-owned", () => {
  assert.match(
    migration,
    /revoke all privileges on table public\.deck_lists from public, anon, authenticated/i
  );
  assert.match(migration, /grant select on table public\.deck_lists to authenticated/i);
  assert.match(
    migration,
    /create or replace function public\.commit_first_class_deck_list\([\s\S]*?security definer[\s\S]*?set search_path = pg_catalog, public/i
  );
  assert.match(
    migration,
    /create or replace function public\.set_deck_list_association\([\s\S]*?security definer[\s\S]*?set search_path = pg_catalog, public/i
  );
  assert.match(
    migration,
    /create or replace function public\.delete_first_class_deck_list\([\s\S]*?security definer[\s\S]*?set search_path = pg_catalog, public/i
  );
  const finalState = schema.slice(schema.indexOf("-- Final first-class Deck List state"));
  assert.match(
    finalState,
    /revoke all privileges on table public\.deck_lists from public, anon, authenticated/i
  );
  assert.match(finalState, /grant select on table public\.deck_lists to authenticated/i);
  assert.match(finalState, /delete_first_class_deck_list\([\s\S]*?security definer/i);
  assert.match(source("lib/decks/deck-list-service.ts"), /rpc\("delete_first_class_deck_list"/);
  assert.match(source("app/(app)/deck-lists/actions.ts"), /deleteDeckList/);
  assert.doesNotMatch(source("app/(app)/deck-lists/actions.ts"), /from\("deck_lists"\)\s*\.delete/);
});
