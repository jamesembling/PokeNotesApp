"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/shadcn/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger
} from "@/components/shadcn/dialog";
import { ChevronIcon } from "@/components/ui/icons";
import { SpriteStrip } from "@/components/ui/SpriteStrip";
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

  return (
    <Dialog onOpenChange={setIsOpen} open={isOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">View All Matchups</Button>
      </DialogTrigger>

      <DialogContent
        className="flex max-h-[calc(100dvh-2rem)] max-w-4xl min-w-0 flex-col overflow-hidden rounded-[28px] border border-border bg-card p-0 shadow-[var(--shadow-lg)] sm:max-w-4xl"
        showCloseButton={false}
      >
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-4 border-b border-border px-6 py-5 lg:px-8">
              <div className="min-w-0 space-y-2">
                <p className="ui-eyebrow">Matchup Notes</p>
                <DialogTitle className="text-[1.45rem] font-bold tracking-[-0.04em] text-card-foreground sm:text-[1.8rem]">
                  All Matchups
                </DialogTitle>
                <DialogDescription className="text-sm text-foreground">
                  {matchups.length} saved matchup{matchups.length === 1 ? "" : "s"} for this deck.
                </DialogDescription>
              </div>

              <Button onClick={() => setIsOpen(false)} variant="outline">
                Close
              </Button>
            </div>

            <div className="min-w-0 flex-1 touch-pan-y overflow-y-auto overflow-x-hidden overscroll-contain px-6 py-5 pr-8 [-webkit-overflow-scrolling:touch] [scrollbar-gutter:stable] lg:px-8 lg:pr-10">
              {orderedMatchups.length === 0 ? (
                <p className="text-sm text-foreground">
                  No matchups created yet for this deck.
                </p>
              ) : (
                <div className="flex min-w-0 flex-col gap-3">
                  {orderedMatchups.map((matchup) => (
                    <Link
                      className="group flex min-w-0 items-center justify-between gap-4 rounded-[20px] border border-border bg-card px-4 py-4 transition hover:border-ring hover:bg-muted"
                      href={`/decks/${deckId}/matchups/${matchup.id}`}
                      key={matchup.id}
                      onClick={() => setIsOpen(false)}
                      prefetch={false}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <SpriteStrip
                          className="min-h-8 shrink-0"
                          maxVisible={2}
                          size="sm"
                          sprites={matchup.deckPokemon}
                        />
                        <div className="min-w-0 space-y-1">
                          <p className="truncate font-display text-[1.02rem] font-semibold tracking-[-0.025em] text-card-foreground">
                            {matchup.deckName}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Updated {formatDate(matchup.updatedAt || matchup.createdAt)}
                          </p>
                        </div>
                      </div>

                      <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-primary">
                        Open
                        <ChevronIcon className="h-4 w-4 -rotate-90" />
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
      </DialogContent>
    </Dialog>
  );
}
