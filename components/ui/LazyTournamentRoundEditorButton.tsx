"use client";

import { cloneElement, isValidElement, type ReactElement } from "react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { TournamentRoundEditorDialog } from "@/components/ui/TournamentRoundEditorDialog";
import type { PokemonOption, TournamentRound } from "@/types/index";

type LazyTournamentRoundEditorButtonProps = {
  round?: TournamentRound;
  suggestedRoundNumber: number;
  tournamentId: string;
  trigger?: ReactElement<{ onClick?: () => void }>;
  triggerLabel: string;
  triggerVariant?: "primary" | "secondary" | "ghost";
};

type PokemonOptionsResponse = {
  pokemonOptions?: PokemonOption[];
};

export function LazyTournamentRoundEditorButton({
  round,
  suggestedRoundNumber,
  tournamentId,
  trigger,
  triggerLabel,
  triggerVariant = "secondary"
}: LazyTournamentRoundEditorButtonProps) {
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

  const triggerElement = isValidElement(trigger) ? (
    cloneElement(trigger, {
      ...trigger.props,
      onClick: handleOpen
    })
  ) : (
    <Button disabled={isLoading} onClick={handleOpen} variant={triggerVariant}>
      {isLoading ? "Loading Editor..." : triggerLabel}
    </Button>
  );

  return (
    <>
      {pokemonOptions ? (
        <TournamentRoundEditorDialog
          initialOpen={mountDialogOpen}
          pokemonOptions={pokemonOptions}
          round={round}
          suggestedRoundNumber={suggestedRoundNumber}
          tournamentId={tournamentId}
          trigger={trigger}
          triggerLabel={triggerLabel}
          triggerVariant={triggerVariant}
        />
      ) : triggerElement}
      {loadError ? (
        <p className="text-sm text-[var(--color-loss)]" role="status">
          {loadError}
        </p>
      ) : null}
    </>
  );
}
