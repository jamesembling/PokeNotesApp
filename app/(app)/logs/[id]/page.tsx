import Link from "next/link";
import { BattleLogDetailShell } from "@/components/ui/BattleLogDetailShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageWidth } from "@/components/ui/PageWidth";
import { requireUser } from "@/lib/auth";
import { getBattleLogOpponentDisplayName } from "@/lib/battle-log/display";
import { getDeckWithList } from "@/lib/db/decks";
import { getLogDetailSummaryById } from "@/lib/db/logs";
import { measureServerCall } from "@/lib/server/perf";

type LogDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

const backLinkClassName =
  "inline-flex items-center justify-center rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background";

function formatImportedAt(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(value));
}

function DetailError() {
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
          <Link className={backLinkClassName} href="/logs" prefetch={false}>
            Back to Logs
          </Link>
        }
      />

      <div className="rounded-xl border border-border bg-card p-4 sm:p-6">
        <div className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-card-foreground">
            Log not found
          </h2>
          <p className="text-sm text-muted-foreground">
            This battle log is unavailable or you do not have access to it.
          </p>
          <div>
            <Link className={backLinkClassName} href="/logs" prefetch={false}>
              Back to Logs
            </Link>
          </div>
        </div>
      </div>
    </PageWidth>
  );
}

export default async function LogDetailPage({ params }: LogDetailPageProps) {
  const user = await requireUser();
  const { id } = await params;
  const log = await measureServerCall("page.logs.detail.summary", () =>
    getLogDetailSummaryById(user.id, id)
  );

  if (!log) {
    return <DetailError />;
  }

  const linkedDeckWithList =
    log.linkedDeckId && log.linkedDeckListId
      ? await measureServerCall("page.logs.detail.linkedDeckList", () =>
          getDeckWithList(user.id, log.linkedDeckId as string, log.linkedDeckListId as string)
        )
      : null;
  const opponentDeckName = getBattleLogOpponentDisplayName(
    log.opponentDeckName,
    log.opponentDeckSprites
  );

  return (
    <PageWidth size="standard">
      <div className="flex flex-col gap-2 sm:gap-6" data-log-detail-summary-visible>
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
          linkedDeckId={log.linkedDeckId}
          linkedDeckListFormat={linkedDeckWithList?.deckList.format}
          linkedDeckListId={linkedDeckWithList?.deckList.id ?? log.linkedDeckListId}
          linkedDeckListName={linkedDeckWithList?.deckList.name}
          linkedDeckListNotes={linkedDeckWithList?.deckList.notes}
          linkedDeckListRawList={linkedDeckWithList?.deckList.rawList}
          linkedDeckListSortedCards={linkedDeckWithList?.deckList.sortedCards ?? []}
          linkedStrategyLabel={
            linkedDeckWithList?.deckList.name ??
            linkedDeckWithList?.deckName ??
            (log.linkedDeckId ? "Linked strategy" : "No strategy linked")
          }
          log={log}
          timestampLabel={formatImportedAt(log.importedAt)}
          userDecks={[]}
        />
      </div>
    </PageWidth>
  );
}
