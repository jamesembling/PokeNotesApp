import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { UserFacingActionError } from "@/lib/server/action-errors";
import { isTournamentMultiDay, normalizeTournamentDateRange } from "@/lib/tournaments/date-range";
import {
  toggleRoundGameResult,
  toggleRoundSpecialResult
} from "@/lib/tournaments/round-result-selection";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260821001249_create_tournament_round_atomic.sql"),
  "utf8"
);

test("reversed tournament dates fail before persistence", () => {
  const formData = new FormData();
  formData.set("dateFrom", "2026-08-10");
  formData.set("dateTo", "2026-08-09");
  assert.throws(() => normalizeTournamentDateRange(formData), (error) =>
    error instanceof UserFacingActionError &&
    error.message === "Choose an end date on or after the start date."
  );
});

test("blank tournament end dates normalize to the start date", () => {
  const formData = new FormData();
  formData.set("dateFrom", "2026-05-10");
  formData.set("dateTo", "");

  assert.deepEqual(normalizeTournamentDateRange(formData), {
    dateFrom: "2026-05-10",
    dateTo: "2026-05-10"
  });
});

test("equal dates remain single-day when reopening the editor", () => {
  assert.equal(isTournamentMultiDay("2026-08-10", "2026-08-10"), false);
  assert.equal(isTournamentMultiDay("2026-08-10", "2026-08-11"), true);
});

test("round result controls select, replace, and clear one outcome model", () => {
  assert.deepEqual(toggleRoundGameResult(["W", "", ""], 0, "W"), {
    gameResults: ["", "", ""],
    specialResult: ""
  });
  assert.deepEqual(toggleRoundGameResult(["W", "", ""], 0, "L"), {
    gameResults: ["L", "", ""],
    specialResult: ""
  });
  assert.deepEqual(toggleRoundSpecialResult(["W", "L", ""], "", "BYE"), {
    gameResults: ["", "", ""],
    specialResult: "BYE"
  });
  assert.deepEqual(toggleRoundSpecialResult(["", "", ""], "BYE", "BYE"), {
    gameResults: ["", "", ""],
    specialResult: ""
  });
});

test("round allocation locks the owned tournament and is independently deployable", () => {
  assert.match(migration, /from public\.tournaments as tournament[\s\S]*for update;/);
  assert.match(migration, /select coalesce\(max\(round\.round_number\), 0\) \+ 1/);
  assert.match(migration, /insert into public\.tournament_rounds/);
  assert.match(migration, /grant execute on function public\.create_tournament_round/);
  assert.match(migration, /raise exception using errcode = 'P0002', message = 'Tournament could not be found\.'/);
  assert.doesNotMatch(migration, /commit_tournament_deck_list|deck_lists|public\.decks/);

  const canonicalSchema = readFileSync(join(process.cwd(), "schema.sql"), "utf8");
  assert.match(canonicalSchema, /create or replace function public\.create_tournament_round[\s\S]*raise exception using errcode = 'P0002'/);
});

test("pre-migration round creation keeps a narrowly classified RPC fallback", () => {
  const actions = readFileSync(join(process.cwd(), "app/(app)/tournaments/actions.ts"), "utf8");
  assert.match(actions, /create_tournament_round/);
  assert.match(actions, /isMissingTournamentRoundRpc/);
  assert.match(actions, /from\("tournament_rounds"\)\.insert/);
  assert.match(actions, /tournament_rounds_result_check/);
});
