import { setTimeout as delay } from "node:timers/promises";

// A completed CLI reset can precede PostgREST's schema-cache reload.
// Wait through read-only probes; never retry partially applied fixture writes.
export async function waitForLocalSchema(apiUrl, serviceRoleKey, {
  fetch: request = globalThis.fetch,
  timeoutMs = 45000,
  pollMs = 250
} = {}) {
  const url = new URL(apiUrl);
  if (!["http://localhost:54321", "http://127.0.0.1:54321"].includes(url.origin)) {
    throw new Error("Schema readiness checks require the synthetic local Supabase API.");
  }
  const endpoint = new URL("/rest/v1/profiles?select=id&limit=0", url);
  const deadline = Date.now() + timeoutMs;
  let lastStatus = "no response";
  while (Date.now() < deadline) {
    try {
      const response = await request(endpoint, {
        headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
        signal: AbortSignal.timeout(Math.max(1, Math.min(2000, deadline - Date.now())))
      });
      const body = await response.json().catch(() => null);
      if (response.ok && Array.isArray(body)) return;
      const code = body?.code;
      lastStatus = `HTTP ${response.status}${code === "PGRST205" || code === "PGRST002" ? ` ${code}` : ""}`;
      if (!["PGRST205", "PGRST002"].includes(code) && ![502, 503, 504].includes(response.status)) {
        throw new Error(`Local schema readiness check failed: ${lastStatus}.`);
      }
    } catch (error) {
      if (!(error instanceof TypeError) && error.name !== "TimeoutError") throw error;
      lastStatus = "local API unavailable";
    }
    await delay(Math.min(pollMs, Math.max(0, deadline - Date.now())));
  }
  throw new Error(`Local profiles schema was not ready within ${timeoutMs}ms (${lastStatus}); fixtures were not seeded.`);
}
