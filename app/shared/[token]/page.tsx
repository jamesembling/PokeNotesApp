import type { Metadata } from "next";
import { BattleLogDetailView } from "@/components/ui/BattleLogDetailView";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  getBattleLogDeckDisplayName,
  getBattleLogOpponentDisplayName,
  getBattleLogSpriteDisplayName
} from "@/lib/battle-log/display";
import { getSharedLogSnapshot } from "@/lib/db/log-shares";
import type { BattleLog } from "@/types/index";

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

function formatSharedLogDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date(value));
}

function buildSharedLogMetadata(log: BattleLog) {
  const selfDeckName =
    getBattleLogSpriteDisplayName(log.selfDeckSprites) ||
    getBattleLogDeckDisplayName(log.selfDeckName, log.selfDeckSprites);
  const opponentDeckName =
    getBattleLogSpriteDisplayName(log.opponentDeckSprites) ||
    getBattleLogOpponentDisplayName(log.opponentDeckName, log.opponentDeckSprites);
  const dateLabel = formatSharedLogDate(log.date);

  return {
    title: `${log.result} vs ${opponentDeckName} | Poke Notes`,
    description: `${selfDeckName} vs ${opponentDeckName} on ${dateLabel}.`
  };
}

export async function generateMetadata({ params }: SharedLogPageProps): Promise<Metadata> {
  const sharedLog = await getSharedLogSnapshot(params.token);

  if (!sharedLog) {
    return {
      title: "Shared Battle Log | Poke Notes",
      description: "This shared battle log link is missing or no longer available."
    };
  }

  const metadata = buildSharedLogMetadata(sharedLog.payload.log);

  return {
    title: metadata.title,
    description: metadata.description,
    openGraph: {
      title: metadata.title,
      description: metadata.description,
      siteName: "Poke Notes",
      type: "article"
    },
    twitter: {
      card: "summary",
      title: metadata.title,
      description: metadata.description
    }
  };
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
