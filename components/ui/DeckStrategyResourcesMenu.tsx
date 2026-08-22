"use client";

import { Library } from "lucide-react";
import { Button } from "@/components/shadcn/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger
} from "@/components/shadcn/popover";
import { DeckLinkedLogsDialog } from "@/components/ui/DeckLinkedLogsDialog";
import { LazyDeckListEditorButton } from "@/components/ui/LazyDeckListEditorButton";
import { LazyDeckListViewButton } from "@/components/ui/LazyDeckListViewButton";
import type { DeckList } from "@/types/index";

type DeckListRow = Pick<DeckList, "date" | "format" | "id" | "name">;

type DeckStrategyResourcesMenuProps = {
  deckId: string;
  deckLists: DeckListRow[];
  defaultCreatedBy: string;
  defaultFormat: string;
  triggerClassName?: string;
};

export function DeckStrategyResourcesMenu({
  deckId,
  deckLists,
  defaultCreatedBy,
  defaultFormat,
  triggerClassName
}: DeckStrategyResourcesMenuProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button className={triggerClassName} variant="outline">
          <Library className="size-4" />
          Related records
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-2rem))] p-3">
        <PopoverHeader>
          <PopoverTitle>Related records</PopoverTitle>
          <PopoverDescription>
            Open this strategy&apos;s Deck Lists and linked Battle Logs.
          </PopoverDescription>
        </PopoverHeader>

        <div className="mt-1 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-card-foreground">Deck Lists</p>
            <LazyDeckListEditorButton
              deckId={deckId}
              defaultCreatedBy={defaultCreatedBy}
              defaultFormat={defaultFormat}
              triggerClassName="h-8"
              triggerLabel="Add list"
              triggerSize="sm"
              triggerVariant="ghost"
            />
          </div>

          {deckLists.length === 0 ? (
            <p className="rounded-lg bg-muted px-3 py-3 text-sm text-muted-foreground">
              No Deck Lists are associated with this strategy.
            </p>
          ) : (
            <div className="divide-y divide-border rounded-lg border border-border">
              {deckLists.map((deckList) => (
                <div className="flex items-center gap-2 p-2" key={deckList.id}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-card-foreground">
                      {deckList.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[deckList.format, deckList.date].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <LazyDeckListEditorButton
                    deckId={deckId}
                    deckListId={deckList.id}
                    defaultCreatedBy={defaultCreatedBy}
                    defaultFormat={defaultFormat}
                    triggerLabel="Edit"
                    triggerSize="sm"
                    triggerVariant="ghost"
                  />
                  <LazyDeckListViewButton
                    deckId={deckId}
                    deckListId={deckList.id}
                    triggerLabel="View"
                    triggerSize="sm"
                    triggerVariant="ghost"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-1 border-t border-border pt-3">
          <DeckLinkedLogsDialog deckId={deckId} />
        </div>
      </PopoverContent>
    </Popover>
  );
}
