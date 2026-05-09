import Link from "next/link";
import { Button } from "@/components/shadcn/button";
import { Card } from "@/components/shadcn/card";
import { CopyDeckListButton } from "@/components/ui/CopyDeckListButton";
import { DeckListVisualGrid } from "@/components/ui/DeckListVisualGrid";
import type { DeckCard } from "@/types/index";

type LinkedDeckListPanelProps = {
  deckId?: string;
  deckListId: string;
  deckListName: string;
  deckListNotes?: string;
  deckListFormat?: string;
  rawList?: string;
  sortedCards: DeckCard[];
};

function ChevronIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4 transition group-open:rotate-180"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function LinkedDeckListPanel({
  deckId,
  deckListId,
  deckListName,
  deckListNotes,
  deckListFormat,
  rawList,
  sortedCards
}: LinkedDeckListPanelProps) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-display m-0 text-[1.28rem] font-semibold tracking-[-0.03em] text-card-foreground">
            Deck List
          </h3>
          {deckId ? (
            <Button asChild variant="outline">
              <Link href={`/decks/${deckId}`} prefetch={false}>
                Jump to Deck
              </Link>
            </Button>
          ) : null}
        </div>

        <div className="min-w-0">
          <h4 className="font-display m-0 text-[1.08rem] font-medium tracking-[-0.025em] text-muted-foreground">
            {deckListName}
          </h4>
          {deckListNotes?.trim() ? (
            <p className="mb-0 mt-2 text-[0.98rem] leading-7 text-muted-foreground">
              {deckListNotes.trim()}
            </p>
          ) : null}
          {!deckId && deckListFormat ? (
            <p className="mb-0 mt-2 text-sm font-semibold text-muted-foreground">
              {deckListFormat}
            </p>
          ) : null}
        </div>

        <details className="group pt-1">
          <summary className="ui-control-text flex cursor-pointer list-none items-center justify-between gap-4 px-0 py-3 text-primary [&::-webkit-details-marker]:hidden">
            <span>View Full Deck List</span>
            <span className="text-muted-foreground">
              <ChevronIcon />
            </span>
          </summary>
          <div className="grid gap-4 px-0 py-4">
            <div className="flex justify-end">
              <CopyDeckListButton text={rawList ?? ""} />
            </div>
            {sortedCards.length > 0 ? (
              <DeckListVisualGrid cards={sortedCards} />
            ) : (
              <p className="text-sm text-foreground">
                No parsed cards are available for this deck list yet.
              </p>
            )}
          </div>
        </details>
      </div>
    </Card>
  );
}
