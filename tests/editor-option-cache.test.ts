import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createAsyncTtlCache } from "@/lib/client/async-ttl-cache";

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

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

test("Pokemon options share the server freshness window without retaining tenant editor data", () => {
  const freshness = source("lib/cache/freshness.ts");
  const serverPokemon = source("lib/db/pokemon.ts");
  const clientCaches = source("lib/client/editor-option-cache.ts");
  const pokemonLoader = source("lib/pokemon/use-pokemon-options.ts");
  const tournamentLoader = source("components/ui/LazyTournamentEditorButton.tsx");
  const tournamentDialog = source("components/ui/TournamentEditorDialog.tsx");

  assert.match(freshness, /POKEMON_OPTIONS_REVALIDATE_SECONDS = 60 \* 60/);
  assert.match(freshness, /EDITOR_OPTION_CACHE_TTL_MS = POKEMON_OPTIONS_REVALIDATE_SECONDS \* 1000/);
  assert.match(serverPokemon, /revalidate: POKEMON_OPTIONS_REVALIDATE_SECONDS/);
  assert.match(clientCaches, /ttlMs: EDITOR_OPTION_CACHE_TTL_MS/);
  assert.doesNotMatch(clientCaches, /TournamentEditorData|TournamentDeckChoice|tournamentEditorData/);
  assert.match(pokemonLoader, /pokemonOptionsClientCache\.load/);
  assert.match(pokemonLoader, /pokemonOptionsClientCache\.subscribe/);
  assert.match(pokemonLoader, /reloadToken/);
  assert.doesNotMatch(pokemonLoader, /let pokemonOptionsCache|let pokemonOptionsPromise/);
  assert.match(tournamentLoader, /usePokemonOptionsResource/);
  assert.match(tournamentLoader, /optionsRequested[\s\S]*reload\(\)/);
  assert.doesNotMatch(tournamentLoader, /tournament-editor-data|TournamentDeckChoice|\bdecks\b/);
  assert.doesNotMatch(tournamentDialog, /TournamentDeckChoice|\bdecks:/);
});
