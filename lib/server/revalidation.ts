import { revalidatePath } from "next/cache";

export type DeckWorkspaceInvalidation = {
  deckId?: string | null;
  deckIds?: string[];
  deckListId?: string | null;
  deckListIds?: string[];
  tournamentIds?: string[];
};

export function getTournamentDeckListInvalidation(input: {
  previous?: {
    linkedDeckId?: string | null;
    linkedDeckListId?: string | null;
  } | null;
  sourceDeckId?: string | null;
  deckListId: string;
  tournamentId: string;
}): DeckWorkspaceInvalidation {
  return {
    deckIds: [input.previous?.linkedDeckId ?? "", input.sourceDeckId ?? ""],
    deckListIds: [input.previous?.linkedDeckListId ?? "", input.deckListId],
    tournamentIds: [input.tournamentId]
  };
}

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
  applyDeckWorkspaceInvalidation(input, revalidatePath);
}

export function applyDeckWorkspaceInvalidation(
  input: DeckWorkspaceInvalidation,
  invalidate: (path: string, type: "layout" | "page") => void
) {
  invalidate("/decks", "layout");
  invalidate("/logs", "layout");
  invalidate("/deck-lists", "layout");
  invalidate("/tournaments", "layout");
  new Set([input.deckId, ...(input.deckIds ?? [])].filter((value): value is string => Boolean(value)))
    .forEach((deckId) => invalidate(`/decks/${deckId}`, "page"));
  new Set([input.deckListId, ...(input.deckListIds ?? [])].filter((value): value is string => Boolean(value)))
    .forEach((deckListId) => invalidate(`/deck-lists/${deckListId}`, "page"));
  for (const tournamentId of input.tournamentIds ?? []) invalidate(`/tournaments/${tournamentId}`, "page");
}
