import assert from "node:assert/strict";
import test from "node:test";
import { getLoginAuthError } from "@/lib/server/login-error";

test("login query errors preserve decoded, malformed, and repeated values", () => {
  const parsedError = new URL(
    "https://pokenotes.example/login?error=Google+OAuth+failed%3A+100%25"
  ).searchParams.get("error");

  assert.equal(parsedError, "Google OAuth failed: 100%");
  assert.equal(getLoginAuthError(parsedError ?? undefined), "Google OAuth failed: 100%");

  const malformedParsedError = new URL(
    "https://pokenotes.example/login?error=Invalid%ZZpercent%"
  ).searchParams.get("error");

  assert.equal(malformedParsedError, "Invalid%ZZpercent%");
  assert.equal(getLoginAuthError(malformedParsedError ?? undefined), "Invalid%ZZpercent%");
  assert.equal(getLoginAuthError(["First failure", "Second failure"]), "First failure");
});
