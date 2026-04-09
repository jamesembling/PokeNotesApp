"use client";

import { useEffect, useState } from "react";
import type { PokemonOption } from "@/types/index";

type PokemonOptionsResponse = {
  pokemonOptions?: PokemonOption[];
};

let pokemonOptionsPromise: Promise<PokemonOption[]> | null = null;

async function loadPokemonOptions() {
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
        return options;
      })
      .catch((error) => {
        pokemonOptionsPromise = null;
        throw error;
      });
  }

  return pokemonOptionsPromise;
}

export function usePokemonOptions() {
  const [pokemonOptions, setPokemonOptions] = useState<PokemonOption[] | null>(null);

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
      pokemonOptionsPromise = null;
    };
  }, []);

  return pokemonOptions;
}
