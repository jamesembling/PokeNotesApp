import type { LogSection } from "@/types/index";

export type ReplaySourceActor = "self" | "opponent";

export type ReplaySourceAction = {
  actor: ReplaySourceActor;
  turn: number;
  sourceSectionIndex: number;
  sourceTitle: string;
  details: string[];
  legacyIndex: number | null;
};

export function flattenReplaySourceActions(
  sections: LogSection[],
  selfPlayerName: string,
  legacyIndices: Array<number | null> = [],
): ReplaySourceAction[] {
  const turnCounts = new Map<string, number>();
  let actionIndex = 0;

  return sections.flatMap((section, sourceSectionIndex) => {
    const isSetup = section.player === "";
    const turn = isSetup
      ? 0
      : (turnCounts.get(section.player) ?? 0) + 1;

    if (!isSetup) turnCounts.set(section.player, turn);

    return section.actions.map((action) => {
      const actor = isSetup
        ? action.title.startsWith(selfPlayerName)
          ? "self"
          : "opponent"
        : section.player === selfPlayerName
          ? "self"
          : "opponent";
      const sourceAction: ReplaySourceAction = {
        actor,
        turn,
        sourceSectionIndex,
        sourceTitle: action.title,
        details: [...action.details],
        legacyIndex: legacyIndices[actionIndex] ?? null,
      };
      actionIndex += 1;
      return sourceAction;
    });
  });
}
