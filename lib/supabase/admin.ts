import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

function getAdminSupabaseEnv() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEW_SUPABASE_URL || "";
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEW_SUPABASE_SERVICE_KEY || "";

  return {
    configured: Boolean(supabaseUrl && serviceRoleKey),
    supabaseUrl,
    serviceRoleKey
  };
}

export function hasAdminSupabaseAccess() {
  return getAdminSupabaseEnv().configured;
}

export function createAdminClient() {
  const { configured, supabaseUrl, serviceRoleKey } = getAdminSupabaseEnv();

  if (!configured) {
    throw new Error(
      "Admin role updates are not configured. Set SUPABASE_SERVICE_ROLE_KEY before using admin user management."
    );
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}
