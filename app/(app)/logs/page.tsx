import { Suspense } from "react";
import { Card } from "@/components/shadcn/card";
import { Skeleton } from "@/components/shadcn/skeleton";
import { LogsWorkspaceClient } from "@/components/ui/LogsWorkspaceClient";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireUser } from "@/lib/auth";
import { hydrateLogWindowDeckListNames } from "@/lib/db/log-linked-deck-list-names";
import { getLogSummaryStats, getLogsWindow } from "@/lib/db/logs";
import { measureServerCall } from "@/lib/server/perf";

export default async function LogsPage() {
  const user = await requireUser();
  const statsPromise = getLogSummaryStats(user.id);
  const windowPromise = getLogsWindow(user.id);
  const hydratedWindowPromise = windowPromise.then((window) =>
    measureServerCall("page.logs.linkedDeckListNames", () =>
      hydrateLogWindowDeckListNames(user.id, window)
    )
  );

  return (
    <Suspense fallback={<LogsContentFallback />}>
      <LogsContent
        hydratedWindowPromise={hydratedWindowPromise}
        statsPromise={statsPromise}
      />
    </Suspense>
  );
}

async function LogsContent({
  hydratedWindowPromise,
  statsPromise
}: {
  hydratedWindowPromise: ReturnType<typeof getLogsWindow>;
  statsPromise: ReturnType<typeof getLogSummaryStats>;
}) {
  const [stats, hydratedWindow] = await measureServerCall("page.logs.initialData", () =>
    Promise.all([
      statsPromise,
      hydratedWindowPromise
    ])
  );

  return (
    <div className="-mx-4 -my-6 flex min-h-dvh flex-col gap-6 bg-background px-4 py-6 text-foreground sm:-mx-6 sm:-my-8 sm:px-6 sm:py-8 lg:-mx-8 lg:px-8">
      <LogsWorkspaceClient stats={stats} window={hydratedWindow} />
    </div>
  );
}

function LogsContentFallback() {
  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: "Poke Notes", href: "/" },
          { label: "Battle Logs" }
        ]}
        meta={
          <div className="flex flex-wrap items-center gap-y-2">
            <Skeleton className="h-7 w-20" />
            <div aria-hidden="true" className="mx-5 h-5 w-px bg-border" />
            <Skeleton className="h-7 w-20" />
            <div aria-hidden="true" className="mx-5 h-5 w-px bg-border" />
            <Skeleton className="h-7 w-20" />
          </div>
        }
        title="Battle Logs"
      />

      <Card className="gap-0 p-0">
        <div className="grid gap-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Skeleton className="h-9 w-32 rounded-lg" />
            <Skeleton className="h-9 w-28 rounded-lg" />
          </div>
          <div className="grid gap-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton className="h-20 rounded-lg" key={index} />
            ))}
          </div>
        </div>
      </Card>
    </>
  );
}
