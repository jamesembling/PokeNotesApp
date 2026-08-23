import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

type ClaimsOptions = NonNullable<Parameters<SupabaseClient<Database>["auth"]["getClaims"]>[1]>;
type SupabaseJwks = NonNullable<ClaimsOptions["jwks"]>;

const PRODUCTION_SUPABASE_URL = "https://uhsqehjapqarbsmlqnnp.supabase.co";
// Supabase treats supplied keys as a fast-path: if a future token uses a new
// key id, getClaims automatically falls back to the project's JWKS endpoint.
const PRODUCTION_JWKS: SupabaseJwks = {
  keys: [
    {
      alg: "ES256",
      crv: "P-256",
      ext: true,
      key_ops: ["verify"],
      kid: "97bb99d7-b1dd-4bca-b7b9-eefb83ae278c",
      kty: "EC",
      use: "sig",
      x: "ZPLz8Fjib1LqdIqqJIeCGYM91JPdZdcrADbGmao1AL4",
      y: "he6PjBq9sL6WhvJ5ZUZvNrRwdz1wyguCP2pjl9uZ71U"
    }
  ]
};

export function getBundledSupabaseJwks(supabaseUrl: string | undefined) {
  return supabaseUrl?.replace(/\/$/, "") === PRODUCTION_SUPABASE_URL ? PRODUCTION_JWKS : undefined;
}

export async function getVerifiedClaims(
  supabase: Pick<SupabaseClient<Database>, "auth">,
  supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
) {
  const jwks = getBundledSupabaseJwks(supabaseUrl);
  const result = await supabase.auth.getClaims(undefined, jwks ? { jwks } : undefined);

  return {
    method: jwks ? "getClaims-bundled-jwks" : "getClaims-remote-jwks",
    result
  };
}
