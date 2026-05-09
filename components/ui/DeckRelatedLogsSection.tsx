import { Card } from "@/components/shadcn/card";
import { DeckLinkedLogsDialog } from "@/components/ui/DeckLinkedLogsDialog";
import { LogRow } from "@/components/ui/LogRow";
import { StatCard } from "@/components/ui/StatCard";
import type { LogSummaryStats } from "@/lib/db/logs";
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
        </div>
      </div>
      <div className="space-y-3">
        <div className="h-24 rounded-[20px] border border-border bg-muted" />
        <div className="h-24 rounded-[20px] border border-border bg-muted" />
      </div>
    </Card>
  );
}

export function DeckLogStatsGridFallback() {
  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-4">
      <div className="h-[86px] rounded-[20px] border border-border bg-muted sm:h-[112px]" />
      <div className="h-[86px] rounded-[20px] border border-border bg-muted sm:h-[112px]" />
      <div className="h-[86px] rounded-[20px] border border-border bg-muted sm:h-[112px]" />
    </div>
  );
}

export async function DeckLogStatsGrid({
  statsPromise
}: {
  statsPromise: Promise<LogSummaryStats>;
}) {
  const stats = await statsPromise;

  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-4">
      <StatCard label="Total Games" size="compact" value={stats.total} />
      <StatCard label="Wins" size="compact" value={stats.wins} valueColor="win" />
      <StatCard label="Losses" size="compact" value={stats.losses} valueColor="loss" />
    </div>
  );
}

export async function DeckRelatedLogsSection({
  deck,
  latestLogsPromise
}: {
  deck: Deck;
  latestLogsPromise: Promise<BattleLogSummary[]>;
}) {
  const relatedLogs = attachLinkedDeckListNames(await latestLogsPromise, deck);

  return (
    <Card className="space-y-5">
      <div className="space-y-2">
        <p className="ui-eyebrow">Battle Logs</p>
      </div>

      {relatedLogs.length === 0 ? (
        <p className="text-sm text-foreground">
          No linked battle logs yet for this deck.
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {relatedLogs.map((log) => (
              <LogRow key={log.id} log={log} />
            ))}
          </div>

          <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Showing the latest {relatedLogs.length} linked log
              {relatedLogs.length === 1 ? "" : "s"}.
            </p>

            <div className="sm:ml-auto">
              <DeckLinkedLogsDialog deckId={deck.id} />
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
