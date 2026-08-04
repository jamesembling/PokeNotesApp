"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/shadcn/button";
import { AppDialogContent } from "@/components/ui/AppDialog";
import {
  Dialog,
  DialogDescription,
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
  triggerChildren?: ReactNode;
  triggerClassName?: string;
  triggerLabel?: string;
  triggerSize?: React.ComponentProps<typeof Button>["size"];
  triggerVariant?: "default" | "outline" | "ghost";
};

export function DeckListViewDialog({
  deckListName,
  initialOpen = false,
  rawList,
  sortedCards,
  triggerChildren,
  triggerClassName,
  triggerLabel = "View List",
  triggerSize = "default",
  triggerVariant = "outline"
}: DeckListViewDialogProps) {
  const [isOpen, setIsOpen] = useState(initialOpen);

  return (
    <Dialog onOpenChange={setIsOpen} open={isOpen}>
      <DialogTrigger asChild>
        <Button className={triggerClassName} size={triggerSize} type="button" variant={triggerVariant}>
          {triggerChildren ?? triggerLabel}
        </Button>
      </DialogTrigger>
      <AppDialogContent className="p-4" size="xl">
        <DialogHeader className="min-w-0 w-full">
          <DialogTitle className="min-w-0 truncate pr-10">{deckListName}</DialogTitle>
          <DialogDescription className="sr-only">
            View the parsed cards in {deckListName}. Each card image opens its card page in a new tab.
          </DialogDescription>
          <div className="w-full">
            <CopyDeckListButton className="flex w-full" text={rawList ?? ""} variant="default" />
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
      </AppDialogContent>
    </Dialog>
  );
}
