import { headers } from "next/headers";
import { isAllowedLocalLoginHost } from "@/lib/server/local-test-login";

type HeaderReader = {
  get: (name: string) => string | null;
};

type AppUrlEnvironment = {
  NODE_ENV?: string;
  NEXT_PUBLIC_APP_URL?: string;
  POKE_NOTES_AUTH_REDIRECT_ORIGINS?: string;
  POKE_NOTES_LOCAL_LOGIN_HOSTS?: string;
  VERCEL_BRANCH_URL?: string;
  VERCEL_PROJECT_PRODUCTION_URL?: string;
  VERCEL_URL?: string;
};

function normalizeOrigin(value: string | undefined) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return "";
  }

  try {
    const hasScheme = /^[a-z][a-z\d+.-]*:/i.test(trimmed);
    const url = new URL(hasScheme ? trimmed : `https://${trimmed}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "";
    }

    return url.origin;
  } catch {
    return "";
  }
}

function uniqueOrigins(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function getRequestHostOrigin(
  requestHeaders: HeaderReader,
  environment: AppUrlEnvironment
) {
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "";
  if (!host) {
    return "";
  }

  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (environment.NODE_ENV === "development" ? "http" : "https");

  if (protocol !== "http" && protocol !== "https") {
    return "";
  }

  return normalizeOrigin(`${protocol}://${host}`);
}

export function getConfiguredPublicAppOrigin(
  environment: AppUrlEnvironment = process.env
) {
  return (
    normalizeOrigin(environment.NEXT_PUBLIC_APP_URL) ||
    normalizeOrigin(environment.VERCEL_PROJECT_PRODUCTION_URL)
  );
}

export function getApprovedAuthRedirectOrigins(
  environment: AppUrlEnvironment = process.env
) {
  const explicitOrigins = String(environment.POKE_NOTES_AUTH_REDIRECT_ORIGINS || "")
    .split(",")
    .map((value) => normalizeOrigin(value));

  return uniqueOrigins([
    normalizeOrigin(environment.NEXT_PUBLIC_APP_URL),
    ...explicitOrigins,
    normalizeOrigin(environment.VERCEL_URL),
    normalizeOrigin(environment.VERCEL_BRANCH_URL),
    normalizeOrigin(environment.VERCEL_PROJECT_PRODUCTION_URL)
  ]);
}

export function buildAppOriginFromHeaders(
  requestHeaders: HeaderReader,
  environment: AppUrlEnvironment = process.env
) {
  // `Origin` is request-controlled. Only the request host may select among origins
  // that deployment configuration (or the development pairing boundary) approved.
  const requestOrigin = getRequestHostOrigin(requestHeaders, environment);
  const approvedOrigins = getApprovedAuthRedirectOrigins(environment);

  if (requestOrigin && approvedOrigins.includes(requestOrigin)) {
    return requestOrigin;
  }

  if (
    environment.NODE_ENV === "development" &&
    requestOrigin &&
    isAllowedLocalLoginHost(new URL(requestOrigin).host, environment)
  ) {
    return requestOrigin;
  }

  const configuredOrigin =
    getConfiguredPublicAppOrigin(environment) || approvedOrigins.at(0) || "";
  if (configuredOrigin) {
    return configuredOrigin;
  }

  throw new Error("No approved application origin is configured for this request.");
}

export async function getAppOrigin() {
  const requestHeaders = await headers();
  return buildAppOriginFromHeaders(requestHeaders);
}

export async function getPublicAppOrigin() {
  return getConfiguredPublicAppOrigin() || (await getAppOrigin());
}
