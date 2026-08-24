import assert from "node:assert/strict";
import test from "node:test";
import { createAsyncTtlCache } from "@/lib/client/async-ttl-cache";

test("async TTL cache deduplicates requests and reloads at the existing freshness boundary", async () => {
  let now = 1_000;
  let loads = 0;
  const cache = createAsyncTtlCache<string>({
    now: () => now,
    ttlMs: 3_600_000
  });
  const loader = async () => `value-${++loads}`;

  const [first, concurrent] = await Promise.all([cache.load(loader), cache.load(loader)]);
  assert.equal(first, "value-1");
  assert.equal(concurrent, "value-1");
  assert.equal(await cache.load(loader), "value-1");
  assert.equal(loads, 1);

  now += 3_600_000;
  assert.equal(await cache.load(loader), "value-2");
  assert.equal(loads, 2);
});

test("explicit invalidation reloads a previously fresh editor option", async () => {
  let loads = 0;
  let notifications = 0;
  const cache = createAsyncTtlCache<string>({ ttlMs: 3_600_000 });
  const loader = async () => `value-${++loads}`;
  const unsubscribe = cache.subscribe(() => {
    notifications += 1;
  });

  assert.equal(await cache.load(loader), "value-1");
  cache.invalidate();
  assert.equal(cache.read(), null);
  assert.equal(await cache.load(loader), "value-2");
  assert.equal(notifications, 3);
  unsubscribe();
});

test("invalidation during a request cannot repopulate the cache with stale data", async () => {
  const deferred: { resolve?: (value: string) => void } = {};
  let loads = 0;
  const cache = createAsyncTtlCache<string>({ ttlMs: 3_600_000 });
  const loader = () => {
    loads += 1;
    if (loads === 1) {
      return new Promise<string>((resolve) => {
        deferred.resolve = resolve;
      });
    }
    return Promise.resolve("fresh");
  };

  const firstRequest = cache.load(loader);
  await Promise.resolve();
  cache.invalidate();
  const freshRequest = cache.load(loader);
  assert(deferred.resolve);
  deferred.resolve("stale");

  assert.equal(await firstRequest, "fresh");
  assert.equal(await freshRequest, "fresh");
  assert.equal(cache.read(), "fresh");
  assert.equal(loads, 2);
});

test("failed requests are not retained", async () => {
  let loads = 0;
  const cache = createAsyncTtlCache<string>({ ttlMs: 3_600_000 });

  await assert.rejects(
    cache.load(async () => {
      loads += 1;
      throw new Error("temporary failure");
    }),
    /temporary failure/
  );

  assert.equal(await cache.load(async () => `value-${++loads}`), "value-2");
});
