"use client";

import { cloneElement, isValidElement, type ReactElement } from "react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { loadPokemonOptions } from "@/lib/pokemon/use-pokemon-options";
import type { EditLogDialogProps } from "@/components/ui/EditLogDialog";
import type { BattleLog, DeckSelectionOption, PokemonOption } from "@/types/index";

type LazyEditLogButtonProps = {
  log: BattleLog;
  trigger?: ReactElement<{ onClick?: () => void }>;
  userDecks: DeckSelectionOption[];
};

const DynamicEditLogDialog = dynamic<EditLogDialogProps>(
  () => import("@/components/ui/EditLogDialog").then((module) => module.EditLogDialog),
  {
    ssr: false
  }
);

export function LazyEditLogButton({ log, trigger, userDecks }: LazyEditLogButtonProps) {
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
        <DynamicEditLogDialog
          initialOpen={dialogOpen}
          log={log}
          pokemonOptions={pokemonOptions}
          trigger={trigger}
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

  const triggerElement = isValidElement(trigger) ? (
    cloneElement(trigger, {
      ...trigger.props,
      onClick: () => {
        setDialogOpen(true);
        void handleOpen();
      }
    })
  ) : (
    <Button
      disabled={isLoading}
      onClick={() => {
        setDialogOpen(true);
        void handleOpen();
      }}
      variant="secondary"
    >
      Edit Log
    </Button>
  );

  return (
    <>
      {triggerElement}
      {loadError ? (
        <p className="text-sm text-[var(--color-loss)]" role="status">
          {loadError}
        </p>
      ) : null}
    </>
  );
}
