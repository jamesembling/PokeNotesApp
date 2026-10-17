"use client";

import { MoreHorizontalIcon } from "lucide-react";
import { AppSelect } from "@/components/shadcn/app-select";
import { Button } from "@/components/shadcn/button";
import { Card } from "@/components/shadcn/card";
import { Checkbox } from "@/components/shadcn/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/shadcn/dropdown-menu";
import { TrashIcon } from "@/components/ui/icons";
import { makeDeckListSelectionKey } from "@/lib/log-import/deck-list-selection";
import type { DeckListSelectionOption, DeckSelectionOption } from "@/types/index";

export type LogsManagementDockProps = {
  allSelected: boolean;
  canApplyDeckList: boolean;
  canDeleteSelected: boolean;
  deckOptionsError: string;
  isLoadingDeckOptions: boolean;
  isMutating: boolean;
  onApplyDeckList: () => void;
  onDeleteSelected: () => void;
  onSelectDeck: (deckId: string) => void;
  onSelectDeckList: (selectionKey: string) => void;
  onToggleSelectAll: () => void;
  selectedCount: number;
  selectedDeckId: string;
  selectedDeckListSelectionKey: string;
  userDecks: DeckSelectionOption[];
  userDeckLists: DeckListSelectionOption[];
  visibleLogCount: number;
};

export function LogsManagementDock({
  allSelected,
  canApplyDeckList,
  canDeleteSelected,
  deckOptionsError,
  isLoadingDeckOptions,
  isMutating,
  onApplyDeckList,
  onDeleteSelected,
  onSelectDeck,
  onSelectDeckList,
  onToggleSelectAll,
  selectedCount,
  selectedDeckId,
  selectedDeckListSelectionKey,
  userDecks,
  userDeckLists,
  visibleLogCount
}: LogsManagementDockProps) {
  const availableDeckLists = userDeckLists;

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 sm:inset-x-6">
      <Card
        className="mx-auto grid max-h-[calc(100dvh-1.5rem)] max-w-6xl gap-3 overflow-y-auto bg-popover p-3 shadow-[var(--shadow-lg)] md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center"
        size="sm"
      >
        <div className="flex items-center justify-between gap-3 md:justify-start">
          <div className="min-w-[5.5rem]">
            <p className="ui-eyebrow">Selected</p>
            <p className="mt-0.5 font-display text-[1.55rem] font-semibold leading-none tracking-[-0.04em] text-card-foreground">
              {selectedCount}
              <span className="ml-1 text-sm font-medium tracking-normal text-muted-foreground">
                / {visibleLogCount}
              </span>
            </p>
          </div>

          {visibleLogCount > 0 ? (
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-semibold text-card-foreground">
              <Checkbox
                checked={allSelected}
                className="cursor-pointer rounded border-border bg-card"
                onCheckedChange={onToggleSelectAll}
              />
              <span>{allSelected ? "Clear" : "All"}</span>
            </label>
          ) : null}
        </div>

        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {deckOptionsError ? (
            <p className="text-sm font-medium text-loss-strong md:col-span-2">{deckOptionsError}</p>
          ) : null}
          <AppSelect
            aria-label="Deck strategy for selected logs"
            className="min-h-11 bg-background px-3 py-2"
            onChange={onSelectDeck}
            options={[
              {
                label: isLoadingDeckOptions ? "Loading deck strategies..." : "Deck strategy",
                value: ""
              },
              ...userDecks.map((deck) => ({
                label: deck.deckName,
                value: deck.id
              }))
            ]}
            value={selectedDeckId}
          />

          <AppSelect
            aria-label="Deck list for selected logs"
            className="min-h-11 bg-background px-3 py-2"
            disabled={availableDeckLists.length === 0}
            onChange={onSelectDeckList}
            options={[
              {
                label: availableDeckLists.length > 0 ? "Deck list" : "No saved deck lists",
                value: ""
              },
              ...availableDeckLists.map((deckList) => ({
                label: deckList.name,
                value:
                  deckList.selectionKey ??
                  makeDeckListSelectionKey({
                    deckId: deckList.deckId,
                    deckListId: deckList.id
                  })
              }))
            ]}
            value={selectedDeckListSelectionKey}
          />
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-2 md:flex md:justify-end">
          <Button className="min-h-11" disabled={!canApplyDeckList} onClick={onApplyDeckList}>
            {isMutating ? "Applying..." : "Apply"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label="Open selected log actions"
                className="min-h-11 min-w-11"
                disabled={!canDeleteSelected}
                size="icon-lg"
                variant="outline"
              >
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44" forceMount>
              <DropdownMenuGroup>
                <DropdownMenuItem
                  className="text-loss-strong focus:text-loss-strong"
                  onClick={onDeleteSelected}
                  variant="destructive"
                >
                  <TrashIcon />
                  Delete selected
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </Card>
    </div>
  );
}
