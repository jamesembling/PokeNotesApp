import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { Button } from "@/components/shadcn/button";
import { BattleLogDetailShell } from "@/components/ui/BattleLogDetailShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageWidth } from "@/components/ui/PageWidth";
import {
  ProxyAuthTimingMarker,
  RouteTimingMarker
} from "@/components/ui/RouteTimingMarker";
import { PageTitle } from "@/components/ui/Typography";
import { requireUser } from "@/lib/auth";
import { getBattleLogOpponentDisplayName } from "@/lib/battle-log/display";
import { projectOwnerBattleLogDetail } from "@/lib/battle-log/detail-projection";
import { getLogDetailSummaryById } from "@/lib/db/logs";
import { measureServerCallWithTiming } from "@/lib/server/perf";

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
  const logTiming = await measureServerCallWithTiming("page.logs.detail.summary", () =>
    getLogDetailSummaryById(user.id, id)
  );
  const log = logTiming.value;

  if (!log) {
    return <DetailError />;
  }

  const opponentDeckName = getBattleLogOpponentDisplayName(
    log.opponentDeckName,
    log.opponentDeckSprites
  );
  const projection = projectOwnerBattleLogDetail({
    linkedStrategyLabel: log.linkedDeckId ? "Linked strategy" : "No strategy linked",
    log
  });

  return (
    <PageWidth size="standard">
      <ProxyAuthTimingMarker />
      <RouteTimingMarker durationMs={logTiming.durationMs} phase="route-data" />
      <div className="flex flex-col gap-2 sm:gap-6" data-log-detail-summary-visible>
        <PageHeader
          breadcrumb={[
            { label: "Poke Notes", href: "/" },
            { label: "Battle Logs", href: "/logs" },
            { label: `VS ${opponentDeckName}` }
          ]}
          afterBreadcrumb={
            <Link
              className="inline-flex min-h-11 w-fit items-center gap-1.5 text-sm font-semibold text-foreground hover:text-primary"
              href="/logs"
              prefetch={false}
            >
              <ArrowLeftIcon className="size-4" />
              Battle Logs
            </Link>
          }
        />

        <PageTitle className="sr-only">Battle Log versus {opponentDeckName}</PageTitle>

        <BattleLogDetailShell
          activeShare={null}
          linkedDeckId={projection.log.linkedDeckId}
          linkedStrategyLabel={projection.linkedStrategyLabel}
          log={projection.log}
          timestampLabel={formatImportedAt(projection.log.importedAt)}
          userDecks={[]}
        />
      </div>
    </PageWidth>
  );
}
