"use client";

import { EDITOR_OPTION_CACHE_TTL_MS } from "@/lib/cache/freshness";
import { createAsyncTtlCache } from "@/lib/client/async-ttl-cache";
import type { PokemonOption } from "@/types/index";

export const pokemonOptionsClientCache = createAsyncTtlCache<PokemonOption[]>({
  ttlMs: EDITOR_OPTION_CACHE_TTL_MS
});

export function invalidatePokemonEditorOptions() {
  pokemonOptionsClientCache.invalidate();
}
