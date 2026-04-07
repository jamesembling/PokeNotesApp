import Link from "next/link";
import { BattleLogDetailView } from "@/components/ui/BattleLogDetailView";
import { CopyShareLinkButton } from "@/components/ui/CopyShareLinkButton";
import { EditLogDialog } from "@/components/ui/EditLogDialog";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireUser } from "@/lib/auth";
import { getBattleLogDeckDisplayName } from "@/lib/battle-log/display";
import { getDecks } from "@/lib/db/decks";
import { getLogById } from "@/lib/db/logs";
import { getPokemonOptions } from "@/lib/db/pokemon";

type LogDetailPageProps = {
  params: {
    id: string;
  };
};

const backLinkClassName =
  "inline-flex items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition hover:bg-[var(--bg-surface-alt)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-page)]";

function formatImportedAt(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export default async function LogDetailPage({ params }: LogDetailPageProps) {
  const user = await requireUser();

  const [log, userDecks, pokemonOptions] = await Promise.all([
    getLogById(user.id, params.id),
    getDecks(user.id),
    getPokemonOptions()
  ]);

  if (!log) {
    return (
      <>
        <PageHeader
          breadcrumb={[
            { label: "Poke Notes", href: "/" },
            { label: "Battle Logs", href: "/logs" },
            { label: "Not Found" }
          ]}
          title="Battle Log"
          action={
            <Link className={backLinkClassName} href="/logs">
              Back to Logs
            </Link>
          }
        />

        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 sm:p-6">
          <div className="flex flex-col gap-3">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              Log not found
            </h2>
            <p className="text-sm text-[var(--text-muted)]">
              This battle log is unavailable or you do not have access to it.
            </p>
            <div>
              <Link className={backLinkClassName} href="/logs">
                Back to Logs
              </Link>
            </div>
          </div>
        </div>
      </>
    );
  }

  const opponentDeckName = getBattleLogDeckDisplayName(
    log.opponentDeckName,
    log.opponentDeckSprites
  );
  const linkedDeck = log.linkedDeckId
    ? userDecks.find((deck) => deck.id === log.linkedDeckId) ?? null
    : null;
  const linkedDeckList = linkedDeck?.deckLists.find(
    (deckList) => deckList.id === log.linkedDeckListId
  );
  const linkedStrategyLabel = linkedDeckList?.name ?? linkedDeck?.deckName ?? "No strategy linked";
  const timestampLabel = formatImportedAt(log.importedAt);

  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: "Poke Notes", href: "/" },
          { label: "Battle Logs", href: "/logs" },
          { label: opponentDeckName }
        ]}
        title="Battle Log"
      />

      <BattleLogDetailView
        actions={
          <>
            <EditLogDialog log={log} pokemonOptions={pokemonOptions} userDecks={userDecks} />
            <CopyShareLinkButton logId={log.id} />
            <Link className={backLinkClassName} href="/logs">
              Back to Logs
            </Link>
          </>
        }
        linkedStrategyLabel={linkedStrategyLabel}
        log={log}
        timestampLabel={timestampLabel}
      />
    </>
  );
}
