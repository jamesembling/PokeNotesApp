import { LazyImportLogButton } from "@/components/ui/LazyImportLogButton";
import { LogsWorkspaceClient } from "@/components/ui/LogsWorkspaceClient";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireUser } from "@/lib/auth";
import { hydrateLogWindowDeckListNames } from "@/lib/db/log-linked-deck-list-names";
import { getLogSummaryStats, getLogsWindow } from "@/lib/db/logs";
import { measureServerCall } from "@/lib/server/perf";

export default async function LogsPage() {
  const user = await requireUser();
  const [stats, window] = await measureServerCall("page.logs.initialData", () =>
    Promise.all([
      getLogSummaryStats(user.id),
      getLogsWindow(user.id)
    ])
  );
  const hydratedWindow = await measureServerCall("page.logs.linkedDeckListNames", () =>
    hydrateLogWindowDeckListNames(user.id, window)
  );

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

      <LogsWorkspaceClient stats={stats} window={hydratedWindow} />
    </>
  );
}
