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
  const previousServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const previousNewServiceKey = process.env.NEW_SUPABASE_SERVICE_KEY;
  const previousNodeEnv = process.env.NODE_ENV;
  const env: Record<string, string | undefined> = process.env;
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

    delete process.env.POKENOTES_AUTH_CLAIMS_SECRET;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "local-service-key";
    process.env.NEW_SUPABASE_SERVICE_KEY = "local-new-service-key";
    env.NODE_ENV = "development";
    const localHeader = await createAuthClaimsHeader(user);
    assert.ok(localHeader, "Local development retains the compatibility signing key");
    assert.deepEqual(await readAuthClaimsHeader(localHeader), user);

    env.NODE_ENV = "production";
    assert.equal(await createAuthClaimsHeader(user), null);
    assert.equal(await readAuthClaimsHeader(localHeader), null);
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    assert.equal(await createAuthClaimsHeader(user), null);
    process.env.POKENOTES_AUTH_CLAIMS_SECRET = "production-dedicated-secret";
    const productionHeader = await createAuthClaimsHeader(user);
    assert.ok(productionHeader);
    assert.deepEqual(await readAuthClaimsHeader(productionHeader), user);
  } finally {
    Date.now = originalNow;
    if (previousSecret === undefined) delete process.env.POKENOTES_AUTH_CLAIMS_SECRET;
    else process.env.POKENOTES_AUTH_CLAIMS_SECRET = previousSecret;
    for (const [key, previous] of [
      ["SUPABASE_SERVICE_ROLE_KEY", previousServiceKey],
      ["NEW_SUPABASE_SERVICE_KEY", previousNewServiceKey],
      ["NODE_ENV", previousNodeEnv]
    ]) {
      if (previous === undefined) delete process.env[key!];
      else process.env[key!] = previous;
    }
  }
});
