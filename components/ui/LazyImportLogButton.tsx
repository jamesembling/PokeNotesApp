"use client";

import { useState } from "react";
import { ImportLogDialog } from "@/components/ui/ImportLogDialog";
import type { DeckSummary, PokemonOption } from "@/types/index";

type LazyImportLogButtonProps = {
  className?: string;
  initialUserDecks?: DeckSummary[];
  label?: string;
};

type PokemonOptionsResponse = {
  pokemonOptions?: PokemonOption[];
};

export function LazyImportLogButton({
  className,
  initialUserDecks = [],
  label = "Import PTCGL Log"
}: LazyImportLogButtonProps) {
  const [pokemonOptions, setPokemonOptions] = useState<PokemonOption[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  async function handleImporterOpen() {
    if (pokemonOptions || isLoading) {
      return;
    }

    setIsLoading(true);
    setLoadError("");

    try {
      const response = await fetch("/api/pokemon-options", {
        credentials: "same-origin",
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error("Could not load Pokemon options.");
      }

      const payload = (await response.json()) as PokemonOptionsResponse;
      setPokemonOptions(Array.isArray(payload.pokemonOptions) ? payload.pokemonOptions : []);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load Pokemon options.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      <ImportLogDialog
        className={className}
        importDataError={loadError}
        isImportDataLoading={isLoading}
        onOpen={handleImporterOpen}
        pokemonOptions={pokemonOptions ?? []}
        triggerLabel={label}
        userDecks={initialUserDecks}
      />
      {loadError ? (
        <p className="text-sm text-[var(--color-loss)]" role="status">
          {loadError}
        </p>
      ) : null}
    </>
  );
}
