import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

export async function getVerifiedClaims(
  supabase: Pick<SupabaseClient<Database>, "auth">,
  _supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
) {
  // Let the SDK discover signing keys and enforce its bounded JWKS cache.
  // Supplying a bundled key bypasses cache expiry and cannot learn revocation.
  const result = await supabase.auth.getClaims();

  return { method: "getClaims-remote-jwks", result };
}
