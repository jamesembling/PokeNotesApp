"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { loadPokemonOptions } from "@/lib/pokemon/use-pokemon-options";
import type { TournamentEditorDialogProps } from "@/components/ui/TournamentEditorDialog";
import type { PokemonOption, Tournament, TournamentDeckChoice } from "@/types/index";

type LazyTournamentEditorButtonProps = {
  decks?: TournamentDeckChoice[];
  tournament?: Tournament;
  triggerLabel: string;
  triggerVariant?: "primary" | "secondary" | "ghost";
};

type TournamentEditorDataResponse = {
  decks?: TournamentDeckChoice[];
  pokemonOptions?: PokemonOption[];
};

let tournamentEditorDataCache: TournamentEditorDataResponse | null = null;
let tournamentEditorDataPromise: Promise<TournamentEditorDataResponse> | null = null;

const DynamicTournamentEditorDialog = dynamic<TournamentEditorDialogProps>(
  () =>
    import("@/components/ui/TournamentEditorDialog").then((module) => module.TournamentEditorDialog),
  {
    ssr: false
  }
);

async function loadTournamentEditorData() {
  if (tournamentEditorDataCache) {
    return tournamentEditorDataCache;
  }

  if (!tournamentEditorDataPromise) {
    tournamentEditorDataPromise = fetch("/api/tournament-editor-data", {
      credentials: "same-origin",
      cache: "no-store"
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Could not load tournament editor data.");
        }

        const payload = (await response.json()) as TournamentEditorDataResponse;
        tournamentEditorDataCache = payload;
        return payload;
      })
      .catch(() => {
        tournamentEditorDataPromise = null;
        throw new Error("Could not load tournament editor data.");
      })
      .finally(() => {
        tournamentEditorDataPromise = null;
      });
  }

  return tournamentEditorDataPromise;
}

export function LazyTournamentEditorButton({
  decks: initialDecks = [],
  tournament,
  triggerLabel,
  triggerVariant = "primary"
}: LazyTournamentEditorButtonProps) {
  const [pokemonOptions, setPokemonOptions] = useState<PokemonOption[] | null>(null);
  const [decks, setDecks] = useState<TournamentDeckChoice[]>(initialDecks);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  async function handleOpen() {
    if (pokemonOptions && decks.length > 0) {
      return;
    }

    setIsLoading(true);
    setLoadError("");

    try {
      const [nextPokemonOptions, payload] = await Promise.all([
        loadPokemonOptions(),
        decks.length > 0 ? Promise.resolve<TournamentEditorDataResponse>({}) : loadTournamentEditorData()
      ]);

      setPokemonOptions(Array.isArray(payload.pokemonOptions) ? payload.pokemonOptions : nextPokemonOptions);
      if (Array.isArray(payload.decks)) {
        setDecks(payload.decks);
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load tournament editor.");
    } finally {
      setIsLoading(false);
    }
  }

  if (pokemonOptions) {
    return (
      <>
        <DynamicTournamentEditorDialog
          decks={decks}
          initialOpen={dialogOpen}
          pokemonOptions={pokemonOptions}
          tournament={tournament}
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
