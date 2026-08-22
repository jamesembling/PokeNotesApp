"use client";

import Link from "next/link";
import { ArrowLeft, MoreVertical } from "lucide-react";
import { Button } from "@/components/shadcn/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from "@/components/shadcn/dropdown-menu";
import {
  LazyDeckEditorButton,
  type DeckEditorDeck
} from "@/components/ui/LazyDeckEditorButton";
import { DeckStrategyResourcesMenu } from "@/components/ui/DeckStrategyResourcesMenu";
import type { DeckList } from "@/types/index";

type DeckStrategyMobileMenuProps = {
  deck: DeckEditorDeck;
  deckLists: Array<Pick<DeckList, "date" | "format" | "id" | "name">>;
  defaultCreatedBy: string;
  defaultFormat: string;
};

export function DeckStrategyMobileMenu({
  deck,
  deckLists,
  defaultCreatedBy,
  defaultFormat
}: DeckStrategyMobileMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button aria-label="Deck actions" size="icon-lg" variant="ghost">
          <MoreVertical className="size-6" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 p-2">
        <LazyDeckEditorButton
          deck={deck}
          triggerLabel="Edit deck"
          triggerVariant="ghost"
        />
        <DeckStrategyResourcesMenu
          deckId={deck.id}
          deckLists={deckLists}
          defaultCreatedBy={defaultCreatedBy}
          defaultFormat={defaultFormat}
          triggerClassName="w-full justify-start"
        />
        <Button asChild className="w-full justify-start" variant="ghost">
          <Link href="/decks" prefetch={false}>
            <ArrowLeft className="size-4" />
            Back to decks
          </Link>
        </Button>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
