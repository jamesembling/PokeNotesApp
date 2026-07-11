"use client";

import dynamic from "next/dynamic";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/shadcn/button";
import { usePokemonOptionsResource } from "@/lib/pokemon/use-pokemon-options";
import type { TournamentEditorDialogProps } from "@/components/ui/TournamentEditorDialog";
import type { Tournament } from "@/types/index";

type LazyTournamentEditorButtonProps = {
  className?: string;
  tournament?: Tournament;
  triggerChildren?: ReactNode;
  triggerLabel: string;
  triggerVariant?: "default" | "outline" | "ghost";
};

const DynamicTournamentEditorDialog = dynamic<TournamentEditorDialogProps>(
  () =>
    import("@/components/ui/TournamentEditorDialog").then((module) => module.TournamentEditorDialog),
  {
    ssr: false
  }
);

export function LazyTournamentEditorButton({
  className,
  tournament,
  triggerChildren,
  triggerLabel,
  triggerVariant = "default"
}: LazyTournamentEditorButtonProps) {
  const [optionsRequested, setOptionsRequested] = useState(false);
  const {
    error: loadError,
    isLoading,
    pokemonOptions,
    reload
  } = usePokemonOptionsResource(optionsRequested);
  const [dialogOpen, setDialogOpen] = useState(false);

  if (pokemonOptions) {
    return (
      <>
        <DynamicTournamentEditorDialog
          initialOpen={dialogOpen}
          pokemonOptions={pokemonOptions}
          tournament={tournament}
          triggerChildren={triggerChildren}
          triggerClassName={className}
          triggerLabel={triggerLabel}
          triggerVariant={triggerVariant}
        />
        {loadError ? (
          <p className="text-sm text-loss-strong" role="status">
            {loadError}
          </p>
        ) : null}
      </>
    );
  }

  return (
    <>
      <Button
        className={className}
        disabled={isLoading}
        onClick={() => {
          setDialogOpen(true);
          if (optionsRequested) {
            reload();
          } else {
            setOptionsRequested(true);
          }
        }}
        variant={triggerVariant}
      >
        {isLoading ? "Loading Editor..." : (triggerChildren ?? triggerLabel)}
      </Button>
      {loadError ? (
        <p className="text-sm text-loss-strong" role="status">
          {loadError}
        </p>
      ) : null}
    </>
  );
}
