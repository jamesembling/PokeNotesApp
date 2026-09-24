import assert from "node:assert/strict";
import test from "node:test";
import {
  ApiAuthenticationError,
  isApiAuthenticationError
} from "@/lib/server/api-auth";
import {
  createAuthClaimsHeader,
  readAuthClaimsHeader
} from "@/lib/server/auth-claim-header";
import {
  apiAuthenticationErrorResponse,
  reportApiError
} from "@/lib/server/api-response";

test("API and forwarded authentication preserve their identity boundaries", async () => {
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

  const previousSecret = process.env.POKENOTES_AUTH_CLAIMS_SECRET;
  const originalNow = Date.now;
  process.env.POKENOTES_AUTH_CLAIMS_SECRET = "dedicated-test-signing-secret";

  try {
    let now = 1_800_000_000_000;
    Date.now = () => now;
    const user = {
      id: "user-123",
      email: "trainer@example.com",
      app_metadata: { provider: "google" },
      user_metadata: { display_name: "Trainer" },
      role: "authenticated"
    };
    const claimsHeader = await createAuthClaimsHeader(user);
    assert.ok(claimsHeader);
    assert.deepEqual(await readAuthClaimsHeader(claimsHeader), user);

    const altered = `${claimsHeader.slice(0, -1)}${claimsHeader.endsWith("0") ? "1" : "0"}`;
    assert.equal(await readAuthClaimsHeader(altered), null);
    assert.equal(await readAuthClaimsHeader(`${claimsHeader}.extra`), null);
    assert.equal(
      await readAuthClaimsHeader(`${claimsHeader}x`.padEnd(16_385, "x")),
      null
    );

    now += 5 * 60 * 1_000 + 1;
    assert.equal(await readAuthClaimsHeader(claimsHeader), null);

    now += 10 * 60 * 1_000;
    const futureHeader = await createAuthClaimsHeader(user);
    assert.ok(futureHeader);
    now -= 10 * 60 * 1_000 + 30 * 1_000 + 1;
    assert.equal(await readAuthClaimsHeader(futureHeader), null);

    assert.equal(
      await createAuthClaimsHeader({
        ...user,
        user_metadata: { oversized: "x".repeat(16_384) }
      }),
      null
    );
  } finally {
    Date.now = originalNow;
    if (previousSecret === undefined) delete process.env.POKENOTES_AUTH_CLAIMS_SECRET;
    else process.env.POKENOTES_AUTH_CLAIMS_SECRET = previousSecret;
  }
});
