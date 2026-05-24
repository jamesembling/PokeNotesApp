"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Button } from "@/components/shadcn/button";
import type { DeckListViewDialog } from "@/components/ui/DeckListViewDialog";
import type { DeckList } from "@/types/index";

type DeckListViewDialogProps = React.ComponentProps<typeof DeckListViewDialog>;

type LazyDeckListViewButtonProps = Pick<
  DeckListViewDialogProps,
  "triggerLabel" | "triggerVariant"
> & {
  deckId: string;
  deckListId: string;
};

type DeckListResponse = {
  deckList?: DeckList;
  error?: string;
};

const DynamicDeckListViewDialog = dynamic<DeckListViewDialogProps>(
  () =>
    import("@/components/ui/DeckListViewDialog").then(
      (module) => module.DeckListViewDialog
    ),
  {
    ssr: false
  }
);

export function LazyDeckListViewButton({
  deckId,
  deckListId,
  triggerLabel = "View List",
  triggerVariant = "ghost"
}: LazyDeckListViewButtonProps) {
  const [deckList, setDeckList] = useState<DeckList | undefined>();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  async function handleOpen() {
    setDialogOpen(true);

    if (deckList) {
      return;
    }

    setIsLoading(true);
    setLoadError("");

    try {
      const params = new URLSearchParams({ deckId: deckId ?? "", listId: deckListId });
      const response = await fetch(`/api/deck-list?${params.toString()}`, {
        cache: "no-store",
        credentials: "same-origin"
      });
      const payload = (await response.json().catch(() => ({}))) as DeckListResponse;

      if (!response.ok || !payload.deckList) {
        throw new Error(payload.error || "Could not load this deck list.");
      }

      setDeckList(payload.deckList);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load this deck list.");
      setDialogOpen(false);
    } finally {
      setIsLoading(false);
    }
  }

  if (dialogOpen && deckList) {
    return (
      <>
        <DynamicDeckListViewDialog
          deckListName={deckList.name}
          initialOpen={dialogOpen}
          rawList={deckList.rawList}
          sortedCards={deckList.sortedCards}
          triggerLabel={triggerLabel}
          triggerVariant={triggerVariant}
        />
        {loadError ? (
          <p className="text-sm text-loss" role="status">
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
        <p className="text-sm text-loss" role="status">
          {loadError}
        </p>
      ) : null}
    </>
  );
}
