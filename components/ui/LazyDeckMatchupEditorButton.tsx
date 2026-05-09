"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/shadcn/button";
import { DeckMatchupEditorDialog } from "@/components/ui/DeckMatchupEditorDialog";
import { loadPokemonOptions } from "@/lib/pokemon/use-pokemon-options";
import type { DeckMatchup, PokemonOption } from "@/types/index";

type LazyDeckMatchupEditorButtonProps = {
  children?: ReactNode;
  className?: string;
  deckId: string;
  loadingLabel?: string;
  matchup?: DeckMatchup;
  triggerLabel: string;
  triggerVariant?: "default" | "outline" | "ghost";
  usePlainButton?: boolean;
};

export function LazyDeckMatchupEditorButton({
  children,
  className,
  deckId,
  loadingLabel = "Loading...",
  matchup,
  triggerLabel,
  triggerVariant = "outline",
  usePlainButton = false
}: LazyDeckMatchupEditorButtonProps) {
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
        <DeckMatchupEditorDialog
          className={className}
          deckId={deckId}
          initialOpen={mountDialogOpen}
          matchup={matchup}
          pokemonOptions={pokemonOptions}
          triggerLabel={triggerLabel}
          triggerVariant={triggerVariant}
          usePlainButton={usePlainButton}
        >
          {children}
        </DeckMatchupEditorDialog>
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
      {usePlainButton ? (
        <Button
          className={className}
          disabled={isLoading}
          onClick={handleOpen}
          type="button"
          variant="ghost"
        >
          {isLoading ? loadingLabel : children ?? triggerLabel}
        </Button>
      ) : (
        <Button className={className} disabled={isLoading} onClick={handleOpen} variant={triggerVariant}>
          {isLoading ? loadingLabel : children ?? triggerLabel}
        </Button>
      )}
      {loadError ? (
        <p className="text-sm text-[var(--color-loss)]" role="status">
          {loadError}
        </p>
      ) : null}
    </>
  );
}
