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
        meta={
          <div
            aria-label={`${stats.total} total battle logs, ${stats.wins} wins, ${stats.losses} losses`}
            className="flex flex-wrap items-center gap-y-2 text-sm text-muted-foreground"
          >
            <div className="flex items-baseline gap-2 pr-5">
              <span className="text-[1.35rem] font-semibold leading-none text-card-foreground [font-variant-numeric:tabular-nums]">
                {stats.total}
              </span>
              <span>total</span>
            </div>
            <div aria-hidden="true" className="h-5 w-px bg-border" />
            <div className="flex items-baseline gap-2 px-5">
              <span className="text-[1.35rem] font-semibold leading-none text-[var(--color-win)] [font-variant-numeric:tabular-nums]">
                {stats.wins}
              </span>
              <span>wins</span>
            </div>
            <div aria-hidden="true" className="h-5 w-px bg-border" />
            <div className="flex items-baseline gap-2 pl-5">
              <span className="text-[1.35rem] font-semibold leading-none text-[var(--color-loss)] [font-variant-numeric:tabular-nums]">
                {stats.losses}
              </span>
              <span>losses</span>
            </div>
          </div>
        }
        action={
          <LazyImportLogButton className="w-full justify-center sm:w-auto" />
        }
      />

      <LogsWorkspaceClient window={hydratedWindow} />
    </>
  );
}
