import { revalidatePath } from "next/cache";

export type DeckWorkspaceInvalidation = {
  deckId?: string | null;
  deckIds?: string[];
  deckListId?: string | null;
  deckListIds?: string[];
  tournamentIds?: string[];
};

export function getDeckWorkspaceInvalidationPaths(input: DeckWorkspaceInvalidation = {}) {
  const paths = new Set([
    "/decks",
    "/logs",
    "/deck-lists",
    "/tournaments"
  ]);
  new Set([input.deckId, ...(input.deckIds ?? [])].filter((value): value is string => Boolean(value)))
    .forEach((deckId) => paths.add(`/decks/${deckId}`));

  const deckListIds = new Set(
    [input.deckListId, ...(input.deckListIds ?? [])].filter(
      (value): value is string => Boolean(value)
    )
  );
  deckListIds.forEach((deckListId) => paths.add(`/deck-lists/${deckListId}`));

  for (const tournamentId of input.tournamentIds ?? []) paths.add(`/tournaments/${tournamentId}`);
  return Array.from(paths);
}

export function revalidateDeckAndLogWorkspace(
  input: DeckWorkspaceInvalidation = {}
) {
  revalidatePath("/decks", "layout");
  revalidatePath("/logs", "layout");
  revalidatePath("/deck-lists", "layout");
  revalidatePath("/tournaments", "layout");

  new Set([input.deckId, ...(input.deckIds ?? [])].filter((value): value is string => Boolean(value)))
    .forEach((deckId) => revalidatePath(`/decks/${deckId}`, "page"));
  const deckListIds = new Set(
    [input.deckListId, ...(input.deckListIds ?? [])].filter(
      (value): value is string => Boolean(value)
    )
  );
  deckListIds.forEach((deckListId) => revalidatePath(`/deck-lists/${deckListId}`, "page"));
  for (const tournamentId of input.tournamentIds ?? []) {
    revalidatePath(`/tournaments/${tournamentId}`, "page");
  }
}
