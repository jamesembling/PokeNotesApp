const PERF_LOGGING_ENABLED = process.env.POKE_NOTES_DEBUG_PERF === "1";
const RUNTIME_BOOTED_AT = Date.now();
const RUNTIME_BOOT_ID = crypto.randomUUID();
let runtimeInvocationOrdinal = 0;

export const PROXY_AUTH_DURATION_HEADER = "x-pokenotes-proxy-auth-ms";
export const PROXY_AUTH_ENDED_HEADER = "x-pokenotes-proxy-auth-ended-ms";
export const PROXY_AUTH_METHOD_HEADER = "x-pokenotes-proxy-auth-method";
export const PROXY_AUTH_REFRESHED_HEADER = "x-pokenotes-proxy-auth-refreshed";
export const PROXY_AUTH_STARTED_HEADER = "x-pokenotes-proxy-auth-started-ms";
export const REQUEST_CORRELATION_HEADER = "x-pokenotes-request-correlation-id";
export const REQUEST_STARTED_HEADER = "x-pokenotes-request-started-at";

export function takeRouteEntryEpochMs() {
  return Date.now();
}

export function takeServerRuntimeSnapshot() {
  runtimeInvocationOrdinal += 1;

  return {
    bootAgeMs: Math.max(0, Date.now() - RUNTIME_BOOTED_AT),
    bootId: RUNTIME_BOOT_ID,
    invocationOrdinal: runtimeInvocationOrdinal
  };
}

function logPerf(label: string, startedAt: number) {
  const duration = (performance.now() - startedAt).toFixed(1);
  console.log(`[perf] ${label} ${duration}ms`);
}

export async function measureServerCallWithTiming<T>(
  label: string,
  fn: () => T | PromiseLike<T>
): Promise<{ durationMs: number; value: Awaited<T> }> {
  const startedAt = performance.now();

  try {
    const value = await fn();
    return {
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      value
    };
  } finally {
    if (PERF_LOGGING_ENABLED) {
      logPerf(label, startedAt);
    }
  }
}

export async function measureServerCallWithTimeline<T>(
  label: string,
  fn: () => T | PromiseLike<T>
): Promise<{
  durationMs: number;
  endedAtEpochMs: number;
  startedAtEpochMs: number;
  value: Awaited<T>;
}> {
  const startedAtEpochMs = Date.now();
  const startedAt = performance.now();

  try {
    const value = await fn();
    const endedAtEpochMs = Date.now();
    return {
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      endedAtEpochMs,
      startedAtEpochMs,
      value
    };
  } finally {
    if (PERF_LOGGING_ENABLED) {
      logPerf(label, startedAt);
    }
  }
}

export async function measureServerCall<T>(
  label: string,
  fn: () => T | PromiseLike<T>
): Promise<Awaited<T>> {
  if (!PERF_LOGGING_ENABLED) {
    return await fn();
  }

  const startedAt = performance.now();

  try {
    return await fn();
  } finally {
    logPerf(label, startedAt);
  }
}

export function measureServerStep<T>(label: string, fn: () => T): T {
  if (!PERF_LOGGING_ENABLED) {
    return fn();
  }

  const startedAt = performance.now();

  try {
    return fn();
  } finally {
    logPerf(label, startedAt);
  }
}

export function reportServerPerformance(
  label: string,
  measurements: Record<string, number>
) {
  const normalizedMeasurements = Object.fromEntries(
    Object.entries(measurements).map(([key, value]) => [
      key,
      Math.max(0, Math.round(value))
    ])
  );

  console.info(`[perf] ${label} ${JSON.stringify(normalizedMeasurements)}`);
}
