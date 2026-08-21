import { getBattleLogSpriteDisplayName } from "@/lib/battle-log/display";
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
