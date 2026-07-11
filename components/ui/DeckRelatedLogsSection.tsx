import { DeckLinkedLogsDialog } from "@/components/ui/DeckLinkedLogsDialog";
import { LogRow } from "@/components/ui/LogRow";
import { SectionHeader } from "@/components/ui/SectionHeader";
import type { LogSummaryStats } from "@/lib/db/logs";
import type { BattleLogSummary, Deck } from "@/types/index";

function attachLinkedDeckListNames(logs: BattleLogSummary[], deck: Deck) {
  const deckListNamesById = new Map(deck.deckLists.map((deckList) => [deckList.id, deckList.name] as const));

  return logs.map((log) => {
    if (log.linkedDeckId !== deck.id || !log.linkedDeckListId) {
      return log;
    }

    const linkedDeckListName = deckListNamesById.get(log.linkedDeckListId);
    if (!linkedDeckListName) {
      return log;
    }

    return {
      ...log,
      linkedDeckListName
    };
  });
}

export function DeckRelatedLogsSectionFallback() {
  return (
    <section className="space-y-5 border-b border-border pb-6">
      <SectionHeader eyebrow="Battle Logs" />
      <div className="space-y-3">
        <div className="h-24 rounded-[20px] border border-border bg-card" />
        <div className="h-24 rounded-[20px] border border-border bg-card" />
      </div>
    </section>
  );
}

export function DeckLogStatsGridFallback() {
  return (
    <div className="grid overflow-hidden rounded-xl border border-border bg-card sm:grid-cols-3">
      <div className="h-[86px] border-b border-border sm:h-[112px] sm:border-b-0 sm:border-r" />
      <div className="h-[86px] border-b border-border sm:h-[112px] sm:border-b-0 sm:border-r" />
      <div className="h-[86px] sm:h-[112px]" />
    </div>
  );
}

function DeckLogStat({
  label,
  value,
  valueColor = "text-card-foreground"
}: {
  label: string;
  value: number;
  valueColor?: string;
}) {
  return (
    <div className="grid gap-2 p-4">
      <p className="text-[0.68rem] font-medium uppercase leading-tight tracking-[0.18em] text-muted-foreground sm:text-xs sm:tracking-wide">
        {label}
      </p>
      <p
        className={[
          "text-[1.5rem] font-semibold leading-none tracking-[-0.02em] [font-variant-numeric:tabular-nums] sm:text-3xl",
          valueColor
        ].join(" ")}
      >
        {value}
      </p>
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
    <div className="grid overflow-hidden rounded-xl border border-border bg-card sm:grid-cols-3">
      <div className="border-b border-border sm:border-b-0 sm:border-r">
        <DeckLogStat label="Total Games" value={stats.total} />
      </div>
      <div className="border-b border-border sm:border-b-0 sm:border-r">
        <DeckLogStat label="Wins" value={stats.wins} valueColor="text-win-strong" />
      </div>
      <DeckLogStat label="Losses" value={stats.losses} valueColor="text-loss-strong" />
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
    <section className="space-y-5 border-b border-border pb-6">
      <SectionHeader eyebrow="Battle Logs" />

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
    </section>
  );
}
