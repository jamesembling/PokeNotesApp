import { revalidatePath } from "next/cache";

export type DeckWorkspaceInvalidation = {
  deckId?: string | null;
  deckListId?: string | null;
  deckListIds?: string[];
  tournamentIds?: string[];
};

export function revalidateDeckAndLogWorkspace(
  input: DeckWorkspaceInvalidation = {}
) {
  revalidatePath("/decks", "layout");
  revalidatePath("/logs", "layout");
  revalidatePath("/deck-lists", "layout");
  revalidatePath("/tournaments", "layout");

  if (input.deckId) {
    revalidatePath(`/decks/${input.deckId}`, "page");
  }

  const deckListIds = new Set(
    [input.deckListId, ...(input.deckListIds ?? [])].filter(
      (value): value is string => Boolean(value)
    )
  );
  deckListIds.forEach((deckListId) => {
    revalidatePath(`/deck-lists/${deckListId}`, "page");
  });

  for (const tournamentId of input.tournamentIds ?? []) {
    revalidatePath(`/tournaments/${tournamentId}`, "page");
  }
}
