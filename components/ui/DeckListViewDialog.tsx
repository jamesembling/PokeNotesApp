"use client";

import { useState } from "react";
import { Button } from "@/components/shadcn/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/shadcn/dialog";
import { CopyDeckListButton } from "@/components/ui/CopyDeckListButton";
import { DeckListVisualGrid } from "@/components/ui/DeckListVisualGrid";
import type { DeckCard } from "@/types/index";

type DeckListViewDialogProps = {
  deckListName: string;
  initialOpen?: boolean;
  rawList?: string;
  sortedCards: DeckCard[];
  triggerLabel?: string;
  triggerVariant?: "default" | "outline" | "ghost";
};

export function DeckListViewDialog({
  deckListName,
  initialOpen = false,
  rawList,
  sortedCards,
  triggerLabel = "View List",
  triggerVariant = "outline"
}: DeckListViewDialogProps) {
  const [isOpen, setIsOpen] = useState(initialOpen);

  return (
    <Dialog onOpenChange={setIsOpen} open={isOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant={triggerVariant}>
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-hidden sm:max-w-5xl">
        <DialogHeader className="min-w-0 pr-10 sm:flex-row sm:items-center sm:justify-between">
          <DialogTitle className="min-w-0 truncate">{deckListName}</DialogTitle>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <CopyDeckListButton text={rawList ?? ""} />
          </div>
        </DialogHeader>
        <div className="max-h-[min(72dvh,48rem)] min-w-0 overflow-x-hidden overflow-y-auto pr-1">
          {sortedCards.length > 0 ? (
            <DeckListVisualGrid cards={sortedCards} variant="featured" />
          ) : (
            <p className="text-sm text-foreground">
              No parsed cards are available for this deck list yet.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
