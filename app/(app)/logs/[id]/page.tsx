import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { Button } from "@/components/shadcn/button";
import { BattleLogDetailShell } from "@/components/ui/BattleLogDetailShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageWidth } from "@/components/ui/PageWidth";
import { requireUser } from "@/lib/auth";
import { getBattleLogOpponentDisplayName } from "@/lib/battle-log/display";
import { getLogDetailSummaryById } from "@/lib/db/logs";
import { measureServerCall } from "@/lib/server/perf";

type LogDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

const IMPORTED_AT_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  month: "short",
  year: "numeric"
});

function formatImportedAt(value: string) {
  return IMPORTED_AT_FORMATTER.format(new Date(value));
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
          <Button asChild variant="outline">
            <Link href="/logs" prefetch={false}>
              Back to Logs
            </Link>
          </Button>
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
            <Button asChild variant="outline">
              <Link href="/logs" prefetch={false}>
                Back to Logs
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </PageWidth>
  );
}

export default async function LogDetailPage({ params }: LogDetailPageProps) {
  const [user, { id }] = await Promise.all([requireUser(), params]);
  const log = await measureServerCall("page.logs.detail.summary", () =>
    getLogDetailSummaryById(user.id, id)
  );

  if (!log) {
    return <DetailError />;
  }

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
          afterBreadcrumb={
            <Link
              className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-primary sm:hidden"
              href="/logs"
              prefetch={false}
            >
              <ArrowLeftIcon className="size-4" />
              Back to Logs
            </Link>
          }
        />

        <BattleLogDetailShell
          activeShare={null}
          linkedDeckId={log.linkedDeckId}
          linkedStrategyLabel={
            log.linkedDeckId ? "Linked strategy" : "No strategy linked"
          }
          log={log}
          timestampLabel={formatImportedAt(log.importedAt)}
          userDecks={[]}
        />
      </div>
    </PageWidth>
  );
}
