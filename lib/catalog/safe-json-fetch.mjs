const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

function normalizeOrigin(origin) {
  const parsed = new URL(origin);
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error("Allowed JSON origins must not contain a path, query, or fragment.");
  }
  return parsed.origin;
}

export function assertAllowedJsonUrl(
  rawUrl,
  { allowedOrigins, allowedPathPrefixes = ["/"] }
) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Upstream JSON URL is invalid.");
  }

  const normalizedOrigins = new Set(allowedOrigins.map(normalizeOrigin));
  const hasAllowedPath = allowedPathPrefixes.some((prefix) => {
    if (prefix.endsWith("/")) {
      return parsed.pathname.startsWith(prefix);
    }

    return parsed.pathname === prefix || parsed.pathname.startsWith(`${prefix}/`);
  });

  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.hash ||
    !normalizedOrigins.has(parsed.origin) ||
    !hasAllowedPath
  ) {
    throw new Error("Upstream JSON URL is outside the configured allowlist.");
  }

  return parsed;
}

async function readResponseTextWithinLimit(response, maxResponseBytes) {
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > maxResponseBytes) {
    throw new Error("Upstream JSON response exceeded the configured size limit.");
  }

  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    totalBytes += value.byteLength;
    if (totalBytes > maxResponseBytes) {
      await reader.cancel().catch(() => undefined);
      throw new Error("Upstream JSON response exceeded the configured size limit.");
    }

    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(body);
}

export async function fetchJsonWithinBoundary(
  rawUrl,
  {
    allowedOrigins,
    allowedPathPrefixes,
    fetchImpl = fetch,
    headers,
    maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES,
    timeoutMs = DEFAULT_TIMEOUT_MS
  }
) {
  const url = assertAllowedJsonUrl(rawUrl, { allowedOrigins, allowedPathPrefixes });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url.toString(), {
      headers,
      redirect: "error",
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(
        `Upstream JSON request failed with ${response.status} ${response.statusText}.`
      );
    }

    const text = await readResponseTextWithinLimit(response, maxResponseBytes);
    try {
      return JSON.parse(text);
    } catch {
      throw new Error("Upstream response was not valid JSON.");
    }
  } finally {
    clearTimeout(timeout);
  }
}
