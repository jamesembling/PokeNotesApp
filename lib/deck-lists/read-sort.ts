import { sortDeckListCardsLocally } from "@/lib/deck-lists/local-sort";
import { shouldRebuildDeckListVisualSort } from "@/lib/deck-lists/version";
import type { DeckCard, DeckList } from "@/types/index";

export function getReadSortedDeckCards(
  deckList: Pick<DeckList, "parsedCards" | "sortedCards" | "sortedCardsVersion">
): DeckCard[] {
  if (!shouldRebuildDeckListVisualSort(deckList) && deckList.sortedCards.length > 0) {
    return deckList.sortedCards;
  }

  return sortDeckListCardsLocally(
    deckList.parsedCards.length > 0 ? deckList.parsedCards : deckList.sortedCards
  );
}
