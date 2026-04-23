"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { loadPokemonOptions } from "@/lib/pokemon/use-pokemon-options";
import type { DeckEditorDialogProps } from "@/components/ui/DeckEditorDialog";
import type { Deck, PokemonOption } from "@/types/index";

type LazyDeckEditorButtonProps = {
  deck?: Deck;
  triggerLabel: string;
  triggerVariant?: "primary" | "secondary" | "ghost";
};

const DynamicDeckEditorDialog = dynamic<DeckEditorDialogProps>(
  () => import("@/components/ui/DeckEditorDialog").then((module) => module.DeckEditorDialog),
  {
    ssr: false
  }
);

export function LazyDeckEditorButton({
  deck,
  triggerLabel,
  triggerVariant = "primary"
}: LazyDeckEditorButtonProps) {
  const [pokemonOptions, setPokemonOptions] = useState<PokemonOption[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  async function handleOpen() {
    if (pokemonOptions) {
      return;
    }

    setIsLoading(true);
    setLoadError("");

    try {
      setPokemonOptions(await loadPokemonOptions());
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load Pokemon options.");
    } finally {
      setIsLoading(false);
    }
  }

  if (pokemonOptions) {
    return (
      <>
        <DynamicDeckEditorDialog
          deck={deck}
          initialOpen={dialogOpen}
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
      <Button
        disabled={isLoading}
        onClick={() => {
          setDialogOpen(true);
          void handleOpen();
        }}
        variant={triggerVariant}
      >
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
