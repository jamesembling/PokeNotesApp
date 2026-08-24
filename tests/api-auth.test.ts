import assert from "node:assert/strict";
import test from "node:test";
import {
  ApiAuthenticationError,
  isApiAuthenticationError
} from "@/lib/server/api-auth";
import {
  apiAuthenticationErrorResponse,
  reportApiError
} from "@/lib/server/api-response";

test("private API authentication errors have a typed 401 response contract", async () => {
  const error = new ApiAuthenticationError();

  assert.equal(error.name, "ApiAuthenticationError");
  assert.equal(error.code, "AUTHENTICATION_REQUIRED");
  assert.equal(error.status, 401);
  assert.equal(isApiAuthenticationError(error), true);
  assert.equal(isApiAuthenticationError(new Error("Authentication required.")), false);
  assert.equal(apiAuthenticationErrorResponse(new Error("Authentication required.")), null);

  const response = reportApiError(
    error,
    {
      action: "testPrivateApiAuth",
      area: "api",
      boundary: "api-auth-test",
      route: "/api/test"
    },
    "Fallback server error."
  );

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Authentication required." });
  assert.equal(
    response.headers.get("cache-control"),
    "private, no-cache, no-store, must-revalidate, max-age=0"
  );
});
