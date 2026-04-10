"use client";

import { useState } from "react";
import { ImportLogDialog } from "@/components/ui/ImportLogDialog";
import { Button } from "@/components/ui/Button";
import type { DeckSummary, PokemonOption } from "@/types/index";

type LazyImportLogButtonProps = {
  className?: string;
  label?: string;
};

type ImportDialogDataResponse = {
  pokemonOptions?: PokemonOption[];
  userDecks?: DeckSummary[];
};

export function LazyImportLogButton({
  className,
  label = "Import PTCGL Log"
}: LazyImportLogButtonProps) {
  const [pokemonOptions, setPokemonOptions] = useState<PokemonOption[] | null>(null);
  const [userDecks, setUserDecks] = useState<DeckSummary[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [mountDialogOpen, setMountDialogOpen] = useState(false);

  async function handleOpen() {
    if (pokemonOptions && userDecks) {
      setMountDialogOpen(true);
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
      setUserDecks(Array.isArray(payload.userDecks) ? payload.userDecks : []);
      setMountDialogOpen(true);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load import tools.");
    } finally {
      setIsLoading(false);
    }
  }

  if (pokemonOptions && userDecks) {
    return (
      <>
        <ImportLogDialog
          className={className}
          initialOpen={mountDialogOpen}
          pokemonOptions={pokemonOptions}
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

  return (
    <>
      <Button className={className} disabled={isLoading} onClick={handleOpen} type="button">
        {isLoading ? "Loading Importer..." : label}
      </Button>
      {loadError ? (
        <p className="text-sm text-[var(--color-loss)]" role="status">
          {loadError}
        </p>
      ) : null}
    </>
  );
}
