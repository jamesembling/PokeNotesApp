"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Button } from "@/components/shadcn/button";
import type { ImportLogDialogProps } from "@/components/ui/ImportLogDialog";
import type { DeckSelectionOption, PokemonOption } from "@/types/index";

type LazyImportLogButtonProps = {
  className?: string;
  initialUserDecks?: DeckSelectionOption[];
  label?: string;
};

type ImportDialogDataResponse = {
  pokemonOptions?: PokemonOption[];
  ptcglUsername?: string;
  userDecks?: DeckSelectionOption[];
};

const DynamicImportLogDialog = dynamic<ImportLogDialogProps>(
  () =>
    import("@/components/ui/ImportLogDialog").then((module) => module.ImportLogDialog),
  {
    ssr: false
  }
);

let importDialogAssetsWarmed = false;

function warmImportDialogAssets() {
  if (importDialogAssetsWarmed) {
    return;
  }

  importDialogAssetsWarmed = true;
  void import("@/components/ui/ImportLogDialog");
}

export function LazyImportLogButton({
  className,
  initialUserDecks = [],
  label = "Import PTCGL Log"
}: LazyImportLogButtonProps) {
  const [pokemonOptions, setPokemonOptions] = useState<PokemonOption[] | null>(null);
  const [ptcglUsername, setPtcglUsername] = useState("");
  const [userDecks, setUserDecks] = useState<DeckSelectionOption[]>(initialUserDecks);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    const warm = () => warmImportDialogAssets();

    if ("requestIdleCallback" in window) {
      const idleCallbackId = window.requestIdleCallback(warm, { timeout: 3000 });
      return () => window.cancelIdleCallback(idleCallbackId);
    }

    const timeoutId = globalThis.setTimeout(warm, 1500);
    return () => globalThis.clearTimeout(timeoutId);
  }, []);

  async function handleImporterOpen() {
    if (pokemonOptions && ptcglUsername && userDecks.length > 0) {
      return;
    }

    if (isLoading) {
      return;
    }

    setIsLoading(true);
    setLoadError("");

    try {
      const response = await fetch("/api/import-dialog-data", {
        credentials: "same-origin",
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error("Could not load import tools.");
      }

      const payload = (await response.json()) as ImportDialogDataResponse;
      setPokemonOptions(Array.isArray(payload.pokemonOptions) ? payload.pokemonOptions : []);
      setPtcglUsername(String(payload.ptcglUsername || "").trim());
      if (Array.isArray(payload.userDecks)) {
        setUserDecks(payload.userDecks);
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load import tools.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      <Button
        className={className}
        disabled={isLoading}
        onFocus={warmImportDialogAssets}
        onClick={() => {
          setDialogOpen(true);
          warmImportDialogAssets();
          void handleImporterOpen();
        }}
        onPointerEnter={warmImportDialogAssets}
      >
        {isLoading ? "Loading..." : label}
      </Button>
      {dialogOpen ? (
        <DynamicImportLogDialog
          importDataError={loadError}
          initialOpen
          onClose={() => setDialogOpen(false)}
          pokemonOptions={pokemonOptions ?? []}
          ptcglUsername={ptcglUsername}
          renderTrigger={false}
          userDecks={userDecks}
        />
      ) : null}
      {loadError ? (
        <p className="text-sm text-[var(--color-loss)]" role="status">
          {loadError}
        </p>
      ) : null}
    </>
  );
}
