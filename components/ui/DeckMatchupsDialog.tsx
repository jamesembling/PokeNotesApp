"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/shadcn/button";
import {
  Dialog,
  DialogTrigger
} from "@/components/shadcn/dialog";
import { AppDialogContent, AppDialogHeader } from "@/components/ui/AppDialog";
import { ChevronIcon } from "@/components/ui/icons";
import { deckCardRolloverClassName } from "@/components/ui/rolloverStyles";
import { SpriteStrip } from "@/components/ui/SpriteStrip";
import type { DeckMatchup } from "@/types/index";

type DeckMatchupsDialogProps = {
  deckId: string;
  matchups: DeckMatchup[];
};

const MATCHUP_DATE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric"
});

function formatDate(date: string) {
  return MATCHUP_DATE_FORMATTER.format(new Date(date));
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

      <AppDialogContent
        size="lg"
        showMobileCloseButton
        showCloseButton={false}
      >
            <AppDialogHeader
              description={`${matchups.length} saved matchup${matchups.length === 1 ? "" : "s"} for this deck.`}
              descriptionClassName="text-foreground"
              descriptionHidden={false}
              eyebrow="Matchup Notes"
              title="All Matchups"
            />

            <div className="min-w-0 flex-1 touch-pan-y overflow-y-auto overflow-x-hidden overscroll-contain px-6 py-5 pr-8 [-webkit-overflow-scrolling:touch] [scrollbar-gutter:stable] lg:px-8 lg:pr-10">
              {orderedMatchups.length === 0 ? (
                <p className="text-sm text-foreground">
                  No matchups created yet for this deck.
                </p>
              ) : (
                <div className="flex min-w-0 flex-col gap-3">
                  {orderedMatchups.map((matchup) => (
                    <Link
                      className={`group flex min-w-0 items-center justify-between gap-4 rounded-lg border border-border bg-card p-4 ${deckCardRolloverClassName}`}
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
                        <ChevronIcon className="size-4 -rotate-90" />
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
      </AppDialogContent>
    </Dialog>
  );
}
