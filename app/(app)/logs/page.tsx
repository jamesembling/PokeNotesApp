import { Suspense } from "react";
import { Card } from "@/components/ui/Card";
import { LazyImportLogButton } from "@/components/ui/LazyImportLogButton";
import { LogsManager } from "@/components/ui/LogsManager";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { requireUser } from "@/lib/auth";
import { getDeckSelectionOptions } from "@/lib/db/decks";
import { getLogsWindow, getLogSummaryStats } from "@/lib/db/logs";
import type { BattleLogSummary, DeckSelectionOption } from "@/types/index";

function attachLinkedDeckListNames(
  logs: BattleLogSummary[],
  userDecks: DeckSelectionOption[]
) {
  return logs.map((log) => {
    if (!log.linkedDeckId || !log.linkedDeckListId) {
      return {
        ...log,
        linkedDeckListName: undefined
      };
    }

    const deck = userDecks.find((candidate) => candidate.id === log.linkedDeckId);
    const linkedDeckList = deck?.deckLists.find((deckList) => deckList.id === log.linkedDeckListId);

    return {
      ...log,
      linkedDeckListName: linkedDeckList?.name
    };
  });
}

export default async function LogsPage() {
  const user = await requireUser();
  const userId = user.id;
  const userDecksPromise = getDeckSelectionOptions(userId);
  const logsWindowPromise = getLogsWindow(userId);

  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: "Poke Notes", href: "/" },
          { label: "Battle Logs" }
        ]}
        title="Battle Logs"
        action={
          <LazyImportLogButton className="w-full justify-center sm:w-auto" />
        }
      />

      <Suspense fallback={<LogsSummaryFallback />}>
        <LogsSummaryCards userId={userId} />
      </Suspense>

      <Suspense fallback={<LogsManagerFallback />}>
        <LogsWorkspace
          logsWindowPromise={logsWindowPromise}
          userDecksPromise={userDecksPromise}
        />
      </Suspense>
    </>
  );
}

async function LogsSummaryCards({ userId }: { userId: string }) {
  const stats = await getLogSummaryStats(userId);

  return (
    <Card>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Total Logs"
          value={stats.total}
        />
        <StatCard
          label="Wins"
          value={stats.wins}
          valueColor="win"
        />
        <StatCard
          label="Losses"
          value={stats.losses}
          valueColor="loss"
        />
      </div>
    </Card>
  );
}

async function LogsWorkspace({
  logsWindowPromise,
  userDecksPromise
}: {
  logsWindowPromise: ReturnType<typeof getLogsWindow>;
  userDecksPromise: ReturnType<typeof getDeckSelectionOptions>;
}) {
  const [userDecks, page] = await Promise.all([
    userDecksPromise,
    logsWindowPromise
  ]);
  const logs = attachLinkedDeckListNames(page.logs, userDecks);

  return (
    <Card>
      <LogsManager
        initialCanLoadMore={page.hasMore}
        initialLogs={logs}
        initialNextWindowEndDate={page.nextWindowEndDate}
        initialWindowEndDate={page.windowEndDate}
        initialWindowStartDate={page.windowStartDate}
        userDecks={userDecks}
      />
    </Card>
  );
}

function LogsSummaryFallback() {
  return (
    <Card>
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            className="h-24 animate-pulse rounded-xl border border-[var(--border)] bg-[var(--bg-surface-alt)]"
            key={index}
          />
        ))}
      </div>
    </Card>
  );
}

function LogsManagerFallback() {
  return (
    <Card>
      <div className="flex flex-col gap-4">
        <div className="h-5 w-32 animate-pulse rounded bg-[var(--bg-surface-alt)]" />
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            className="h-20 animate-pulse rounded-xl border border-[var(--border)] bg-[var(--bg-surface-alt)]"
            key={index}
          />
        ))}
      </div>
    </Card>
  );
}
