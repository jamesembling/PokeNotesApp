"use client";

import { useEffect, useState } from "react";
import { pokemonOptionsClientCache } from "@/lib/client/editor-option-cache";
import type { PokemonOption } from "@/types/index";

type PokemonOptionsResponse = {
  pokemonOptions?: PokemonOption[];
};

export async function loadPokemonOptions() {
  try {
    return await pokemonOptionsClientCache.load(async () => {
      const response = await fetch("/api/pokemon-options", {
        credentials: "same-origin",
        cache: "no-store"
      });
      if (!response.ok) {
        throw new Error("Could not load Pokemon options.");
      }

      const payload = (await response.json()) as PokemonOptionsResponse;
      return Array.isArray(payload.pokemonOptions) ? payload.pokemonOptions : [];
    });
  } catch {
    throw new Error("Could not load Pokemon options.");
  }
}

export function usePokemonOptionsResource(enabled = true) {
  const [pokemonOptions, setPokemonOptions] = useState<PokemonOption[] | null>(
    enabled ? pokemonOptionsClientCache.read() : null
  );
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;

    async function refresh({ background = false } = {}) {
      if (!background) {
        setIsLoading(true);
      }
      setError("");

      try {
        const options = await loadPokemonOptions();
        if (!cancelled) {
          setPokemonOptions(options);
        }
      } catch {
        if (!cancelled) {
          setError("Could not load Pokemon options.");
        }
      } finally {
        if (!cancelled && !background) {
          setIsLoading(false);
        }
      }
    }

    const unsubscribe = pokemonOptionsClientCache.subscribe(() => {
      const cached = pokemonOptionsClientCache.read();
      if (cached) {
        setPokemonOptions(cached);
        setError("");
        return;
      }

      void refresh({ background: Boolean(pokemonOptions) });
    });

    void refresh();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [enabled, pokemonOptions, reloadToken]);

  return {
    error,
    isLoading,
    pokemonOptions,
    reload: () => setReloadToken((current) => current + 1)
  };
}

export function usePokemonOptions(enabled = true) {
  const { error, pokemonOptions } = usePokemonOptionsResource(enabled);

  return error && pokemonOptions === null ? [] : pokemonOptions;
}
