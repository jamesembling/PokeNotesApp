import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { AUTH_CLAIMS_HEADER, readAuthClaimsHeader } from "@/lib/server/auth-claim-header";
import { measureServerCall } from "@/lib/server/perf";
import { createClient } from "@/lib/supabase/server";

type AuthenticatedUser = Pick<
  User,
  "id" | "email" | "app_metadata" | "user_metadata" | "role"
>;

type CachedAuthClaims = {
  expiresAt: number;
  user: AuthenticatedUser;
};

const AUTH_CLAIMS_CACHE_TTL_MS = 30_000;
const authClaimsCache = new Map<string, CachedAuthClaims>();

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

async function getAuthCookieCacheKey() {
  const cookieStore = await cookies();
  const authCookie = cookieStore
    .getAll()
    .find((cookie) => /^sb-.+-auth-token$/.test(cookie.name));

  if (!authCookie?.value) {
    return "";
  }

  return `${authCookie.name}:${authCookie.value}`;
}

function readCachedAuthClaims(cacheKey: string) {
  if (!cacheKey) {
    return null;
  }

  const cached = authClaimsCache.get(cacheKey);
  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    authClaimsCache.delete(cacheKey);
    return null;
  }

  return cached.user;
}

function writeCachedAuthClaims(cacheKey: string, user: AuthenticatedUser | null) {
  if (!cacheKey || !user) {
    return;
  }

  authClaimsCache.set(cacheKey, {
    expiresAt: Date.now() + AUTH_CLAIMS_CACHE_TTL_MS,
    user
  });

  if (authClaimsCache.size > 100) {
    authClaimsCache.delete(authClaimsCache.keys().next().value ?? "");
  }
}

export const getCurrentUser = cache(async (): Promise<AuthenticatedUser | null> => {
  const requestHeaders = await headers();
  const headerUser = await measureServerCall("auth.claimsHeader", async () =>
    await readAuthClaimsHeader(requestHeaders.get(AUTH_CLAIMS_HEADER))
  );

  if (headerUser) {
    return headerUser;
  }

  const authCookieCacheKey = await getAuthCookieCacheKey();
  const cachedUser = readCachedAuthClaims(authCookieCacheKey);
  if (cachedUser) {
    return cachedUser;
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

  const user = mapClaimsToUser(data.claims);
  writeCachedAuthClaims(authCookieCacheKey, user);
  return user;
});

export const requireUser = cache(async () => {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return user;
});

export const requireAuth = requireUser;
