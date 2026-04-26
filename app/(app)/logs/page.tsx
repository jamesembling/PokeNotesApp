import { LazyImportLogButton } from "@/components/ui/LazyImportLogButton";
import { LogsWorkspaceClient } from "@/components/ui/LogsWorkspaceClient";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireUser } from "@/lib/auth";
import { getLogSummaryStats, getLogsWindow } from "@/lib/db/logs";

export default async function LogsPage() {
  const user = await requireUser();
  const [stats, window] = await Promise.all([
    getLogSummaryStats(user.id),
    getLogsWindow(user.id)
  ]);

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

      <LogsWorkspaceClient stats={stats} window={window} />
    </>
  );
}
