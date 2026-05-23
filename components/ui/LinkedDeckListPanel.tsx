import Link from "next/link";
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

type LinkedDeckListDialogProps = {
  deckId?: string;
  deckListName: string;
  rawList?: string;
  sortedCards: DeckCard[];
};

export function LinkedDeckListDialog({
  deckId,
  deckListName,
  rawList,
  sortedCards
}: LinkedDeckListDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          View Deck
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-hidden sm:max-w-5xl">
        <DialogHeader className="min-w-0 pr-10 sm:flex-row sm:items-center sm:justify-between">
          <DialogTitle className="min-w-0 truncate">{deckListName}</DialogTitle>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <CopyDeckListButton text={rawList ?? ""} />
            {deckId ? (
              <Button asChild variant="outline">
                <Link href={`/decks/${deckId}`} prefetch={false}>
                  Jump to Deck
                </Link>
              </Button>
            ) : null}
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
