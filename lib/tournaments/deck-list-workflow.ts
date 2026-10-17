import { getBattleLogSpriteDisplayName } from "@/lib/battle-log/display";
import { sortDeckListCards } from "@/lib/deck-lists/sort";
import { CANONICAL_DECK_LIST_SORT_VERSION } from "@/lib/deck-lists/version";
import { interpretDeckList } from "@/lib/decks/deck-list-parse";
import { requireViewedVersion } from "@/lib/server/viewed-version";
import { userFacingActionError } from "@/lib/server/action-errors";

type TournamentDeckListReference = {
  linkedDeckId?: string | null;
  linkedDeckListId?: string | null;
};

type TournamentDeckListSource = TournamentDeckListReference & {
  deckSprites: string[];
  format: string;
};

type TournamentDeckListSaveResult = {
  deckId: string | null;
  deckListId: string;
};

export type TournamentDeckListSaveAdapter = {
  attachDeckList(input: {
    deckName: string;
    deckListId: string;
    deckSprites: string[];
    linkedDeckId: null;
    tournamentId: string;
    userId: string;
  }): Promise<void>;
  loadTournament(userId: string, tournamentId: string): Promise<TournamentDeckListSource | null>;
  saveStandaloneDeckList(formData: FormData): Promise<TournamentDeckListSaveResult>;
};

export type TournamentDeckListAtomicAdapter = {
  loadTournament(userId: string, tournamentId: string): Promise<TournamentDeckListSource & {
    updatedAt: string;
  } | null>;
  loadSourceDeckList?(
    userId: string,
    deckListId: string,
    deckId: string | null
  ): Promise<{
    id: string;
    storage?: "legacy" | "relational";
    deckId?: string | null;
    name: string;
    format: string;
    date: string;
    createdBy: string;
    notes: string;
    rawList: string;
    parsedCards: unknown[];
    sortedCards: unknown[];
    sortedCardsVersion?: number;
    updatedAt: string;
  } | null>;
  commit(input: {
    tournamentId: string;
    requestId: string;
    expectedTournamentUpdatedAt: string;
    deckName: string;
    deckSprites: string[];
    payload: Record<string, unknown>;
    sourceDeckId: string | null;
    sourceDeckListId: string | null;
    createDeckList: boolean;
    allowReplace: boolean;
  }): Promise<{ deckListId: string; status: "committed" | "idempotent" }>;
};

export async function saveTournamentDeckListAtomically(input: {
  adapter: TournamentDeckListAtomicAdapter;
  formData: FormData;
  userId: string;
  defaultCreatedBy: string;
}) {
  const tournamentId = String(input.formData.get("tournamentId") || "").trim();
  if (!tournamentId) {
    throw userFacingActionError("Tournament id is required.");
  }

  const expectedUpdatedAt = requireViewedVersion(input.formData.get("expectedUpdatedAt"), "Tournament");
  const tournament = await input.adapter.loadTournament(input.userId, tournamentId);
  if (!tournament) {
    throw userFacingActionError("Tournament could not be found.");
  }
  const allowReplace = String(input.formData.get("replaceDeckList") || "").trim() === "true";

  const deckSprites = Array.from(
    new Set(tournament.deckSprites.map((sprite) => String(sprite || "").trim()).filter(Boolean))
  ).slice(0, 3);
  const deckName = getBattleLogSpriteDisplayName(deckSprites, " / ");
  if (!deckName || deckSprites.length === 0) {
    throw userFacingActionError("Choose tournament sprites before adding a deck list.");
  }

  const requestId = String(input.formData.get("creationKey") || "").trim() || crypto.randomUUID();
  const sourceDeckListId = String(input.formData.get("sourceDeckListId") || "").trim() || null;
  const sourceDeckId = String(input.formData.get("sourceDeckId") || "").trim() || null;
  if (sourceDeckListId) {
    if (!input.adapter.loadSourceDeckList) {
      throw userFacingActionError("The source Deck List could not be loaded safely.");
    }
    const source = await input.adapter.loadSourceDeckList(
      input.userId,
      sourceDeckListId,
      sourceDeckId
    );
    if (!source || source.storage === "legacy") {
      throw userFacingActionError("Only a first-class Deck List can be captured into a Tournament.");
    }
    return input.adapter.commit({
      tournamentId,
      requestId,
      expectedTournamentUpdatedAt: expectedUpdatedAt,
      deckName,
      deckSprites,
      payload: {
        sourceDeckId,
        sourceDeckListId,
        associateStrategy: String(input.formData.get("associateStrategy") || "") === "true",
        parsedCards: source.parsedCards,
        sortedCards: source.sortedCards,
        sortedCardsVersion: source.sortedCardsVersion
      },
      sourceDeckId,
      sourceDeckListId,
      createDeckList: false,
      allowReplace
    });
  }

  const rawList = String(input.formData.get("rawList") || "").trim();
  const name = String(input.formData.get("name") || "").trim() || deckName;
  if (!name) {
    throw userFacingActionError("Enter a deck list name before saving.");
  }
  if (!rawList) {
    throw userFacingActionError("Paste the deck list before saving.");
  }

  let parsedCards;
  let sortedCards;
  try {
    parsedCards = interpretDeckList(rawList).cards;
    sortedCards = await sortDeckListCards(parsedCards);
  } catch {
    throw userFacingActionError(
      "We couldn't apply the canonical deck ordering right now. Please try saving again in a moment."
    );
  }

  const timestamp = new Date().toISOString();
  const payload = {
    id: requestId,
    creationKey: requestId,
    name,
    format: String(input.formData.get("format") || "").trim() || tournament.format,
    date: String(input.formData.get("date") || "").trim() || timestamp.slice(0, 10),
    createdBy: String(input.formData.get("createdBy") || "").trim() || input.defaultCreatedBy,
    notes: String(input.formData.get("notes") || ""),
    rawList,
    parsedCards,
    sortedCards,
    sortedCardsVersion: CANONICAL_DECK_LIST_SORT_VERSION,
    createdAt: timestamp,
    updatedAt: timestamp,
    associateStrategy: false
  };

  return input.adapter.commit({
    tournamentId,
    requestId,
    expectedTournamentUpdatedAt: expectedUpdatedAt,
    deckName,
    deckSprites,
    payload,
    sourceDeckId: null,
    sourceDeckListId: null,
    createDeckList: true,
    allowReplace
  });
}

