"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { TournamentEditorDialog } from "@/components/ui/TournamentEditorDialog";
import { loadPokemonOptions } from "@/lib/pokemon/use-pokemon-options";
import type { DeckSummary, PokemonOption, Tournament } from "@/types/index";

type LazyTournamentEditorButtonProps = {
  decks: DeckSummary[];
  tournament?: Tournament;
  triggerLabel: string;
  triggerVariant?: "primary" | "secondary" | "ghost";
};

export function LazyTournamentEditorButton({
  decks,
  tournament,
  triggerLabel,
  triggerVariant = "primary"
}: LazyTournamentEditorButtonProps) {
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
      setPokemonOptions(await loadPokemonOptions());
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
        <TournamentEditorDialog
          decks={decks}
          initialOpen={mountDialogOpen}
          pokemonOptions={pokemonOptions}
          tournament={tournament}
          triggerLabel={triggerLabel}
          triggerVariant={triggerVariant}
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
      <Button disabled={isLoading} onClick={handleOpen} variant={triggerVariant}>
        {isLoading ? "Loading Editor..." : triggerLabel}
      </Button>
      {loadError ? (
        <p className="text-sm text-[var(--color-loss)]" role="status">
          {loadError}
        </p>
      ) : null}
    </>
  );
}
