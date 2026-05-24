import { DeckListViewDialog } from "@/components/ui/DeckListViewDialog";
import type { DeckCard } from "@/types/index";

type LinkedDeckListDialogProps = {
  deckId?: string;
  deckListName: string;
  rawList?: string;
  sortedCards: DeckCard[];
};

export function LinkedDeckListDialog({
  deckListName,
  rawList,
  sortedCards
}: LinkedDeckListDialogProps) {
  return (
    <DeckListViewDialog
      deckListName={deckListName}
      rawList={rawList}
      sortedCards={sortedCards}
      triggerLabel="View Deck"
    />
  );
}
