import { Card } from "@/components/ui/Card";
import { LazyImportLogButton } from "@/components/ui/LazyImportLogButton";
import { LogsManager } from "@/components/ui/LogsManager";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { requireUser } from "@/lib/auth";
import { getDeckSelectionOptions } from "@/lib/db/decks";
import { getLogsWindow, getLogSummaryStats } from "@/lib/db/logs";
import {
  getDeckLinkCandidates,
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

  const [stats, page, userDecks, deckLinkCandidates] = await Promise.all([
    getLogSummaryStats(user.id),
    getLogsWindow(user.id),
    getDeckSelectionOptions(user.id),
    getDeckLinkCandidates(user.id)
  ]);
  const logs = attachLinkedDeckListNames(page.logs, userDecks, deckLinkCandidates);

  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: "Poke Notes", href: "/" },
          { label: "Battle Logs" }
        ]}
        title="Battle Logs"
        action={
          <LazyImportLogButton
            className="w-full justify-center sm:w-auto"
            initialUserDecks={userDecks}
          />
        }
      />

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
    </>
  );
}
