import assert from "node:assert/strict";
import test from "node:test";
import {
  getTournamentMetadataRequestId,
  parseTournamentCommandResult,
  toTournamentCommandError
} from "@/lib/tournaments/metadata-workflow";
import { requireCasMutationResult } from "@/lib/server/cas-mutation";
import { parseTournamentMetadataCommand } from "@/lib/tournaments/metadata-command";

test("Tournament metadata command identity is stable for repeated create and update FormData", () => {
  const create = new FormData();
  create.set("creationKey", "create-1");
  const update = new FormData();
  update.set("commandKey", "update-1");
  assert.equal(getTournamentMetadataRequestId(create, "create"), "create-1");
  assert.equal(getTournamentMetadataRequestId(create, "create"), "create-1");
  assert.equal(getTournamentMetadataRequestId(update, "update"), "update-1");
});

test("create and update metadata use the same validated parser contract", () => {
  const formData = new FormData();
  formData.set("name", "League Cup");
  formData.set("format", "standard");
  formData.set("dateFrom", "2026-09-20");
  formData.set("dateTo", "2026-09-21");
  formData.set("participation", "player");
  formData.set("championshipPoints", "50");
  formData.set("category", "cup");
  formData.set("placement", "t8");
  formData.set("tournamentIdentifier", "LC-42");
  formData.set("location", "London");
  formData.set("notes", "Finals");
  formData.append("deckSprites", "pikachu");

  const input = {
    formData,
    format: "standard",
    linkedDeckListId: "list-1",
    resolvedDeck: {
      linkedDeckId: "deck-1",
      deckName: "Pikachu",
      deckSprites: ["pikachu"]
    }
  } as const;

  assert.deepEqual(
    parseTournamentMetadataCommand(input),
    parseTournamentMetadataCommand(input)
  );
  assert.throws(() => parseTournamentMetadataCommand({
    ...input,
    formData: new FormData()
  }), /tournament name/i);
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
  assert.equal(toTournamentCommandError({ code: "P0001", message: "Deck List changed; refresh-and-retry before creating its Strategy." })?.code, "stale");
  assert.equal(toTournamentCommandError({ code: "P0001", message: "Source Deck List association changed; refresh-and-retry." })?.code, "stale");
});

test("CAS mutation seams classify missing stale deletes and updates consistently", () => {
  assert.throws(
    () => requireCasMutationResult(null, "This round changed in another tab. Refresh and try again."),
    (error: unknown) => error instanceof Error && (error as { code?: string }).code === "stale"
  );
  assert.equal(requireCasMutationResult({ id: "round-1" }, "unused").id, "round-1");
});
