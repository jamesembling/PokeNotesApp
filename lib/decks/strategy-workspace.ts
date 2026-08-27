import type { Deck, GoPreference } from "@/types/index";

export type EditableStrategyLane = "gamePlan" | "benchPlan" | "tech" | "unsorted";

export type StrategyWorkspaceState = {
  goPreference: GoPreference;
  lanes: Record<EditableStrategyLane, string[]>;
};

export type MatchupPhase = "earlyGame" | "midGame" | "lateGame";

export type MatchupPlanState = {
  phases: Record<MatchupPhase, string[]>;
  strategyNotes: string[];
};

const MATCHUP_PLAN_MARKER = "__POKENOTES_MATCHUP_PLAN_V1__";
const MATCHUP_PLAN_PREFIX = `${MATCHUP_PLAN_MARKER}\n`;

type StrategyWorkspaceDeck = Pick<
  Deck,
  "coreStrategy" | "generalNotes" | "goPreference" | "resourcePlan" | "setupGoals"
>;

export function parseStrategyNoteText(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function serializeStrategyNotes(notes: string[]) {
  return notes
    .map((note) => note.trim())
    .filter(Boolean)
    .join("\n");
}

function normalizeNotes(value: unknown) {
  return Array.isArray(value)
    ? value
        .filter((note): note is string => typeof note === "string")
        .map((note) => note.trim())
        .filter(Boolean)
    : [];
}

export function parseMatchupPlan(value: string): MatchupPlanState {
  const emptyPhases: MatchupPlanState["phases"] = {
    earlyGame: [],
    midGame: [],
    lateGame: []
  };

  const encodedPlan = value.startsWith(MATCHUP_PLAN_PREFIX)
    ? value.slice(MATCHUP_PLAN_PREFIX.length)
    : value.startsWith(`${MATCHUP_PLAN_MARKER}\r\n`)
      ? value.slice(MATCHUP_PLAN_MARKER.length + 2)
      : null;

  if (encodedPlan === null) {
    return {
      phases: emptyPhases,
      strategyNotes: parseStrategyNoteText(value)
    };
  }

  try {
    const parsed = JSON.parse(encodedPlan) as {
      phases?: Partial<Record<MatchupPhase, unknown>>;
      strategyNotes?: unknown;
    };

    return {
      phases: {
        earlyGame: normalizeNotes(parsed.phases?.earlyGame),
        midGame: normalizeNotes(parsed.phases?.midGame),
        lateGame: normalizeNotes(parsed.phases?.lateGame)
      },
      strategyNotes: normalizeNotes(parsed.strategyNotes)
    };
  } catch {
    return {
      phases: emptyPhases,
      strategyNotes: parseStrategyNoteText(value)
    };
  }
}

export function serializeMatchupPlan(state: MatchupPlanState) {
  const normalizedState: MatchupPlanState = {
    phases: {
      earlyGame: normalizeNotes(state.phases.earlyGame),
      midGame: normalizeNotes(state.phases.midGame),
      lateGame: normalizeNotes(state.phases.lateGame)
    },
    strategyNotes: normalizeNotes(state.strategyNotes)
  };
  const hasPhaseNotes = Object.values(normalizedState.phases).some((notes) => notes.length > 0);

  if (!hasPhaseNotes) {
    return serializeStrategyNotes(normalizedState.strategyNotes);
  }

  return `${MATCHUP_PLAN_PREFIX}${JSON.stringify(normalizedState)}`;
}

export function moveStrategyNoteBetweenLanes(
  lanes: Record<MatchupPhase, string[]>,
  fromLane: MatchupPhase,
  fromIndex: number,
  toLane: MatchupPhase,
  toIndex: number
) {
  const source = lanes[fromLane];
  const target = lanes[toLane];

  if (fromIndex < 0 || fromIndex >= source.length || toIndex < 0 || toIndex > target.length) {
    return lanes;
  }

  if (fromLane === toLane) {
    const boundedIndex = Math.min(toIndex, source.length - 1);
    return {
      ...lanes,
      [fromLane]: moveStrategyNote(source, fromIndex, boundedIndex)
    };
  }

  const nextSource = [...source];
  const [movedNote] = nextSource.splice(fromIndex, 1);
  const nextTarget = [...target];
  nextTarget.splice(toIndex, 0, movedNote);

  return {
    ...lanes,
    [fromLane]: nextSource,
    [toLane]: nextTarget
  };
}

export function buildStrategyWorkspaceState(deck: StrategyWorkspaceDeck): StrategyWorkspaceState {
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

export function moveStrategyNote(notes: string[], fromIndex: number, toIndex: number) {
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
