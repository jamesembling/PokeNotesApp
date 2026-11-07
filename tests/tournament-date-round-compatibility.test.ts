import assert from "node:assert/strict";
import test from "node:test";
import { UserFacingActionError } from "@/lib/server/action-errors";
import { isTournamentMultiDay, normalizeTournamentDateRange } from "@/lib/tournaments/date-range";
import { formatTournamentDateRange } from "@/lib/tournaments/display";
import {
  toggleRoundGameResult,
  toggleRoundSpecialResult
} from "@/lib/tournaments/round-result-selection";

test("reversed tournament dates fail before persistence", () => {
  const formData = new FormData();
  formData.set("dateFrom", "2026-08-10");
  formData.set("dateTo", "2026-08-09");
  assert.throws(() => normalizeTournamentDateRange(formData), (error) =>
    error instanceof UserFacingActionError &&
    error.message === "Choose an end date on or after the start date."
  );
});

test("tournament date ranges preserve calendar days across timezones", () => {
  const formData = new FormData();
  formData.set("dateFrom", "2026-05-10");
  formData.set("dateTo", "");

  assert.deepEqual(normalizeTournamentDateRange(formData), {
    dateFrom: "2026-05-10",
    dateTo: "2026-05-10"
  });
  assert.equal(isTournamentMultiDay("2026-08-10", "2026-08-10"), false);
  assert.equal(isTournamentMultiDay("2026-08-10", "2026-08-11"), true);

  const originalTimezone = process.env.TZ;
  try {
    for (const timezone of ["Europe/London", "Pacific/Auckland", "America/Los_Angeles"]) {
      process.env.TZ = timezone;
      assert.equal(formatTournamentDateRange("2026-06-10", "2026-06-12"), "10-12 Jun 2026");
      assert.equal(formatTournamentDateRange("2026-06-01", "2026-06-02"), "1-2 Jun 2026");
      assert.equal(
        formatTournamentDateRange("2026-06-30", "2026-07-01"),
        "30 Jun 2026 - 1 Jul 2026"
      );
      assert.equal(formatTournamentDateRange("2026-06-10", "2026-06-10"), "10 Jun 2026");
    }
  } finally {
    if (originalTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimezone;
  }
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
