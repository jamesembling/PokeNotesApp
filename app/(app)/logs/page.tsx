import { Suspense } from "react";
import { Card } from "@/components/ui/Card";
import { LazyImportLogButton } from "@/components/ui/LazyImportLogButton";
import { LogsManager } from "@/components/ui/LogsManager";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { requireUser } from "@/lib/auth";
import { getDeckSelectionAndLinkCandidates } from "@/lib/db/decks";
import { getLogsWindow, getLogSummaryStats } from "@/lib/db/logs";
import {
  resolveLinkedDeck,
  type DeckLinkCandidate
} from "@/lib/log-import/deck-linking";
import type { BattleLogSummary, DeckSelectionOption } from "@/types/index";

function attachLinkedDeckListNames(
  logs: BattleLogSummary[],
  userDecks: DeckSelectionOption[],
  deckLinkCandidates: DeckLinkCandidate[]
) {
  return logs.map((log) => {
    const resolvedLinkedDeckId =
      log.linkedDeckId ??
      resolveLinkedDeck(deckLinkCandidates, {
        linkedDeckId: log.linkedDeckId,
        selfDeckName: log.selfDeckName,
        selfDeckSprites: log.selfDeckSprites
      }) ??
      undefined;

    if (!resolvedLinkedDeckId || !log.linkedDeckListId) {
      return {
        ...log,
        linkedDeckId: resolvedLinkedDeckId
      };
    }

    const deck = userDecks.find((candidate) => candidate.id === resolvedLinkedDeckId);
    const linkedDeckList = deck?.deckLists.find((deckList) => deckList.id === log.linkedDeckListId);

    if (!linkedDeckList?.name) {
      return {
        ...log,
        linkedDeckId: resolvedLinkedDeckId
      };
    }

    return {
      ...log,
      linkedDeckId: resolvedLinkedDeckId,
      linkedDeckListName: linkedDeckList.name
    };
  });
}

export default async function LogsPage() {
  const user = await requireUser();
  const userId = user.id;
  const deckContextPromise = getDeckSelectionAndLinkCandidates(userId);
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
          deckContextPromise={deckContextPromise}
          logsWindowPromise={logsWindowPromise}
          userId={userId}
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
  deckContextPromise,
  logsWindowPromise,
  userId
}: {
  deckContextPromise: ReturnType<typeof getDeckSelectionAndLinkCandidates>;
  logsWindowPromise: ReturnType<typeof getLogsWindow>;
  userId: string;
}) {
  const [{ deckLinkCandidates, userDecks }, page] = await Promise.all([
    deckContextPromise,
    logsWindowPromise
  ]);
  const logs = attachLinkedDeckListNames(page.logs, userDecks, deckLinkCandidates);

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
