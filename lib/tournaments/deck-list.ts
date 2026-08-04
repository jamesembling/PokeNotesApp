import { sortDeckListCards } from "@/lib/deck-lists/sort";
import { CANONICAL_DECK_LIST_SORT_VERSION } from "@/lib/deck-lists/version";
import { parseDeckList } from "@/lib/decks/deck-list-parse";
import { userFacingActionError } from "@/lib/server/action-errors";
import type { DeckCard } from "@/types/index";

export async function buildTournamentDeckList(input: {
  createId?: () => string;
  defaultCreatedBy: string;
  formData: FormData;
  now?: () => string;
  parseCards?: (rawList: string) => DeckCard[];
  sortCards?: (cards: DeckCard[]) => Promise<DeckCard[]>;
}) {
  const createId = input.createId ?? (() => crypto.randomUUID());
  const now = input.now ?? (() => new Date().toISOString());
  const parseCards = input.parseCards ?? parseDeckList;
  const sortCards = input.sortCards ?? sortDeckListCards;
  const name = String(input.formData.get("name") || "").trim();
  const rawList = String(input.formData.get("rawList") || "").trim();

  if (!name) {
    throw userFacingActionError("Enter a deck list name before saving.");
  }

  if (!rawList) {
    throw userFacingActionError("Paste the deck list before saving.");
  }

  const timestamp = now();

  try {
    const parsedCards = parseCards(rawList);
    const sortedCards = await sortCards(parsedCards);

    return {
      id: createId(),
      name,
      format: String(input.formData.get("format") || "").trim(),
      date: String(input.formData.get("date") || "").trim() || timestamp.slice(0, 10),
      createdBy:
        String(input.formData.get("createdBy") || "").trim() || input.defaultCreatedBy,
      notes: String(input.formData.get("notes") || "").trim(),
      rawList,
      parsedCards,
      sortedCards,
      sortedCardsVersion: CANONICAL_DECK_LIST_SORT_VERSION,
      createdAt: timestamp,
      updatedAt: timestamp
    };
  } catch (error) {
    if (error instanceof Error && error.name === "UserFacingActionError") {
      throw error;
    }

    throw userFacingActionError(
      "We couldn't apply the canonical deck ordering right now. Please try saving again in a moment."
    );
  }
}
