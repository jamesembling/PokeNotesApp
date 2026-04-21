"use client";

import { useState } from "react";
import { ImportLogDialog } from "@/components/ui/ImportLogDialog";
import type { DeckSelectionOption, PokemonOption } from "@/types/index";

type LazyImportLogButtonProps = {
  className?: string;
  initialUserDecks?: DeckSelectionOption[];
  label?: string;
};

type ImportDialogDataResponse = {
  pokemonOptions?: PokemonOption[];
  ptcglUsername?: string;
  userDecks?: DeckSelectionOption[];
};

export function LazyImportLogButton({
  className,
  initialUserDecks = [],
  label = "Import PTCGL Log"
}: LazyImportLogButtonProps) {
  const [pokemonOptions, setPokemonOptions] = useState<PokemonOption[] | null>(null);
  const [ptcglUsername, setPtcglUsername] = useState("");
  const [userDecks, setUserDecks] = useState<DeckSelectionOption[]>(initialUserDecks);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  async function handleImporterOpen() {
    if (pokemonOptions && ptcglUsername && userDecks.length > 0) {
      return;
    }

    if (isLoading) {
      return;
    }

    setIsLoading(true);
    setLoadError("");

    try {
      const response = await fetch("/api/import-dialog-data", {
        credentials: "same-origin",
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error("Could not load import tools.");
      }

      const payload = (await response.json()) as ImportDialogDataResponse;
      setPokemonOptions(Array.isArray(payload.pokemonOptions) ? payload.pokemonOptions : []);
      setPtcglUsername(String(payload.ptcglUsername || "").trim());
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
        onOpen={handleImporterOpen}
        pokemonOptions={pokemonOptions ?? []}
        ptcglUsername={ptcglUsername}
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
