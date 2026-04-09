import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <p className="ui-eyebrow">Battle Logs</p>
          <p className="text-sm text-[var(--text-secondary)]">
            Loading recent battle logs linked to this strategy.
          </p>
        </div>
        <Badge>Loading</Badge>
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
  const stats = getBattleLogSummaryStats(allRelatedLogs);
  const relatedLogs = allRelatedLogs.slice(0, 5);
  const recentStats = getBattleLogSummaryStats(relatedLogs);

  return (
    <Card className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <p className="ui-eyebrow">Battle Logs</p>
          <p className="text-sm text-[var(--text-secondary)]">
            Recent battle logs linked to this strategy or matched to its archetype.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge>{relatedLogs.length} logs</Badge>
          <Badge>{recentStats.wins} wins</Badge>
          <Badge>{recentStats.losses} losses</Badge>
        </div>
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

          <p className="text-sm text-[var(--text-muted)]">
            Showing the latest {relatedLogs.length} linked log
            {relatedLogs.length === 1 ? "" : "s"}.
            {stats.total > relatedLogs.length
              ? ` ${recentStats.wins}-${recentStats.losses} in this preview, ${stats.wins}-${stats.losses} overall.`
              : ` ${stats.wins}-${stats.losses} overall.`}
          </p>
        </>
      )}
    </Card>
  );
}
