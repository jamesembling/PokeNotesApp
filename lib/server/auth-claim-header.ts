import type { User } from "@supabase/supabase-js";

export const AUTH_CLAIMS_HEADER = "x-pokenotes-auth-claims";
const AUTH_CLAIMS_HEADER_MAX_LENGTH = 16_384;
const AUTH_CLAIMS_TTL_MS = 5 * 60 * 1_000;
const AUTH_CLAIMS_CLOCK_SKEW_MS = 30 * 1_000;
const AUTH_CLAIMS_SIGNATURE_LENGTH = 64;

type HeaderUser = Pick<
  User,
  "id" | "email" | "app_metadata" | "user_metadata" | "role"
>;

function getSigningSecret() {
  if (process.env.NODE_ENV === "production") {
    return process.env.POKENOTES_AUTH_CLAIMS_SECRET || "";
  }
  return (
    process.env.POKENOTES_AUTH_CLAIMS_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEW_SUPABASE_SERVICE_KEY ||
    ""
  );
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

function isValidSignature(signature: string, expectedSignature: string) {
  if (
    signature.length !== AUTH_CLAIMS_SIGNATURE_LENGTH ||
    expectedSignature.length !== AUTH_CLAIMS_SIGNATURE_LENGTH ||
    !/^[0-9a-f]{64}$/.test(signature)
  ) {
    return false;
  }

  let difference = 0;
  for (let index = 0; index < AUTH_CLAIMS_SIGNATURE_LENGTH; index += 1) {
    difference |= signature.charCodeAt(index) ^ expectedSignature.charCodeAt(index);
  }

  return difference === 0;
}

export async function createAuthClaimsHeader(user: HeaderUser | null) {
  const secret = getSigningSecret();
  if (!secret || !user) {
    return null;
  }

  const payload = encodeURIComponent(
    JSON.stringify({ version: 1, issuedAt: Date.now(), user })
  );
  if (payload.length + AUTH_CLAIMS_SIGNATURE_LENGTH + 1 > AUTH_CLAIMS_HEADER_MAX_LENGTH) {
    return null;
  }

  const signature = await signPayload(payload, secret);
  return `${payload}.${signature}`;
}

export async function readAuthClaimsHeader(value: string | null) {
  const secret = getSigningSecret();
  if (!secret || !value || value.length > AUTH_CLAIMS_HEADER_MAX_LENGTH) {
    return null;
  }

  const separatorIndex = value.lastIndexOf(".");
  if (separatorIndex <= 0) {
    return null;
  }

  const payload = value.slice(0, separatorIndex);
  const signature = value.slice(separatorIndex + 1);
  const expectedSignature = await signPayload(payload, secret);

  if (!isValidSignature(signature, expectedSignature)) {
    return null;
  }

  try {
    const decoded: unknown = JSON.parse(decodeURIComponent(payload));
    if (
      !isRecord(decoded) ||
      decoded.version !== 1 ||
      typeof decoded.issuedAt !== "number" ||
      !Number.isSafeInteger(decoded.issuedAt)
    ) {
      return null;
    }

    const ageMs = Date.now() - decoded.issuedAt;
    if (ageMs > AUTH_CLAIMS_TTL_MS || ageMs < -AUTH_CLAIMS_CLOCK_SKEW_MS) {
      return null;
    }

    return parseHeaderUser(decoded.user);
  } catch {
    return null;
  }
}
