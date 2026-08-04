import assert from "node:assert/strict";
import test from "node:test";
import { getLoginAuthError } from "@/lib/server/login-error";

test("login errors containing an encoded percent are displayed after query parsing", () => {
  const parsedError = new URL(
    "https://pokenotes.example/login?error=Google+OAuth+failed%3A+100%25"
  ).searchParams.get("error");

  assert.equal(parsedError, "Google OAuth failed: 100%");
  assert.equal(getLoginAuthError(parsedError ?? undefined), "Google OAuth failed: 100%");
});

test("malformed percent sequences in a login error do not crash rendering", () => {
  const parsedError = new URL(
    "https://pokenotes.example/login?error=Invalid%ZZpercent%"
  ).searchParams.get("error");

  assert.equal(parsedError, "Invalid%ZZpercent%");
  assert.equal(getLoginAuthError(parsedError ?? undefined), "Invalid%ZZpercent%");
});

test("repeated login errors use the first parsed value", () => {
  assert.equal(getLoginAuthError(["First failure", "Second failure"]), "First failure");
});
