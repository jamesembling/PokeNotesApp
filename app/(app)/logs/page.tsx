import { Card } from "@/components/ui/Card";
import { ImportLogDialog } from "@/components/ui/ImportLogDialog";
import { LogsManager } from "@/components/ui/LogsManager";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { requireUser } from "@/lib/auth";
import { getDecks } from "@/lib/db/decks";
import { getLogsWindow, getLogSummaryStats } from "@/lib/db/logs";
import { getPokemonOptions } from "@/lib/db/pokemon";
import type { BattleLogSummary } from "@/types/index";

function attachLinkedDeckListNames(
  logs: BattleLogSummary[],
  userDecks: Awaited<ReturnType<typeof getDecks>>
) {
  return logs.map((log) => {
    if (!log.linkedDeckId || !log.linkedDeckListId) {
      return log;
    }

    const deck = userDecks.find((candidate) => candidate.id === log.linkedDeckId);
    const linkedDeckList = deck?.deckLists.find((deckList) => deckList.id === log.linkedDeckListId);

    if (!linkedDeckList?.name) {
      return log;
    }

    return {
      ...log,
      linkedDeckListName: linkedDeckList.name
    };
  });
}

export default async function LogsPage() {
  const user = await requireUser();

  const [stats, page, userDecks, pokemonOptions] = await Promise.all([
    getLogSummaryStats(user.id),
    getLogsWindow(user.id),
    getDecks(user.id),
    getPokemonOptions()
  ]);
  const logs = attachLinkedDeckListNames(page.logs, userDecks);

  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: "Poke Notes", href: "/" },
          { label: "Battle Logs" }
        ]}
        title="Battle Logs"
        subtitle="Imported Pokemon TCG Live logs, grouped by day and ready for deeper review."
        action={
          <ImportLogDialog
            pokemonOptions={pokemonOptions}
            userDecks={userDecks}
            userId={user.id}
          />
        }
      />

      <Card>
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            detail="Imported battle logs available in your workspace."
            label="Total Logs"
            value={stats.total}
          />
          <StatCard
            detail="Resolved wins across all imported games."
            label="Wins"
            value={stats.wins}
            valueColor="win"
          />
          <StatCard
            detail="Resolved losses across all imported games."
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
          pokemonOptions={pokemonOptions}
          userDecks={userDecks}
        />
      </Card>
    </>
  );
}
