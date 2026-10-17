import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import { getVerifiedClaims } from "@/lib/supabase/verified-claims";

test("production verification delegates signing-key discovery to the SDK", async () => {
  let observedArguments: unknown[] = [];
  const supabase = {
    auth: {
      async getClaims(...args: unknown[]) {
        observedArguments = args;
        return { data: null, error: null };
      }
    }
  } as unknown as Parameters<typeof getVerifiedClaims>[0];
  const verification = await getVerifiedClaims(
    supabase,
    "https://uhsqehjapqarbsmlqnnp.supabase.co"
  );
  assert.equal(verification.method, "getClaims-remote-jwks");
  assert.deepEqual(observedArguments, []);
});

test("other Supabase projects preserve discovery failures", async () => {
  const failure = new Error("Discovery unavailable");
  const supabase = {
    auth: {
      async getClaims() {
        return { data: null, error: failure };
      }
    }
  } as unknown as Parameters<typeof getVerifiedClaims>[0];
  const verification = await getVerifiedClaims(supabase, "http://127.0.0.1:54321");
  assert.equal(verification.result.error, failure);
});

test("a revoked synthetic signing key is rejected after the SDK discovery lifetime", async (t) => {
  const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify"
  ]);
  const publicKey = {
    ...(await crypto.subtle.exportKey("jwk", keys.publicKey)),
    kid: "synthetic-revocation-key",
    alg: "ES256",
    use: "sig"
  };
  const initialNow = Date.now();
  let now = initialNow;
  t.mock.method(Date, "now", () => now);
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "ES256", kid: publicKey.kid, typ: "JWT" })}.${encode({ sub: "synthetic-user", exp: Math.floor(initialNow / 1000) + 3600 })}`;
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    keys.privateKey,
    new TextEncoder().encode(unsigned)
  );
  const token = `${unsigned}.${Buffer.from(signature).toString("base64url")}`;
  let revoked = false;
  let discoveries = 0;
  const client = createClient("https://synthetic-revocation.supabase.co", "synthetic-anon-key", {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: crypto.randomUUID()
    },
    global: {
      fetch: async (input) => {
        if (String(input).endsWith("/.well-known/jwks.json")) {
          discoveries += 1;
          return Response.json({ keys: revoked ? [] : [publicKey] });
        }
        return Response.json({ message: "Token revoked", error_code: "bad_jwt" }, { status: 401 });
      }
    }
  });
  const supabase = {
    auth: {
      getClaims: (_jwt?: string, options?: Parameters<typeof client.auth.getClaims>[1]) =>
        client.auth.getClaims(token, options)
    }
  } as unknown as Parameters<typeof getVerifiedClaims>[0];
  assert.equal((await getVerifiedClaims(supabase)).result.data?.claims.sub, "synthetic-user");
  assert.equal(discoveries, 1);
  revoked = true;
  now += 10 * 60 * 1000 - 1;
  assert.equal((await getVerifiedClaims(supabase)).result.error, null);
  assert.equal(discoveries, 1);
  now += 2;
  const afterExpiry = await getVerifiedClaims(supabase);
  assert.ok(afterExpiry.result.error);
  assert.equal(afterExpiry.result.data, null);
  assert.equal(discoveries, 2);
});
