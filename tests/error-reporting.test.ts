import assert from "node:assert/strict";
import test from "node:test";
import { createErrorReport } from "@/lib/error-reporting";
import { PostgrestError } from "@supabase/postgrest-js";

test("error reports always redact compact share bearer tokens, including error messages", () => {
  const report = createErrorReport(new Error("Share AbCdEfGhIjKlMnOp lookup failed"), {
    boundary: "share-test",
    shareId: "AbCdEfGhIjKlMnOp"
  });

  assert.equal(report.shareId, "[redacted-share-token]");
  assert.match(report.error.message, /\[redacted-secret\]/);
  assert.doesNotMatch(JSON.stringify(report), /AbCdEfGhIjKlMnOp/);
});

test("error reports retain safe code and message from thrown database objects", () => {
  const report = createErrorReport({
    code: "PGRST116",
    message: "No row for trainer@example.com at https://database.example/path",
    details: "secret database detail"
  }, { boundary: "deck-options" });

  assert.equal(report.error.code, "PGRST116");
  assert.equal(report.error.message, "No row for [redacted-email] at [redacted-url]");
  assert.doesNotMatch(JSON.stringify(report), /secret database detail|trainer@example.com|database\.example/);

  const postgrestReport = createErrorReport(new PostgrestError({
    code: "42501",
    details: "private database detail",
    hint: "private database hint",
    message: "permission denied for trainer@example.com"
  }), { boundary: "deck-options" });
  assert.equal(postgrestReport.error.code, "42501");
  assert.equal(postgrestReport.error.message, "permission denied for [redacted-email]");
  assert.doesNotMatch(JSON.stringify(postgrestReport), /private database|trainer@example.com/);
});
