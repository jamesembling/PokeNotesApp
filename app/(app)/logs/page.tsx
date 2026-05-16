import { LazyImportLogButton } from "@/components/ui/LazyImportLogButton";
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

  const [stats, hydratedWindow] = await measureServerCall("page.logs.initialData", () =>
    Promise.all([
      statsPromise,
      hydratedWindowPromise
    ])
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
