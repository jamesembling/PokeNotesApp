import { Card } from "@/components/ui/Card";
import { DeckLinkedLogsDialog } from "@/components/ui/DeckLinkedLogsDialog";
import { LogRow } from "@/components/ui/LogRow";
import { StatCard } from "@/components/ui/StatCard";
import { getBattleLogSummaryStats } from "@/lib/db/logs";
import type { BattleLogSummary, Deck } from "@/types/index";

function attachLinkedDeckListNames(logs: BattleLogSummary[], deck: Deck) {
  return logs.map((log) => {
    if (log.linkedDeckId !== deck.id || !log.linkedDeckListId) {
      return log;
    }

    const linkedDeckList = deck.deckLists.find((deckList) => deckList.id === log.linkedDeckListId);
    if (!linkedDeckList?.name) {
      return log;
    }

    return {
      ...log,
      linkedDeckListName: linkedDeckList.name
    };
  });
}

export function DeckRelatedLogsSectionFallback() {
  return (
    <Card className="space-y-5">
      <div className="space-y-2">
        <div className="space-y-2">
          <p className="ui-eyebrow">Battle Logs</p>
          <p className="text-sm text-[var(--text-secondary)]">
            Loading recent battle logs linked to this strategy.
          </p>
        </div>
      </div>
      <div className="space-y-3">
        <div className="h-24 rounded-[20px] border border-[var(--border)] bg-[var(--bg-surface-alt)]" />
        <div className="h-24 rounded-[20px] border border-[var(--border)] bg-[var(--bg-surface-alt)]" />
      </div>
    </Card>
  );
}

export function DeckLogStatsGridFallback() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <div className="h-[112px] rounded-[20px] border border-[var(--border)] bg-[var(--bg-surface-alt)]" />
      <div className="h-[112px] rounded-[20px] border border-[var(--border)] bg-[var(--bg-surface-alt)]" />
      <div className="h-[112px] rounded-[20px] border border-[var(--border)] bg-[var(--bg-surface-alt)]" />
    </div>
  );
}

export async function DeckLogStatsGrid({
  logsPromise
}: {
  logsPromise: Promise<BattleLogSummary[]>;
}) {
  const stats = getBattleLogSummaryStats(await logsPromise);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <StatCard label="Total Games" value={stats.total} />
      <StatCard label="Wins" value={stats.wins} valueColor="win" />
      <StatCard label="Losses" value={stats.losses} valueColor="loss" />
    </div>
  );
}

export async function DeckRelatedLogsSection({
  deck,
  logsPromise
}: {
  deck: Deck;
  logsPromise: Promise<BattleLogSummary[]>;
}) {
  const allRelatedLogs = attachLinkedDeckListNames(await logsPromise, deck);
  const relatedLogs = allRelatedLogs.slice(0, 5);

  return (
    <Card className="space-y-5">
      <div className="space-y-2">
        <p className="ui-eyebrow">Battle Logs</p>
        <p className="text-sm text-[var(--text-secondary)]">
          Recent battle logs linked to this strategy or matched to its archetype.
        </p>
      </div>

      {relatedLogs.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)]">
          No linked battle logs yet for this deck.
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {relatedLogs.map((log) => (
              <LogRow key={log.id} log={log} />
            ))}
          </div>

          <div className="flex flex-col gap-3 border-t border-[var(--border)] pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-[var(--text-muted)]">
              {allRelatedLogs.length > relatedLogs.length
                ? `Showing the latest ${relatedLogs.length} linked logs.`
                : `Showing all ${relatedLogs.length} linked logs.`}
            </p>

            <div className="sm:ml-auto">
              <DeckLinkedLogsDialog logs={allRelatedLogs} />
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
