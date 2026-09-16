export function isSameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host");
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProtocol || new URL(request.url).protocol.replace(":", "");

  if (!origin || !host) {
    return false;
  }

  try {
    const originUrl = new URL(origin);
    return (
      originUrl.host === host &&
      originUrl.protocol === `${protocol}:` &&
      (!fetchSite || fetchSite === "same-origin")
    );
  } catch {
    return false;
  }
}
