"use client";

import {
  cloneElement,
  isValidElement,
  useEffect,
  type ComponentProps,
  type ReactElement
} from "react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { Button } from "@/components/shadcn/button";
import { loadPokemonOptions } from "@/lib/pokemon/use-pokemon-options";
import type { EditLogDialogProps } from "@/components/ui/EditLogDialog";
import type {
  BattleLog,
  DeckListSelectionOption,
  DeckSelectionOption,
  PokemonOption
} from "@/types/index";

type LazyEditLogButtonProps = {
  autoOpen?: boolean;
  className?: string;
  log: BattleLog;
  trigger?: ReactElement<{
    onClick?: () => void;
    onSelect?: (event: Event) => void;
  }>;
  userDeckLists?: DeckListSelectionOption[];
  userDecks: DeckSelectionOption[];
  variant?: ComponentProps<typeof Button>["variant"];
};

type DeckSelectionOptionsResponse = {
  deckLists?: DeckListSelectionOption[];
  userDecks?: DeckSelectionOption[];
};

const DynamicEditLogDialog = dynamic<EditLogDialogProps>(
  () => import("@/components/ui/EditLogDialog").then((module) => module.EditLogDialog),
  {
    ssr: false
  }
);

export function LazyEditLogButton({
  autoOpen = false,
  className,
  log,
  trigger,
  userDeckLists = [],
  userDecks,
  variant = "outline"
}: LazyEditLogButtonProps) {
  const [pokemonOptions, setPokemonOptions] = useState<PokemonOption[] | null>(null);
  const [loadedUserDecks, setLoadedUserDecks] = useState<DeckSelectionOption[] | null>(null);
  const [loadedUserDeckLists, setLoadedUserDeckLists] = useState<DeckListSelectionOption[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  async function handleOpen() {
    const hasDeckOptions = userDecks.length > 0 || loadedUserDecks !== null;
    const hasDeckListOptions = userDeckLists.length > 0 || loadedUserDeckLists !== null;
    if (pokemonOptions && hasDeckOptions && hasDeckListOptions) {
      return;
    }

    setIsLoading(true);
    setLoadError("");

    try {
      const [nextPokemonOptions, nextOptions] = await Promise.all([
        pokemonOptions ? Promise.resolve(pokemonOptions) : loadPokemonOptions(),
        hasDeckOptions && hasDeckListOptions
          ? Promise.resolve({
              deckLists: userDeckLists.length > 0 ? userDeckLists : loadedUserDeckLists ?? [],
              userDecks: userDecks.length > 0 ? userDecks : loadedUserDecks ?? []
            })
          : fetch("/api/deck-selection-options", {
              cache: "no-store",
              credentials: "same-origin"
            }).then(async (response) => {
              if (!response.ok) {
                throw new Error("Could not load deck options.");
              }

              const payload = (await response.json()) as DeckSelectionOptionsResponse;
              return {
                deckLists: payload.deckLists ?? [],
                userDecks: payload.userDecks ?? []
              };
            })
      ]);

      setPokemonOptions(nextPokemonOptions);
      setLoadedUserDecks(nextOptions.userDecks);
      setLoadedUserDeckLists(nextOptions.deckLists);
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
    const resolvedUserDeckLists = userDeckLists.length > 0 ? userDeckLists : loadedUserDeckLists ?? [];

    return (
      <>
        <DynamicEditLogDialog
          hideTrigger={autoOpen}
          initialOpen={dialogOpen}
          log={log}
          pokemonOptions={pokemonOptions}
          trigger={trigger}
          userDeckLists={resolvedUserDeckLists}
          userDecks={resolvedUserDecks}
        />
        {loadError ? (
          <p className="text-sm text-loss-strong" role="status">
            {loadError}
          </p>
        ) : null}
      </>
    );
  }

  if (autoOpen) {
    return loadError ? (
      <p className="text-sm text-loss-strong" role="status">
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
      className={className}
      disabled={isLoading}
      onClick={() => {
        setDialogOpen(true);
        void handleOpen();
      }}
      variant={variant}
    >
      Edit Log
    </Button>
  );

  return (
    <>
      {triggerElement}
      {loadError ? (
        <p className="text-sm text-loss-strong" role="status">
          {loadError}
        </p>
      ) : null}
    </>
  );
}