export async function resolveTournamentDeckListForDisplay<TDeckList>(input: {
  loadDeckList: (
    userId: string,
    deckListId: string,
    deckId: string | null
  ) => Promise<TDeckList | null>;
  tournament: TournamentDeckListReference;
  userId: string;
}) {
  const deckListId = String(input.tournament.linkedDeckListId || "").trim();
  if (!deckListId) {
    return null;
  }

  return input.loadDeckList(
    input.userId,
    deckListId,
    String(input.tournament.linkedDeckId || "").trim() || null
  );
}

export async function saveTournamentDeckListForTournament(input: {
  adapter: TournamentDeckListSaveAdapter;
  formData: FormData;
  userId: string;
}): Promise<TournamentDeckListSaveResult> {
  const tournamentId = String(input.formData.get("tournamentId") || "").trim();
  if (!tournamentId) {
    throw userFacingActionError("Tournament id is required.");
  }

  const tournament = await input.adapter.loadTournament(input.userId, tournamentId);
  if (!tournament) {
    throw userFacingActionError("Tournament could not be found.");
  }
  if (String(tournament.linkedDeckListId || "").trim()) {
    throw userFacingActionError("This Tournament already has a Deck List.");
  }

  const deckSprites = Array.from(
    new Set(tournament.deckSprites.map((sprite) => String(sprite || "").trim()).filter(Boolean))
  ).slice(0, 3);
  const deckName = getBattleLogSpriteDisplayName(deckSprites, " / ");
  if (!deckName || deckSprites.length === 0) {
    throw userFacingActionError("Choose tournament sprites before adding a deck list.");
  }

  const deckListFormData = new FormData();
  for (const [key, value] of input.formData.entries()) {
    deckListFormData.append(key, value);
  }
  deckListFormData.set("deckId", "");
  if (!String(deckListFormData.get("name") || "").trim()) {
    deckListFormData.set("name", deckName);
  }
  if (!String(deckListFormData.get("format") || "").trim()) {
    deckListFormData.set("format", tournament.format);
  }

  const result = await input.adapter.saveStandaloneDeckList(deckListFormData);
  if (result.deckId !== null) {
    throw new Error("Tournament Deck List creation unexpectedly returned a Deck Strategy.");
  }

  await input.adapter.attachDeckList({
    deckName,
    deckListId: result.deckListId,
    deckSprites,
    linkedDeckId: null,
    tournamentId,
    userId: input.userId
  });

  return result;
}
