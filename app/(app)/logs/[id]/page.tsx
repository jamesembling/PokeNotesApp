import Link from "next/link";
import { BattleLogDetailShell } from "@/components/ui/BattleLogDetailShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageWidth } from "@/components/ui/PageWidth";
import { requireUser } from "@/lib/auth";
import { getBattleLogOpponentDisplayName } from "@/lib/battle-log/display";
import { getLogDetailSummaryById } from "@/lib/db/logs";

type LogDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
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
  const { id } = await params;
  const userId = user.id;

  const log = await getLogDetailSummaryById(userId, id);

  if (!log) {
    return (
      <PageWidth size="standard">
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
      </PageWidth>
    );
  }

  const opponentDeckName = getBattleLogOpponentDisplayName(
    log.opponentDeckName,
    log.opponentDeckSprites
  );
  const timestampLabel = formatImportedAt(log.importedAt);

  return (
    <PageWidth size="standard">
      <div className="flex flex-col gap-2 sm:gap-6">
        <PageHeader
          breadcrumb={[
            { label: "Poke Notes", href: "/" },
            { label: "Battle Logs", href: "/logs" },
            { label: `VS ${opponentDeckName}` }
          ]}
          title=" "
        />

        <BattleLogDetailShell
          activeShare={null}
          linkedDeckId={log.linkedDeckId ?? undefined}
          linkedDeckListId={log.linkedDeckListId ?? undefined}
          linkedStrategyLabel={log.linkedDeckId ? "Linked strategy" : "No strategy linked"}
          log={log}
          timestampLabel={timestampLabel}
          userDecks={[]}
        />
      </div>
    </PageWidth>
  );
}
