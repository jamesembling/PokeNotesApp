import assert from "node:assert/strict";
import test from "node:test";
import { createErrorReport } from "@/lib/error-reporting";

test("error reports always redact compact share bearer tokens, including error messages", () => {
  const report = createErrorReport(new Error("Share AbCdEfGhIjKlMnOp lookup failed"), {
    boundary: "share-test",
    shareId: "AbCdEfGhIjKlMnOp"
  });

  assert.equal(report.shareId, "[redacted-share-token]");
  assert.match(report.error.message, /\[redacted-secret\]/);
  assert.doesNotMatch(JSON.stringify(report), /AbCdEfGhIjKlMnOp/);
});
