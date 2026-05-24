import { Card } from "@/components/shadcn/card";
import { DeckListViewDialog } from "@/components/ui/DeckListViewDialog";
import type { DeckCard } from "@/types/index";

type TournamentDeckListPanelProps = {
  deckListFormat?: string;
  deckListName?: string;
  deckListNotes?: string;
  rawList?: string;
  sortedCards?: DeckCard[];
};

export function TournamentDeckListPanel({
  deckListFormat,
  deckListName,
  deckListNotes,
  rawList,
  sortedCards = []
}: TournamentDeckListPanelProps) {
  const hasVisualDeckList = Boolean(deckListName);

  if (!hasVisualDeckList) {
    return null;
  }

  return (
    <Card className="rounded-[24px] bg-card p-4 shadow-[var(--shadow-sm)] sm:p-5">
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="ui-eyebrow">Deck List</p>
            <h3 className="font-display m-0 text-[1.18rem] font-semibold tracking-[-0.03em] text-card-foreground">
              {deckListName || "Tournament Deck List"}
            </h3>
            {deckListNotes?.trim() ? (
              <p className="mb-0 mt-2 text-[0.98rem] leading-7 text-muted-foreground">
                {deckListNotes.trim()}
              </p>
            ) : null}
            {deckListFormat ? (
              <p className="mb-0 mt-2 text-sm font-semibold text-muted-foreground">
                {deckListFormat}
              </p>
            ) : null}
          </div>

        </div>

        <div className="pt-1">
          <DeckListViewDialog
            deckListName={deckListName || "Tournament Deck List"}
            rawList={rawList}
            sortedCards={sortedCards}
            triggerLabel="View Deck List Visual"
          />
        </div>
      </div>
    </Card>
  );
}
