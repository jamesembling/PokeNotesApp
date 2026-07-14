const PERF_LOGGING_ENABLED =
  process.env.POKE_NOTES_DEBUG_PERF === "1";

export const PROXY_AUTH_DURATION_HEADER = "x-pokenotes-proxy-auth-ms";

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
