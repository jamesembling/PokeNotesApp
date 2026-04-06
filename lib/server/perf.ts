const PERF_LOGGING_ENABLED =
  process.env.NODE_ENV === "development" && process.env.POKE_NOTES_DEBUG_PERF === "1";

export async function measureServerCall<T>(label: string, fn: () => Promise<T>): Promise<T> {
  if (!PERF_LOGGING_ENABLED) {
    return fn();
  }

  const startedAt = performance.now();

  try {
    return await fn();
  } finally {
    const duration = (performance.now() - startedAt).toFixed(1);
    console.log(`[perf] ${label} ${duration}ms`);
  }
}
