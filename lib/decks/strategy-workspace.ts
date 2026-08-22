import type { Deck, GoPreference } from "@/types/index";

export type EditableStrategyLane =
  | "gamePlan"
  | "benchPlan"
  | "tech"
  | "unsorted";

export type StrategyWorkspaceState = {
  goPreference: GoPreference;
  lanes: Record<EditableStrategyLane, string[]>;
};

type StrategyWorkspaceDeck = Pick<
  Deck,
  | "coreStrategy"
  | "generalNotes"
  | "goPreference"
  | "resourcePlan"
  | "setupGoals"
>;

export function parseStrategyNoteText(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function serializeStrategyNotes(notes: string[]) {
  return notes.map((note) => note.trim()).filter(Boolean).join("\n");
}

export function buildStrategyWorkspaceState(
  deck: StrategyWorkspaceDeck
): StrategyWorkspaceState {
  return {
    goPreference: deck.goPreference || "",
    lanes: {
      gamePlan: parseStrategyNoteText(deck.coreStrategy),
      benchPlan: deck.setupGoals.map((note) => note.trim()).filter(Boolean),
      tech: parseStrategyNoteText(deck.resourcePlan),
      unsorted: parseStrategyNoteText(deck.generalNotes)
    }
  };
}

export function moveStrategyNote(
  notes: string[],
  fromIndex: number,
  toIndex: number
) {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= notes.length ||
    toIndex >= notes.length
  ) {
    return notes;
  }

  const nextNotes = [...notes];
  const [movedNote] = nextNotes.splice(fromIndex, 1);
  nextNotes.splice(toIndex, 0, movedNote);
  return nextNotes;
}

