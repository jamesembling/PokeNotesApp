import type { BattleLogSummary } from "@/types/index";

type LogsWindow = {
  hasMore: boolean;
  logs: BattleLogSummary[];
  nextWindowEndDate: string;
  windowEndDate: string;
  windowStartDate: string;
};

function isNewer(left: BattleLogSummary, right: BattleLogSummary) {
  return (
    left.date > right.date ||
    (left.date === right.date &&
      (left.importedAt > right.importedAt ||
        (left.importedAt === right.importedAt && left.id > right.id)))
  );
}

// Re-read through the viewed boundary even when an inserted/deleted row shifts pages.
export async function refreshLoadedLogsWindow(
  initial: LogsWindow,
  oldestViewed: BattleLogSummary | null,
  loadMore: (cursor: string) => Promise<LogsWindow>
): Promise<LogsWindow> {
  let current = initial;
  const logs = new Map(initial.logs.map((log) => [log.id, log]));
  const cursors = new Set<string>();
  while (
    oldestViewed &&
    current.hasMore &&
    (!current.logs.length || isNewer(current.logs[current.logs.length - 1], oldestViewed))
  ) {
    if (!current.nextWindowEndDate || cursors.has(current.nextWindowEndDate)) {
      throw new Error("Battle log pagination did not advance. Try refreshing again.");
    }
    cursors.add(current.nextWindowEndDate);
    current = await loadMore(current.nextWindowEndDate);
    current.logs.forEach((log) => logs.set(log.id, log));
  }
  return { ...current, logs: [...logs.values()], windowEndDate: initial.windowEndDate };
}
