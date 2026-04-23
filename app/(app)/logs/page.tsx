import { Suspense } from "react";
import { Card } from "@/components/ui/Card";
import { LazyImportLogButton } from "@/components/ui/LazyImportLogButton";
import { LogsManager } from "@/components/ui/LogsManager";
import { LogsSummaryCardsClient } from "@/components/ui/LogsSummaryCardsClient";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireUser } from "@/lib/auth";
import { getLogsWindow } from "@/lib/db/logs";

export default async function LogsPage() {
  const user = await requireUser();
  const userId = user.id;
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

      <LogsSummaryCardsClient />

      <Suspense fallback={<LogsManagerFallback />}>
        <LogsWorkspace logsWindowPromise={logsWindowPromise} />
      </Suspense>
    </>
  );
}

async function LogsWorkspace({
  logsWindowPromise
}: {
  logsWindowPromise: ReturnType<typeof getLogsWindow>;
}) {
  const page = await logsWindowPromise;

  return (
    <Card>
      <LogsManager
        initialCanLoadMore={page.hasMore}
        initialLogs={page.logs}
        initialNextWindowEndDate={page.nextWindowEndDate}
        initialWindowEndDate={page.windowEndDate}
        initialWindowStartDate={page.windowStartDate}
      />
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
