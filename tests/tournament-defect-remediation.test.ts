import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { UserFacingActionError } from "@/lib/server/action-errors";
import { CANONICAL_DECK_LIST_SORT_VERSION } from "@/lib/deck-lists/version";
import { buildTournamentDeckList } from "@/lib/tournaments/deck-list";
import {
  isTournamentMultiDay,
  normalizeTournamentDateRange
} from "@/lib/tournaments/date-range";
import type { DeckCard } from "@/types/index";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("reversed tournament dates fail before reaching the database constraint", () => {
  const formData = new FormData();
  formData.set("dateFrom", "2026-08-10");
  formData.set("dateTo", "2026-08-09");

  assert.throws(
    () => normalizeTournamentDateRange(formData),
    (error) =>
      error instanceof UserFacingActionError &&
      error.message === "Choose an end date on or after the start date."
  );
});

test("only a genuinely longer tournament date range reopens as multi-day", () => {
  assert.equal(isTournamentMultiDay("2026-08-10", "2026-08-10"), false);
  assert.equal(isTournamentMultiDay("2026-08-10", "2026-08-11"), true);
  assert.equal(isTournamentMultiDay("2026-08-10", ""), false);
});

test("tournament deck-list preparation preserves canonical sorted-card output", async () => {
  const formData = new FormData();
  formData.set("name", "Regional list");
  formData.set("format", "Standard");
  formData.set("rawList", "1 Test Card TST 1");
  const parsedCards = [{ count: 1, name: "Test Card", number: "1", set: "TST" }] as DeckCard[];
  const sortedCards = [{ ...parsedCards[0], category: "Pokemon" }] as DeckCard[];

  const deckList = await buildTournamentDeckList({
    createId: () => "list-1",
    defaultCreatedBy: "Trainer",
    formData,
    now: () => "2026-08-04T12:00:00.000Z",
    parseCards: () => parsedCards,
    sortCards: async (cards) => {
      assert.equal(cards, parsedCards);
      return sortedCards;
    }
  });

  assert.deepEqual(deckList.sortedCards, sortedCards);
  assert.equal(deckList.sortedCardsVersion, CANONICAL_DECK_LIST_SORT_VERSION);
  assert.equal(deckList.createdBy, "Trainer");
  assert.equal(deckList.date, "2026-08-04");
});

test("tournament deck, list, and link commit is one fail-closed database transaction", () => {
  const migration = source(
    "supabase/migrations/20260804210932_make_tournament_writes_atomic.sql"
  );
  const functionBody = migration.slice(
    migration.indexOf("create or replace function public.commit_tournament_deck_list"),
    migration.indexOf("create or replace function public.create_tournament_round")
  );

  assert.match(functionBody, /from public\.tournaments as tournament[\s\S]*for update;/);
  assert.match(functionBody, /insert into public\.decks/);
  assert.match(functionBody, /public\.commit_deck_aggregate_child\(/);
  assert.match(functionBody, /if v_commit_result is distinct from 'committed' then[\s\S]*raise exception/);
  assert.match(functionBody, /update public\.tournaments as tournament/);
  assert.match(functionBody, /security invoker/);
  assert.match(functionBody, /tournament\.user_id = v_user_id/);

  const canonicalSchema = source("schema.sql");
  assert.match(canonicalSchema, /function public\.commit_tournament_deck_list\(/);
});

test("new tournament rounds allocate under the owned parent row lock", () => {
  const migration = source(
    "supabase/migrations/20260804210932_make_tournament_writes_atomic.sql"
  );
  const functionBody = migration.slice(
    migration.indexOf("create or replace function public.create_tournament_round")
  );

  assert.match(functionBody, /from public\.tournaments as tournament[\s\S]*for update;/);
  assert.match(functionBody, /select coalesce\(max\(round\.round_number\), 0\) \+ 1/);
  assert.match(functionBody, /insert into public\.tournament_rounds/);
  assert.match(functionBody, /tournament\.user_id = v_user_id/);
  assert.match(functionBody, /security invoker/);

  const canonicalSchema = source("schema.sql");
  assert.match(canonicalSchema, /function public\.create_tournament_round\(/);
});

test("23514 only reports stale round SQL for the named round-result constraint", () => {
  const actions = source("app/(app)/tournaments/actions.ts");

  assert.match(actions, /includes\("tournament_rounds_result_check"\)/);
  assert.doesNotMatch(actions, /if \(error\.code === "23514"\)/);
});
