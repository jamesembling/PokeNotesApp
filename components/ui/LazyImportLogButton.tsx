"use client";

import { useState } from "react";
import { ImportLogDialog } from "@/components/ui/ImportLogDialog";
import type { DeckSummary, PokemonOption } from "@/types/index";

type LazyImportLogButtonProps = {
  className?: string;
  initialUserDecks?: DeckSummary[];
  label?: string;
};

type ImportDialogDataResponse = {
  pokemonOptions?: PokemonOption[];
  userDecks?: DeckSummary[];
};

export function LazyImportLogButton({
  className,
  initialUserDecks = [],
  label = "Import PTCGL Log"
}: LazyImportLogButtonProps) {
  const [pokemonOptions, setPokemonOptions] = useState<PokemonOption[] | null>(null);
  const [userDecks, setUserDecks] = useState<DeckSummary[]>(initialUserDecks);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  async function handleImporterOpen() {
    if ((pokemonOptions && userDecks.length > 0) || isLoading) {
      return;
    }

    setIsLoading(true);
    setLoadError("");

    try {
      const route = userDecks.length > 0 ? "/api/pokemon-options" : "/api/import-dialog-data";
      const response = await fetch(route, {
        credentials: "same-origin",
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error("Could not load import tools.");
      }

      const payload = (await response.json()) as ImportDialogDataResponse;
      setPokemonOptions(Array.isArray(payload.pokemonOptions) ? payload.pokemonOptions : []);
      if (Array.isArray(payload.userDecks)) {
        setUserDecks(payload.userDecks);
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load import tools.");
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
        userDecks={userDecks}
      />
      {loadError ? (
        <p className="text-sm text-[var(--color-loss)]" role="status">
          {loadError}
        </p>
      ) : null}
    </>
  );
}
