"use client";

import { cloneElement, isValidElement, useEffect, type ReactElement } from "react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { Button } from "@/components/shadcn/button";
import { loadPokemonOptions } from "@/lib/pokemon/use-pokemon-options";
import type { EditLogDialogProps } from "@/components/ui/EditLogDialog";
import type { BattleLog, DeckSelectionOption, PokemonOption } from "@/types/index";

type LazyEditLogButtonProps = {
  autoOpen?: boolean;
  log: BattleLog;
  trigger?: ReactElement<{
    onClick?: () => void;
    onSelect?: (event: Event) => void;
  }>;
  userDecks: DeckSelectionOption[];
};

type DeckSelectionOptionsResponse = {
  userDecks?: DeckSelectionOption[];
};

const DynamicEditLogDialog = dynamic<EditLogDialogProps>(
  () => import("@/components/ui/EditLogDialog").then((module) => module.EditLogDialog),
  {
    ssr: false
  }
);

export function LazyEditLogButton({ autoOpen = false, log, trigger, userDecks }: LazyEditLogButtonProps) {
  const [pokemonOptions, setPokemonOptions] = useState<PokemonOption[] | null>(null);
  const [loadedUserDecks, setLoadedUserDecks] = useState<DeckSelectionOption[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  async function handleOpen() {
    if (pokemonOptions && (userDecks.length > 0 || loadedUserDecks)) {
      return;
    }

    setIsLoading(true);
    setLoadError("");

    try {
      const [nextPokemonOptions, nextUserDecks] = await Promise.all([
        pokemonOptions ? Promise.resolve(pokemonOptions) : loadPokemonOptions(),
        userDecks.length > 0 || loadedUserDecks
          ? Promise.resolve(userDecks.length > 0 ? userDecks : loadedUserDecks)
          : fetch("/api/deck-selection-options", {
              cache: "no-store",
              credentials: "same-origin"
            }).then(async (response) => {
              if (!response.ok) {
                throw new Error("Could not load deck options.");
              }

              const payload = (await response.json()) as DeckSelectionOptionsResponse;
              return payload.userDecks ?? [];
            })
      ]);

      setPokemonOptions(nextPokemonOptions);
      setLoadedUserDecks(nextUserDecks);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load edit options.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (!autoOpen) {
      return;
    }

    setDialogOpen(true);
    void handleOpen();
    // This component is keyed per row-menu edit request when autoOpen is used.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen]);

  if (pokemonOptions) {
    const resolvedUserDecks = userDecks.length > 0 ? userDecks : loadedUserDecks ?? [];

    return (
      <>
        <DynamicEditLogDialog
          hideTrigger={autoOpen}
          initialOpen={dialogOpen}
          log={log}
          pokemonOptions={pokemonOptions}
          trigger={trigger}
          userDecks={resolvedUserDecks}
        />
        {loadError ? (
          <p className="text-sm text-loss" role="status">
            {loadError}
          </p>
        ) : null}
      </>
    );
  }

  if (autoOpen) {
    return loadError ? (
      <p className="text-sm text-loss" role="status">
        {loadError}
      </p>
    ) : null;
  }

  const triggerElement = isValidElement(trigger) ? (
    cloneElement(trigger, {
      ...trigger.props,
      onClick: () => {
        trigger.props.onClick?.();
        setDialogOpen(true);
        void handleOpen();
      },
      onSelect: (event: Event) => {
        trigger.props.onSelect?.(event);
        event.preventDefault();
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
      variant="outline"
    >
      Edit Log
    </Button>
  );

  return (
    <>
      {triggerElement}
      {loadError ? (
        <p className="text-sm text-loss" role="status">
          {loadError}
        </p>
      ) : null}
    </>
  );
}
