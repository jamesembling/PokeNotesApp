import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { ResultBadge } from "@/components/ui/ResultBadge";
import { SpriteStrip } from "@/components/ui/SpriteStrip";
import { StatCard } from "@/components/ui/StatCard";
import { requireUser } from "@/lib/auth";
import { getLogById } from "@/lib/db/logs";
import type { LogSection } from "@/types/index";

type LogDetailPageProps = {
  params: {
    id: string;
  };
};

const backLinkClassName =
  "inline-flex items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition hover:bg-[var(--bg-surface-alt)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-page)]";

export default async function LogDetailPage({ params }: LogDetailPageProps) {
  const user = await requireUser();

  const log = await getLogById(user.id, params.id);

  if (!log) {
    return (
      <>
        <PageHeader
          breadcrumb={[
            { label: "Poke Notes", href: "/" },
            { label: "Battle Logs", href: "/logs" },
            { label: "Not Found" }
          ]}
          title="Battle Log"
          action={
            <Link className={backLinkClassName} href="/logs">
              Back to Logs
            </Link>
          }
        />

        <Card>
          <div className="flex flex-col gap-3">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              Log not found
            </h2>
            <p className="text-sm text-[var(--text-muted)]">
              This battle log is unavailable or you do not have access to it.
            </p>
            <div>
              <Link className={backLinkClassName} href="/logs">
                Back to Logs
              </Link>
            </div>
          </div>
        </Card>
      </>
    );
  }

  const opponentDeckName = log.opponentDeckName || "Unknown Deck";
  const coinFlipLabel =
    log.coinTossWon === true ? "Won" : log.coinTossWon === false ? "Lost" : "Unknown";

  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: "Poke Notes", href: "/" },
          { label: "Battle Logs", href: "/logs" },
          { label: opponentDeckName }
        ]}
        title={`${log.result} vs ${opponentDeckName}`}
        action={
          <Link className={backLinkClassName} href="/logs">
            Back to Logs
          </Link>
        }
      />

      <Card>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <SpriteStrip size="md" sprites={log.selfDeckSprites} />
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-[var(--text-primary)]">
                  {log.selfDeckName}
                </p>
                <p className="text-sm text-[var(--text-muted)]">You</p>
              </div>
            </div>

            <div>
              <ResultBadge result={log.result} />
            </div>

            {log.goOrder ? (
              <p className="text-sm text-[var(--text-secondary)]">Went {log.goOrder}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-4 lg:items-end">
            <div className="flex items-center gap-3 lg:text-right">
              <SpriteStrip size="md" sprites={log.opponentDeckSprites} />
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-[var(--text-primary)]">
                  {opponentDeckName}
                </p>
                <p className="truncate text-sm text-[var(--text-muted)]">
                  {log.opponentPlayerName}
                </p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total Turns" value={log.totalTurns} />
          <StatCard label="Coin Flip" value={coinFlipLabel} />
          <StatCard label="Your Prizes" value={log.selfPrizesTaken} />
          <StatCard label="Opponent Prizes" value={log.opponentPrizesTaken} />
        </div>
      </Card>

      {log.sections.map((section, index) => (
        <LogSectionCard key={`${section.title}-${index}`} section={section} />
      ))}
    </>
  );
}

function LogSectionCard({ section }: { section: LogSection }) {
  const prizeEntries = Object.entries(section.prizesAfterTurn ?? {});

  return (
    <Card
      style={{
        contentVisibility: "auto",
        containIntrinsicSize: "320px"
      }}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">
            {section.title}
          </h2>
          {prizeEntries.length > 0 ? (
            <p className="text-sm text-[var(--text-muted)]">
              {prizeEntries
                .map(([playerName, prizes]) => `${playerName}: ${prizes} prizes`)
                .join(" \u00b7 ")}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col">
          {section.actions.map((action, actionIndex) => (
            <div
              className={[
                "py-3 first:pt-0 last:pb-0",
                actionIndex > 0 ? "border-t border-[var(--border)]" : ""
              ]
                .filter(Boolean)
                .join(" ")}
              key={`${action.title}-${actionIndex}`}
            >
              <p className="text-sm font-semibold text-[var(--text-primary)]">{action.title}</p>
              {action.details.length > 0 ? (
                <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm text-[var(--text-muted)]">
                  {action.details.map((detail, detailIndex) => (
                    <li key={`${detail}-${detailIndex}`}>{detail}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
