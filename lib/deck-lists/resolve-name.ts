import type { DeckListSelectionOption } from "@/types/index";

/**
 * Resolve a display name using the same composite identity as a persisted
 * reference. A missing strategy is intentionally an independent relational
 * lookup only; it never borrows a strategy-scoped legacy copy.
 */
export function resolveDeckListName(
  options: DeckListSelectionOption[],
  linkedDeckId: string | null | undefined,
  linkedDeckListId: string | null | undefined
) {
  const listId = String(linkedDeckListId || "").trim();
  if (!listId) {
    return undefined;
  }

  const strategyId = String(linkedDeckId || "").trim() || null;
  return options.find(
    (option) => option.id === listId && option.deckId === strategyId
  )?.name;
}
