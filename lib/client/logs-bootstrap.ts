type BootstrapResult = {
  ok: boolean;
  parsedAtMs: number;
  payload: unknown;
  status: number;
};

declare global {
  interface Window {
    __pokenotesLogsBootstrap?: {
      result: Promise<BootstrapResult>;
      startedAtMs: number;
    };
  }
}

// Only the HTML parser starts this request. Client navigations use the loader
// below, and private data stays in memory rather than in the static shell.
export const LOGS_EARLY_BOOTSTRAP_SCRIPT = `(() => {
  if (document.readyState !== "loading") return;
  const start = () => {
    if (window.__pokenotesLogsBootstrap ||
        !["/logs", "/logs/", "/logs-canary", "/logs-canary/"].includes(location.pathname)) return;
    window.__pokenotesLogsBootstrap = {
      startedAtMs: performance.now(),
      result: fetch("/api/logs/bootstrap", {
        cache: "no-store", credentials: "same-origin", headers: { Accept: "application/json" }
      }).then(async response => ({
        ok: response.ok, status: response.status,
        payload: response.ok ? await response.json() : null,
        parsedAtMs: Math.max(0, Math.round(performance.now()))
      })).catch(() => ({
        ok: false, status: 0, payload: null,
        parsedAtMs: Math.max(0, Math.round(performance.now()))
      }))
    };
  };
  document.prerendering
    ? document.addEventListener("prerenderingchange", start, { once: true })
    : start();
})()`;

export async function loadLogsBootstrap(useEarlyRequest: boolean): Promise<BootstrapResult> {
  if ("prerendering" in document && document.prerendering === true) {
    await new Promise<void>((resolve) => {
      document.addEventListener("prerenderingchange", () => resolve(), { once: true });
    });
  }

  const early = window.__pokenotesLogsBootstrap;
  delete window.__pokenotesLogsBootstrap;
  if (useEarlyRequest && early && performance.now() - early.startedAtMs <= 30_000) {
    return early.result;
  }

  try {
    const response = await fetch("/api/logs/bootstrap", {
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "application/json" }
    });
    const payload = response.ok ? await response.json() : null;
    return {
      ok: response.ok,
      parsedAtMs: Math.max(0, Math.round(performance.now())),
      payload,
      status: response.status
    };
  } catch {
    return {
      ok: false,
      parsedAtMs: Math.max(0, Math.round(performance.now())),
      payload: null,
      status: 0
    };
  }
}
