import { redirect } from "next/navigation";
import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { measureServerCall } from "@/lib/server/perf";
import { createClient } from "@/lib/supabase/server";

/*
 * Perf pass summary:
 * - Was slow: protected requests refreshed auth in middleware and then fetched the user again in SSR.
 * - Changed: middleware + server auth now use verified claims, while hot DB stats use count-only queries.
 * - Better: fewer round trips and less row materialization, with the same server-first protection model.
 */
type AuthenticatedUser = Pick<
  User,
  "id" | "email" | "app_metadata" | "user_metadata" | "role"
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function mapClaimsToUser(claims: Record<string, unknown>): AuthenticatedUser | null {
  const id = typeof claims.sub === "string" ? claims.sub : null;

  if (!id) {
    return null;
  }

  return {
    id,
    email: typeof claims.email === "string" ? claims.email : undefined,
    app_metadata: isRecord(claims.app_metadata) ? claims.app_metadata : {},
    user_metadata: isRecord(claims.user_metadata) ? claims.user_metadata : {},
    role: typeof claims.role === "string" ? claims.role : undefined
  };
}

export const getCurrentUser = cache(async (): Promise<AuthenticatedUser | null> => {
  const supabase = createClient();
  const { data, error } = await measureServerCall("auth.getClaims", () =>
    supabase.auth.getClaims()
  );

  if (error) {
    throw error;
  }

  if (!data?.claims || !isRecord(data.claims)) {
    return null;
  }

  return mapClaimsToUser(data.claims);
});

export const requireUser = cache(async () => {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return user;
});
