import assert from "node:assert/strict";
import test from "node:test";
import {
  isUserFacingActionError,
  userFacingActionError
} from "@/lib/server/action-errors";

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
