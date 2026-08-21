import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createDeckAggregateWriter } from "@/lib/decks/deck-aggregate-writer";
import type { DeckCard } from "@/types/index";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const migration = source("supabase/migrations/20260821003055_first_class_deck_lists.sql");
const schema = source("schema.sql");

test("old direct Strategy DELETE remains granted and invokes safe preservation", () => {
  for (const sql of [migration, schema]) {
    assert.doesNotMatch(sql, /revoke delete on table public\.decks from public, anon, authenticated/i);
    assert.match(sql, /create trigger preserve_deleted_deck_references_before_delete[\s\S]*?on public\.decks/i);
    assert.match(sql, /preserve_deleted_deck_references_before_delete[\s\S]*?preserve_deleted_deck_legacy_references/i);
  }
});

test("schema health checks the first-class Deck List contract", () => {
  const health = source("scripts/schema-health.mjs");
  for (const name of [
    "commit_first_class_deck_list",
    "set_deck_list_association",
    "delete_first_class_deck_list",
    "delete_owned_deck"
  ]) {
    assert.match(health, new RegExp(`\\"${name}\\"`));
  }
  assert.match(health, /deck_lists_user_creation_key_unique/);
  assert.match(health, /deck_lists_pkey/);
  assert.match(health, /authenticated_can_delete_decks/);
  assert.match(health, /first_class_deck_list_rpcs_are_callable/);
});

const CARDS: DeckCard[] = [{ count: 2, name: "Dragapult ex", number: "130", set: "TWM" }];

test("Deck List edit uses the editor-observed updatedAt, not a freshly loaded version", async () => {
  const plans: Array<Record<string, unknown>> = [];
  const writer = createDeckAggregateWriter({
    actor: { defaultCreatedBy: "Trainer", userId: "user-1" },
    adapter: {
      async commitDeckList(plan) {
        plans.push(plan as unknown as Record<string, unknown>);
        return { deckId: null, deckListId: "list-1", status: "committed" };
      },
      async loadDeckList() {
        return {
          createdAt: "2026-08-19T00:00:00.000Z",
          date: "2026-08-19",
          deckId: null,
          id: "list-1",
          name: "Current name",
          format: "Standard",
          createdBy: "Trainer",
          notes: "Current notes",
          rawList: "2 Dragapult ex TWM 130",
          parsedCards: CARDS,
          sortedCards: CARDS,
          sortedCardsVersion: 1,
          updatedAt: "2026-08-21T01:00:00.000Z"
        };
      },
      async commit() {
        throw new Error("legacy adapter must not be used");
      },
      async loadLegacyChildren() {
        throw new Error("legacy children must not be loaded");
      }
    },
    now: () => "2026-08-21T01:01:00.000Z",
    parseCards: () => CARDS,
    sortCards: async () => CARDS
  });

  await writer.saveList({
    createdBy: "Trainer",
    date: "2026-08-21",
    deckId: null,
    deckListId: "list-1",
    format: "Standard",
    name: "Edited name",
    notes: "Edited notes",
    rawList: "2 Dragapult ex TWM 130",
    submittedCreatedAt: "2026-08-19T00:00:00.000Z",
    submittedUpdatedAt: "2026-08-20T00:00:00.000Z"
  });

  assert.equal(plans[0]?.expectedChildUpdatedAt, "2026-08-20T00:00:00.000Z");
});

test("first-class references are independent while legacy fallback stays strategy-scoped", () => {
  const reference = migration.slice(
    migration.indexOf("create or replace function public.can_use_deck_list_reference("),
    migration.indexOf("-- The pre-existing compatibility RPC")
  );
  const readModel = migration.slice(migration.indexOf("create or replace function public.get_initial_logs_page_data("));
  assert.match(reference, /deck_list\.user_id = p_user_id[\s\S]*deck_list\.id = p_deck_list_id/);
  assert.match(reference, /jsonb_array_elements\(deck\.deck_lists\)[\s\S]*item\.value ->> 'id' = p_deck_list_id/);
  assert.doesNotMatch(reference, /deck_list\.deck_id = p_deck_id[\s\S]*then true/);
  assert.match(readModel, /relational_list\.id = ordered_logs\.linked_deck_list_id/);
  assert.match(readModel, /aggregate_list\.name/);
});

test("association synchronizes legacy JSON from the trigger-authoritative relational timestamp", () => {
  const association = migration.slice(
    migration.indexOf("create or replace function public.set_deck_list_association("),
    migration.indexOf("revoke all on function public.set_deck_list_association")
  );
  assert.match(association, /update public\.deck_lists[\s\S]*returning \* into v_list/);
  assert.match(association, /'updatedAt', v_list\.updated_at/);
  assert.doesNotMatch(association, /'updatedAt', p_updated_at/);
});

test("Deck List foundation does not add Tournament command or mutable-source evidence behavior", () => {
  const tournamentActions = source("app/(app)/tournaments/actions.ts");
  const tournamentPage = source("app/(app)/tournaments/[id]/page.tsx");
  assert.doesNotMatch(tournamentActions, /validateDeckListReference/);
  assert.doesNotMatch(tournamentPage, /getDeckListById/);
  assert.match(tournamentPage, /tournament\.linkedDeckId && tournament\.linkedDeckListId \?/);
});
