type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

export function createAsyncTtlCache<T>({
  now = Date.now,
  ttlMs
}: {
  now?: () => number;
  ttlMs: number;
}) {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new Error("Client cache TTL must be a positive finite number.");
  }

  let entry: CacheEntry<T> | null = null;
  let expiryTimer: ReturnType<typeof setTimeout> | null = null;
  let generation = 0;
  const listeners = new Set<() => void>();
  let pending: Promise<T> | null = null;

  function clearExpiryTimer() {
    if (expiryTimer !== null) {
      clearTimeout(expiryTimer);
      expiryTimer = null;
    }
  }

  function notify() {
    listeners.forEach((listener) => listener());
  }

  function expire() {
    generation += 1;
    entry = null;
    pending = null;
    clearExpiryTimer();
  }

  function scheduleExpiry() {
    clearExpiryTimer();
    if (!entry || listeners.size === 0) {
      return;
    }

    const delay = Math.max(0, entry.expiresAt - now());
    expiryTimer = setTimeout(() => {
      expire();
      notify();
    }, delay);
    if (typeof expiryTimer === "object" && "unref" in expiryTimer) {
      expiryTimer.unref();
    }
  }

  function read() {
    if (!entry) {
      return null;
    }

    if (entry.expiresAt <= now()) {
      expire();
      return null;
    }

    return entry.value;
  }

  function load(loader: () => Promise<T>): Promise<T> {
    const cached = read();
    if (cached !== null) {
      return Promise.resolve(cached);
    }

    if (pending) {
      return pending;
    }

    const requestGeneration = generation;
    const request = Promise.resolve()
      .then(loader)
      .then((value) => {
        if (requestGeneration !== generation) {
          return load(loader);
        }

        entry = {
          expiresAt: now() + ttlMs,
          value
        };
        scheduleExpiry();
        notify();
        return value;
      })
      .finally(() => {
        if (pending === request) {
          pending = null;
        }
      });
    pending = request;
    return request;
  }

  function invalidate() {
    expire();
    notify();
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    scheduleExpiry();

    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        clearExpiryTimer();
      }
    };
  }

  return {
    invalidate,
    load,
    read,
    subscribe
  };
}
