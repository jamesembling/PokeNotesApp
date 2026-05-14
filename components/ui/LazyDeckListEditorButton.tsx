"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Button } from "@/components/shadcn/button";
import type { DeckListEditorDialogProps } from "@/components/ui/DeckListEditorDialog";
import type { DeckList } from "@/types/index";

type LazyDeckListEditorButtonProps = Omit<DeckListEditorDialogProps, "deckList"> & {
  deckList?: DeckList;
  deckListId?: string;
};

type DeckListResponse = {
  deckList?: DeckList;
  error?: string;
};

const DynamicDeckListEditorDialog = dynamic<DeckListEditorDialogProps>(
  () =>
    import("@/components/ui/DeckListEditorDialog").then(
      (module) => module.DeckListEditorDialog
    ),
  {
    ssr: false
  }
);

export function LazyDeckListEditorButton({
  deckId,
  deckList,
  deckListId,
  defaultCreatedBy,
  defaultFormat,
  triggerLabel,
  triggerVariant = "outline"
}: LazyDeckListEditorButtonProps) {
  const [resolvedDeckList, setResolvedDeckList] = useState<DeckList | undefined>(deckList);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  async function handleOpen() {
    setDialogOpen(true);

    if (resolvedDeckList || !deckListId) {
      return;
    }

    setIsLoading(true);
    setLoadError("");

    try {
      const params = new URLSearchParams({ deckId, listId: deckListId });
      const response = await fetch(`/api/deck-list?${params.toString()}`, {
        cache: "no-store",
        credentials: "same-origin"
      });
      const payload = (await response.json().catch(() => ({}))) as DeckListResponse;

      if (!response.ok || !payload.deckList) {
        throw new Error(payload.error || "Could not load this deck list.");
      }

      setResolvedDeckList(payload.deckList);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load this deck list.");
      setDialogOpen(false);
    } finally {
      setIsLoading(false);
    }
  }

  if (dialogOpen && (!deckListId || resolvedDeckList)) {
    return (
      <>
        <DynamicDeckListEditorDialog
          deckId={deckId}
          deckList={resolvedDeckList}
          defaultCreatedBy={defaultCreatedBy}
          defaultFormat={defaultFormat}
          initialOpen={dialogOpen}
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
      <Button disabled={isLoading} onClick={handleOpen} variant={triggerVariant}>
        {isLoading ? "Loading..." : triggerLabel}
      </Button>
      {loadError ? (
        <p className="text-sm text-[var(--color-loss)]" role="status">
          {loadError}
        </p>
      ) : null}
    </>
  );
}
