"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { EditLogDialog } from "@/components/ui/EditLogDialog";
import type { BattleLog, DeckSummary, PokemonOption } from "@/types/index";

type LazyEditLogButtonProps = {
  log: BattleLog;
  userDecks: DeckSummary[];
};

type PokemonOptionsResponse = {
  pokemonOptions?: PokemonOption[];
};

export function LazyEditLogButton({ log, userDecks }: LazyEditLogButtonProps) {
  const [pokemonOptions, setPokemonOptions] = useState<PokemonOption[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [mountDialogOpen, setMountDialogOpen] = useState(false);

  async function handleOpen() {
    if (pokemonOptions) {
      setMountDialogOpen(true);
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
      setMountDialogOpen(true);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load Pokemon options.");
    } finally {
      setIsLoading(false);
    }
  }

  if (pokemonOptions) {
    return (
      <>
        <EditLogDialog
          initialOpen={mountDialogOpen}
          log={log}
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
      <Button disabled={isLoading} onClick={handleOpen} type="button" variant="secondary">
        {isLoading ? "Loading Editor..." : "Edit Log"}
      </Button>
      {loadError ? (
        <p className="text-sm text-[var(--color-loss)]" role="status">
          {loadError}
        </p>
      ) : null}
    </>
  );
}
