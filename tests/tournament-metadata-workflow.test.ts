import assert from "node:assert/strict";
import test from "node:test";
import {
  getTournamentMetadataRequestId,
  parseTournamentCommandResult,
  toTournamentCommandError
} from "@/lib/tournaments/metadata-workflow";

test("Tournament metadata command identity is stable for repeated create and update FormData", () => {
  const create = new FormData();
  create.set("creationKey", "create-1");
  const update = new FormData();
  update.set("commandKey", "update-1");
  assert.equal(getTournamentMetadataRequestId(create, "create"), "create-1");
  assert.equal(getTournamentMetadataRequestId(create, "create"), "create-1");
  assert.equal(getTournamentMetadataRequestId(update, "update"), "update-1");
});

test("Tournament command result and failure mapping preserve practical statuses", () => {
  assert.deepEqual(
    parseTournamentCommandResult(
      { status: "idempotent", tournamentId: "tournament-1", requestId: "create-1" },
      "create-1",
      "fallback"
    ),
    { status: "idempotent", tournamentId: "tournament-1", requestId: "create-1" }
  );
  assert.equal(toTournamentCommandError({ code: "P0001", message: "Tournament changed; refresh-and-retry" })?.code, "stale");
  assert.equal(toTournamentCommandError({ code: "42501", message: "not owned by this account" })?.code, "ownership");
  assert.equal(toTournamentCommandError({ code: "22023", message: "A field is required" })?.code, "validation");
  assert.equal(toTournamentCommandError({ code: "23505", message: "That Tournament creation identity is already in use." })?.code, "validation");
  assert.equal(toTournamentCommandError({ code: "40001", message: "serialization failure" })?.code, "retryable");
});
