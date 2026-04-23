import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { AUTH_CLAIMS_HEADER, readAuthClaimsHeader } from "@/lib/server/auth-claim-header";
import { measureServerCall } from "@/lib/server/perf";
import { createClient } from "@/lib/supabase/server";

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
  const requestHeaders = await headers();
  const headerUser = await measureServerCall("auth.claimsHeader", async () =>
    await readAuthClaimsHeader(requestHeaders.get(AUTH_CLAIMS_HEADER))
  );

  if (headerUser) {
    return headerUser;
  }

  const supabase = await createClient();
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
