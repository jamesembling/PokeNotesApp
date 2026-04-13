"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { DeckEditorDialog } from "@/components/ui/DeckEditorDialog";
import { loadPokemonOptions } from "@/lib/pokemon/use-pokemon-options";
import type { Deck, PokemonOption } from "@/types/index";

type LazyDeckEditorButtonProps = {
  deck?: Deck;
  triggerLabel: string;
  triggerVariant?: "primary" | "secondary" | "ghost";
};

export function LazyDeckEditorButton({
  deck,
  triggerLabel,
  triggerVariant = "primary"
}: LazyDeckEditorButtonProps) {
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
        <DeckEditorDialog
          deck={deck}
          initialOpen={mountDialogOpen}
          pokemonOptions={pokemonOptions}
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
