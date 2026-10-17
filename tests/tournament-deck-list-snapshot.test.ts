import assert from "node:assert/strict";
import test from "node:test";
import {
  TournamentSchemaMissingError,
  unwrapTournamentSnapshotQueryResult
} from "@/lib/db/tournaments";

// Snapshot, command and RPC database behavior is exercised by the pgTAP suite and
// scripts/rehearse-tournament-deck-list.mjs in the Database behavior workflow.
test("Tournament snapshot reads distinguish a missing schema from other query failures", () => {
  assert.throws(
    () => unwrapTournamentSnapshotQueryResult({ data: null, error: { code: "PGRST205" } }),
    TournamentSchemaMissingError
  );
  const missingColumn = { code: "42703", message: "column is missing" };
  assert.throws(
    () => unwrapTournamentSnapshotQueryResult({ data: null, error: missingColumn }),
    (error) => error === missingColumn
  );
  assert.equal(unwrapTournamentSnapshotQueryResult({ data: null, error: null }), null);
});
