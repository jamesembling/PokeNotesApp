"use client";

import { useEffect, useState } from "react";
import type { PokemonOption } from "@/types/index";

type PokemonOptionsResponse = {
  pokemonOptions?: PokemonOption[];
};

let pokemonOptionsCache: PokemonOption[] | null = null;
let pokemonOptionsPromise: Promise<PokemonOption[]> | null = null;

export async function loadPokemonOptions() {
  if (pokemonOptionsCache) {
    return pokemonOptionsCache;
  }

  if (!pokemonOptionsPromise) {
    pokemonOptionsPromise = fetch("/api/pokemon-options", {
      credentials: "same-origin",
      cache: "no-store"
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Could not load Pokemon options.");
        }

        const payload = (await response.json()) as PokemonOptionsResponse;
        const options = Array.isArray(payload.pokemonOptions) ? payload.pokemonOptions : [];
        pokemonOptionsCache = options;
        return options;
      })
      .catch(() => {
        pokemonOptionsPromise = null;
        throw new Error("Could not load Pokemon options.");
      })
      .finally(() => {
        pokemonOptionsPromise = null;
      });
  }

  return pokemonOptionsPromise;
}

export function usePokemonOptions() {
  const [pokemonOptions, setPokemonOptions] = useState<PokemonOption[] | null>(pokemonOptionsCache);

  useEffect(() => {
    let cancelled = false;

    loadPokemonOptions()
      .then((options) => {
        if (!cancelled) {
          setPokemonOptions(options);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPokemonOptions([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return pokemonOptions;
}
