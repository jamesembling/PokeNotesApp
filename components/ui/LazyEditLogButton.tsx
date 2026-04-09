"use client";

import { cloneElement, isValidElement, type ReactElement } from "react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { PencilIcon } from "@/components/ui/icons";
import { EditLogDialog } from "@/components/ui/EditLogDialog";
import type { BattleLog, DeckSummary, PokemonOption } from "@/types/index";

type LazyEditLogButtonProps = {
  log: BattleLog;
  trigger?: ReactElement<{ onClick?: () => void }>;
  userDecks: DeckSummary[];
};

type PokemonOptionsResponse = {
  pokemonOptions?: PokemonOption[];
};

export function LazyEditLogButton({ log, trigger, userDecks }: LazyEditLogButtonProps) {
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

  const triggerElement = isValidElement(trigger) ? (
    cloneElement(trigger, {
      ...trigger.props,
      onClick: handleOpen
    })
  ) : (
    <Button
      aria-label="Edit battle log"
      className="h-10 w-10 px-0"
      disabled={isLoading}
      onClick={handleOpen}
      variant="ghost"
    >
      <PencilIcon className="h-4 w-4" />
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
