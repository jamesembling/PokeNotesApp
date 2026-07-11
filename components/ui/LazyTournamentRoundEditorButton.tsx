"use client";

import { cloneElement, isValidElement, type ReactElement } from "react";
import { useState } from "react";
import { Button } from "@/components/shadcn/button";
import { TournamentRoundEditorDialog } from "@/components/ui/TournamentRoundEditorDialog";
import { loadPokemonOptions } from "@/lib/pokemon/use-pokemon-options";
import type { PokemonOption, TournamentRound } from "@/types/index";

type LazyTournamentRoundEditorButtonProps = {
  round?: TournamentRound;
  suggestedRoundNumber: number;
  tournamentId: string;
  trigger?: ReactElement<{ onClick?: () => void }>;
  triggerClassName?: string;
  triggerLabel: string;
  triggerVariant?: "default" | "outline" | "ghost";
};

export function LazyTournamentRoundEditorButton({
  round,
  suggestedRoundNumber,
  tournamentId,
  trigger,
  triggerClassName,
  triggerLabel,
  triggerVariant = "outline"
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
      setPokemonOptions(await loadPokemonOptions());
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
    <Button
      className={triggerClassName}
      disabled={isLoading}
      onClick={handleOpen}
      variant={triggerVariant}
    >
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
          triggerClassName={triggerClassName}
          triggerLabel={triggerLabel}
          triggerVariant={triggerVariant}
        />
      ) : triggerElement}
      {loadError ? (
        <p className="text-sm text-loss-strong" role="status">
          {loadError}
        </p>
      ) : null}
    </>
  );
}
