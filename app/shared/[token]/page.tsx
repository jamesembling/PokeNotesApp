import { BattleLogDetailView } from "@/components/ui/BattleLogDetailView";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { getSharedLogSnapshot } from "@/lib/db/log-shares";

type SharedLogPageProps = {
  params: {
    token: string;
  };
};

function formatImportedAt(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export default async function SharedLogPage({ params }: SharedLogPageProps) {
  const sharedLog = await getSharedLogSnapshot(params.token);

  if (!sharedLog) {
    return (
      <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="mx-auto flex max-w-5xl flex-col gap-6">
          <PageHeader
            breadcrumb={[{ label: "Poke Notes", href: "/" }, { label: "Shared Battle Log" }]}
            title="Shared Battle Log"
          />

          <Card>
            <div className="flex flex-col gap-3">
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                Shared log not found
              </h2>
              <p className="text-sm text-[var(--text-muted)]">
                This shared battle log link is missing or no longer available.
              </p>
            </div>
          </Card>
        </div>
      </main>
    );
  }

  const timestampLabel = formatImportedAt(
    sharedLog.payload.log.importedAt || sharedLog.createdAt
  );

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <PageHeader
          breadcrumb={[{ label: "Poke Notes", href: "/" }, { label: "Shared Battle Log" }]}
          title="Shared Battle Log"
        />

        <BattleLogDetailView
          linkedStrategyLabel={sharedLog.payload.linkedStrategyLabel}
          log={sharedLog.payload.log}
          notice={
            <div className="rounded-[20px] border border-[rgba(43,109,246,0.14)] bg-[linear-gradient(180deg,var(--bg-surface),rgba(43,109,246,0.08))] px-4 py-3 text-sm leading-6 text-[var(--text-primary)] shadow-[var(--shadow-sm)]">
              This battle log was opened from a share link.
            </div>
          }
          timestampLabel={timestampLabel}
        />
      </div>
    </main>
  );
}
