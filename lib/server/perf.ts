const PERF_LOGGING_ENABLED =
  process.env.NODE_ENV === "development" && process.env.POKE_NOTES_DEBUG_PERF === "1";

function logPerf(label: string, startedAt: number) {
  const duration = (performance.now() - startedAt).toFixed(1);
  console.log(`[perf] ${label} ${duration}ms`);
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
