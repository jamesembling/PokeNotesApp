import { Card } from "@/components/ui/Card";
import { CopyDeckListButton } from "@/components/ui/CopyDeckListButton";
import { DeckListVisualGrid } from "@/components/ui/DeckListVisualGrid";
import type { DeckCard } from "@/types/index";

type TournamentDeckListPanelProps = {
  deckId?: string;
  deckListFormat?: string;
  deckListName?: string;
  deckListNotes?: string;
  rawList?: string;
  sortedCards?: DeckCard[];
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

export function TournamentDeckListPanel({
  deckId,
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
    <Card className="rounded-[24px] bg-[var(--bg-surface)] p-4 shadow-[var(--shadow-sm)] sm:p-5">
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="ui-eyebrow">Deck List</p>
            <h3 className="font-display m-0 text-[1.18rem] font-semibold tracking-[-0.03em] text-[var(--text-primary)]">
              {deckListName || "Tournament Deck List"}
            </h3>
            {deckListNotes?.trim() ? (
              <p className="mb-0 mt-2 text-[0.98rem] leading-7 text-[var(--text-muted)]">
                {deckListNotes.trim()}
              </p>
            ) : null}
            {!deckId && deckListFormat ? (
              <p className="mb-0 mt-2 text-sm font-semibold text-[var(--text-muted)]">
                {deckListFormat}
              </p>
            ) : null}
          </div>

          {deckId && hasVisualDeckList ? (
            <a
              className="ui-control-text inline-flex items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-2 text-[var(--text-secondary)] transition hover:bg-[var(--bg-surface-alt)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-page)]"
              href={`/decks/${deckId}`}
            >
              Jump to Deck
            </a>
          ) : null}
        </div>

        <details className="group pt-1">
          <summary className="ui-control-text flex cursor-pointer list-none items-center justify-between gap-4 px-0 py-3 text-[var(--color-brand)] [&::-webkit-details-marker]:hidden">
            <span>View Deck List Visual</span>
            <span className="text-[var(--text-muted)]">
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
              <p className="text-sm text-[var(--text-secondary)]">
                No parsed cards are available for this deck list yet.
              </p>
            )}
          </div>
        </details>
      </div>
    </Card>
  );
}
