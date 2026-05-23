import { headers } from "next/headers";

type HeaderReader = {
  get: (name: string) => string | null;
};

function trimTrailingSlash(value: string) {
  return value.replace(/\/$/, "");
}

function normalizeOrigin(value: string | undefined) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return "";
  }

  return trimTrailingSlash(
    /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  );
}

export function buildAppOriginFromHeaders(requestHeaders: HeaderReader) {
  const originHeader = requestHeaders.get("origin");
  if (originHeader) {
    return trimTrailingSlash(originHeader);
  }

  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "";
  if (host) {
    const protocol =
      requestHeaders.get("x-forwarded-proto") ??
      (process.env.NODE_ENV === "development" ? "http" : "https");
    return trimTrailingSlash(`${protocol}://${host}`);
  }

  return trimTrailingSlash(process.env.NEXT_PUBLIC_APP_URL ?? "");
}

export function getConfiguredPublicAppOrigin() {
  return (
    normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL) ||
    normalizeOrigin(process.env.VERCEL_PROJECT_PRODUCTION_URL)
  );
}

export async function getAppOrigin() {
  const requestHeaders = await headers();
  return buildAppOriginFromHeaders(requestHeaders);
}

export async function getPublicAppOrigin() {
  return getConfiguredPublicAppOrigin() || (await getAppOrigin());
}
