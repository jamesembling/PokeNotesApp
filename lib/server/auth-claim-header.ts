import type { User } from "@supabase/supabase-js";

export const AUTH_CLAIMS_HEADER = "x-pokenotes-auth-claims";

type HeaderUser = Pick<
  User,
  "id" | "email" | "app_metadata" | "user_metadata" | "role"
>;

function getSigningSecret() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEW_SUPABASE_SERVICE_KEY || "";
}

async function signPayload(payload: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseHeaderUser(value: unknown): HeaderUser | null {
  if (!isRecord(value) || typeof value.id !== "string" || !value.id) {
    return null;
  }

  return {
    id: value.id,
    email: typeof value.email === "string" ? value.email : undefined,
    app_metadata: isRecord(value.app_metadata) ? value.app_metadata : {},
    user_metadata: isRecord(value.user_metadata) ? value.user_metadata : {},
    role: typeof value.role === "string" ? value.role : undefined
  };
}

export async function createAuthClaimsHeader(user: HeaderUser | null) {
  const secret = getSigningSecret();
  if (!secret || !user) {
    return null;
  }

  const payload = encodeURIComponent(JSON.stringify(user));
  const signature = await signPayload(payload, secret);
  return `${payload}.${signature}`;
}

export async function readAuthClaimsHeader(value: string | null) {
  const secret = getSigningSecret();
  if (!secret || !value) {
    return null;
  }

  const separatorIndex = value.lastIndexOf(".");
  if (separatorIndex <= 0) {
    return null;
  }

  const payload = value.slice(0, separatorIndex);
  const signature = value.slice(separatorIndex + 1);
  const expectedSignature = await signPayload(payload, secret);

  if (signature !== expectedSignature) {
    return null;
  }

  try {
    return parseHeaderUser(JSON.parse(decodeURIComponent(payload)));
  } catch {
    return null;
  }
}
