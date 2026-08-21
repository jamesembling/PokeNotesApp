import assert from "node:assert/strict";
import test from "node:test";
import {
  isUserFacingActionError,
  userFacingActionError
} from "@/lib/server/action-errors";
import { getSafeRedirectPath, withRefreshToken } from "@/lib/server/action-redirect";

test("user-facing action errors carry stable machine metadata separately from copy", () => {
  const error = userFacingActionError("Copy can change without changing transport semantics.", {
    code: "RATE_LIMIT",
    httpStatus: 429
  });

  assert.equal(isUserFacingActionError(error), true);
  assert.equal(error.code, "RATE_LIMIT");
  assert.equal(error.httpStatus, 429);
  assert.equal(error.message, "Copy can change without changing transport semantics.");
});

test("ordinary user-facing action errors keep the existing default metadata", () => {
  const error = userFacingActionError("Try again.");

  assert.equal(error.code, undefined);
  assert.equal(error.httpStatus, undefined);
});

test("action redirects stay inside the application", () => {
  assert.equal(getSafeRedirectPath("/logs/abc?tab=summary", "/logs"), "/logs/abc?tab=summary");
  assert.equal(getSafeRedirectPath("", "/logs"), "/logs");
  assert.equal(getSafeRedirectPath("https://example.com", "/logs"), "/logs");
  assert.equal(getSafeRedirectPath("//example.com/path", "/logs"), "/logs");
  assert.equal(getSafeRedirectPath("/\\example.com/path", "/logs"), "/logs");
  assert.equal(getSafeRedirectPath("/logs\u0000/hidden", "/logs"), "/logs");
  assert.equal(withRefreshToken("/logs?deck=abc", 123), "/logs?deck=abc&r=123");
});
