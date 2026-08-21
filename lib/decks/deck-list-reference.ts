export type DeckListReferenceRecord = {
  deckId: string | null;
  id: string;
  name: string;
  userId: string;
};

export type DeckListReferenceInput = {
  linkedDeckId?: string | null;
  linkedDeckListId?: string | null;
  list: DeckListReferenceRecord | null;
  userId: string;
};

export type ResolvedDeckListReference = {
  deckId: string | null;
  deckListId: string | null;
  list: DeckListReferenceRecord | null;
};

function optionalId(value: string | null | undefined) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

export function resolveDeckListReference(
  input: DeckListReferenceInput
): ResolvedDeckListReference {
  const linkedDeckId = optionalId(input.linkedDeckId);
  const linkedDeckListId = optionalId(input.linkedDeckListId);

  if (!linkedDeckListId) {
    return {
      deckId: linkedDeckId,
      deckListId: null,
      list: null
    };
  }

  if (
    !input.list ||
    input.list.id !== linkedDeckListId ||
    input.list.userId !== input.userId
  ) {
    throw new Error("Deck List could not be found.");
  }

  if (linkedDeckId && input.list.deckId !== linkedDeckId) {
    throw new Error("Deck List does not belong to the supplied Deck Strategy.");
  }

  return {
    deckId: input.list.deckId,
    deckListId: input.list.id,
    list: input.list
  };
}
