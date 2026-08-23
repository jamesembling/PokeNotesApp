import assert from "node:assert/strict";
import test from "node:test";
import {
  getBundledSupabaseJwks,
  getVerifiedClaims
} from "@/lib/supabase/verified-claims";

test("production auth can verify the current signing key without a cold JWKS fetch", () => {
  const jwks = getBundledSupabaseJwks("https://uhsqehjapqarbsmlqnnp.supabase.co/");

  assert.equal(jwks?.keys.length, 1);
  assert.equal(jwks?.keys[0]?.alg, "ES256");
  assert.equal(jwks?.keys[0]?.kid, "97bb99d7-b1dd-4bca-b7b9-eefb83ae278c");
});

test("other Supabase projects keep remote signing-key discovery", () => {
  assert.equal(getBundledSupabaseJwks("http://127.0.0.1:54321"), undefined);
});

test("production verification supplies the bundled keys to getClaims", async () => {
  let observedOptions: unknown;
  const supabase = {
    auth: {
      async getClaims(_jwt: unknown, options: unknown) {
        observedOptions = options;
        return { data: null, error: null };
      }
    }
  } as unknown as Parameters<typeof getVerifiedClaims>[0];

  const verification = await getVerifiedClaims(
    supabase,
    "https://uhsqehjapqarbsmlqnnp.supabase.co"
  );

  assert.equal(verification.method, "getClaims-bundled-jwks");
  assert.deepEqual(observedOptions, {
    jwks: getBundledSupabaseJwks("https://uhsqehjapqarbsmlqnnp.supabase.co")
  });
});
