import type { DeckListSelectionOption } from "@/types/index";

export type DeckListSelectionIdentity = {
  deckId: string | null;
  deckListId: string;
};

export type DeckListSelectionState = {
  deckId: string;
  deckListId: string;
  selectionKey: string;
};

export function makeDeckListSelectionKey(
  identity: DeckListSelectionIdentity
): string {
  return JSON.stringify([identity.deckId, identity.deckListId]);
}

export function parseDeckListSelectionKey(
  selectionKey: string
): DeckListSelectionIdentity | null {
  if (!selectionKey) {
    return null;
  }

  try {
    const value: unknown = JSON.parse(selectionKey);
    if (!Array.isArray(value) || value.length !== 2) {
      return null;
    }

    const [deckId, deckListId] = value;
    if ((deckId !== null && typeof deckId !== "string") || typeof deckListId !== "string") {
      return null;
    }

    const normalizedDeckListId = deckListId.trim();
    return normalizedDeckListId
      ? { deckId, deckListId: normalizedDeckListId }
      : null;
  } catch {
    return null;
  }
}

export function getDeckListSelectionKey(option: DeckListSelectionOption): string {
  return option.selectionKey ?? makeDeckListSelectionKey({
    deckId: option.deckId,
    deckListId: option.id
  });
}

function findList(
  options: DeckListSelectionOption[],
  selectionKey: string
): DeckListSelectionOption | undefined {
  const exact = options.find((option) => getDeckListSelectionKey(option) === selectionKey);
  if (exact || !selectionKey) {
    return exact;
  }

  // Keep legacy bare-ID callers working only while that ID is unambiguous.
  // Duplicate IDs must be selected by their composite strategy/list key.
  const bareMatches = options.filter((option) => option.id === selectionKey);
  return bareMatches.length === 1 ? bareMatches[0] : undefined;
}

export function selectDeckList(
  current: DeckListSelectionState,
  nextSelectionKey: string,
  options: DeckListSelectionOption[]
): DeckListSelectionState {
  if (!nextSelectionKey) {
    return { ...current, deckListId: "", selectionKey: "" };
  }

  const option = findList(options, nextSelectionKey);
  if (!option) {
    return { ...current, deckListId: "", selectionKey: "" };
  }

  return {
    deckId: option.deckId ?? "",
    deckListId: option.id,
    selectionKey: getDeckListSelectionKey(option)
  };
}

export function selectDeck(
  current: DeckListSelectionState,
  nextDeckId: string,
  options: DeckListSelectionOption[]
): DeckListSelectionState {
  if (!nextDeckId) {
    const currentList = findList(options, current.selectionKey || current.deckListId);
    return {
      deckId: "",
      deckListId: currentList?.deckId === null ? currentList.id : "",
      selectionKey: currentList?.deckId === null ? getDeckListSelectionKey(currentList) : ""
    };
  }

  const currentList = findList(options, current.selectionKey || current.deckListId);
  if (currentList && currentList.deckId !== nextDeckId) {
    return { deckId: nextDeckId, deckListId: "", selectionKey: "" };
  }

  return { ...current, deckId: nextDeckId };
}
