"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { ChevronIcon } from "@/components/ui/icons";
import { SpriteStrip } from "@/components/ui/SpriteStrip";
import { useBodyScrollLock } from "@/lib/client/use-body-scroll-lock";
import type { DeckMatchup } from "@/types/index";

type DeckMatchupsDialogProps = {
  deckId: string;
  matchups: DeckMatchup[];
};

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date(date));
}

export function DeckMatchupsDialog({
  deckId,
  matchups
}: DeckMatchupsDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const orderedMatchups = useMemo(() => [...matchups].reverse(), [matchups]);

  useBodyScrollLock(isOpen);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <>
      <Button onClick={() => setIsOpen(true)} variant="secondary">
        View All Matchups
      </Button>

      {isOpen ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 overflow-x-hidden bg-[var(--bg-overlay)] p-4"
          onClick={() => setIsOpen(false)}
          role="dialog"
        >
          <div
            className="mx-auto flex max-h-[calc(100dvh-2rem)] w-full max-w-4xl min-w-0 flex-col overflow-hidden rounded-[28px] border border-[var(--border)] bg-[var(--bg-surface)] shadow-[var(--shadow-lg)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-4 border-b border-[var(--border)] px-6 py-5 lg:px-8">
              <div className="min-w-0 space-y-2">
                <p className="ui-eyebrow">Matchup Notes</p>
                <h2 className="text-[1.45rem] font-bold tracking-[-0.04em] text-[var(--text-primary)] sm:text-[1.8rem]">
                  All Matchups
                </h2>
                <p className="text-sm text-[var(--text-secondary)]">
                  {matchups.length} saved matchup{matchups.length === 1 ? "" : "s"} for this deck.
                </p>
              </div>

              <Button onClick={() => setIsOpen(false)} variant="secondary">
                Close
              </Button>
            </div>

            <div className="min-w-0 flex-1 touch-pan-y overflow-y-auto overflow-x-hidden overscroll-contain px-6 py-5 pr-8 [-webkit-overflow-scrolling:touch] [scrollbar-gutter:stable] lg:px-8 lg:pr-10">
              {orderedMatchups.length === 0 ? (
                <p className="text-sm text-[var(--text-secondary)]">
                  No matchups created yet for this deck.
                </p>
              ) : (
                <div className="flex min-w-0 flex-col gap-3">
                  {orderedMatchups.map((matchup) => (
                    <Link
                      className="group flex min-w-0 items-center justify-between gap-4 rounded-[20px] border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-4 transition hover:border-[var(--color-brand)] hover:bg-[var(--bg-surface-alt)]"
                      href={`/decks/${deckId}/matchups/${matchup.id}`}
                      key={matchup.id}
                      onClick={() => setIsOpen(false)}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <SpriteStrip
                          className="min-h-8 shrink-0"
                          maxVisible={2}
                          size="sm"
                          sprites={matchup.deckPokemon}
                        />
                        <div className="min-w-0 space-y-1">
                          <p className="truncate font-display text-[1.02rem] font-semibold tracking-[-0.025em] text-[var(--text-primary)]">
                            {matchup.deckName}
                          </p>
                          <p className="text-sm text-[var(--text-muted)]">
                            Updated {formatDate(matchup.updatedAt || matchup.createdAt)}
                          </p>
                        </div>
                      </div>

                      <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-[var(--color-brand)]">
                        Open
                        <ChevronIcon className="h-4 w-4 -rotate-90" />
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
