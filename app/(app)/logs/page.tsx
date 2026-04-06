import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { ImportLogButton } from "@/components/ui/ImportLogButton";
import { LogRow } from "@/components/ui/LogRow";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { requireUser } from "@/lib/auth";
import { getLogsPage, getLogSummaryStats } from "@/lib/db/logs";
import type { BattleLogSummary } from "@/types/index";

type LogGroup = {
  date: string;
  logs: BattleLogSummary[];
  wins: number;
  losses: number;
};

function formatGroupDate(date: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date(`${date}T00:00:00`));
}

function groupLogsByDate(logs: BattleLogSummary[]): LogGroup[] {
  const groups = new Map<string, LogGroup>();

  logs.forEach((log) => {
    const existingGroup = groups.get(log.date);

    if (existingGroup) {
      existingGroup.logs.push(log);
      if (log.result === "Win") {
        existingGroup.wins += 1;
      } else {
        existingGroup.losses += 1;
      }

      return;
    }

    groups.set(log.date, {
      date: log.date,
      logs: [log],
      wins: log.result === "Win" ? 1 : 0,
      losses: log.result === "Loss" ? 1 : 0
    });
  });

  return Array.from(groups.values());
}

export default async function LogsPage() {
  const user = await requireUser();

  const [stats, page] = await Promise.all([
    getLogSummaryStats(user.id),
    getLogsPage(user.id)
  ]);
  const groups = groupLogsByDate(page.logs);

  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: "Poke Notes", href: "/" },
          { label: "Battle Logs" }
        ]}
        title="Battle Logs"
        subtitle="Imported Pokemon TCG Live logs, grouped by day and ready for deeper review."
        action={<ImportLogButton />}
      />

      <Card>
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            detail="Imported battle logs available in your workspace."
            label="Total Logs"
            value={stats.total}
          />
          <StatCard
            detail="Resolved wins across all imported games."
            label="Wins"
            value={stats.wins}
            valueColor="win"
          />
          <StatCard
            detail="Resolved losses across all imported games."
            label="Losses"
            value={stats.losses}
            valueColor="loss"
          />
        </div>
      </Card>

      <Card>
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-kicker)]">
                All Logs
              </p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                Most recent battle logs with lightweight summary data only.
              </p>
            </div>
            {page.hasMore ? <Badge>More available</Badge> : null}
          </div>

          {groups.length > 0 ? (
            groups.map((group) => (
              <section className="flex flex-col gap-3" key={group.date}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-base font-semibold text-[var(--text-primary)]">
                    {formatGroupDate(group.date)}
                  </h2>
                  <Badge>
                    {group.wins}W-{group.losses}L
                  </Badge>
                </div>
                <div className="flex flex-col gap-3">
                  {group.logs.map((log) => (
                    <LogRow key={log.id} log={log} />
                  ))}
                </div>
              </section>
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-surface-alt)] p-6 text-sm text-[var(--text-muted)]">
              No battle logs yet. Import your first PTCGL log to start tracking results.
            </div>
          )}

          {page.hasMore ? (
            <div className="flex justify-start">
              <Button disabled variant="secondary">
                More logs coming soon
              </Button>
            </div>
          ) : null}
        </div>
      </Card>
    </>
  );
}
