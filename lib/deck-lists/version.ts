export const CANONICAL_DECK_LIST_SORT_VERSION = 2;

export function shouldRebuildDeckListVisualSort(args: {
  parsedCards: { length: number };
  sortedCardsVersion?: number;
}) {
  return (
    args.parsedCards.length > 0 &&
    args.sortedCardsVersion !== CANONICAL_DECK_LIST_SORT_VERSION
  );
}
