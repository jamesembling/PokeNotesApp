import { headers } from "next/headers";

type HeaderReader = {
  get: (name: string) => string | null;
};

function trimTrailingSlash(value: string) {
  return value.replace(/\/$/, "");
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

export async function getAppOrigin() {
  const requestHeaders = await headers();
  return buildAppOriginFromHeaders(requestHeaders);
}
