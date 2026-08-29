import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BattleLogDetailView } from "@/components/ui/BattleLogDetailView";
import { LinkedDeckListDialog } from "@/components/ui/LinkedDeckListPanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { resolveBattleLogActionTagOverrides } from "@/lib/battle-log/action-tags";
import {
  getBattleLogDeckDisplayName,
  getBattleLogOpponentDisplayName,
  getBattleLogSpriteDisplayName
} from "@/lib/battle-log/display";
import { projectPublicBattleLogDetail } from "@/lib/battle-log/detail-projection";
import { getSharedLogSnapshot } from "@/lib/db/log-shares";
import { requireSharedLogSnapshot } from "@/lib/shared-log-routing";
import type { PublicBattleLog } from "@/lib/db/log-shares";

const SHARED_LOG_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit"
});

const SHARED_LOG_DATE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric"
});

function formatImportedAt(value: string) {
  return SHARED_LOG_DATE_TIME_FORMATTER.format(new Date(value));
}

function formatExpiry(value: string) {
  return SHARED_LOG_DATE_TIME_FORMATTER.format(new Date(value));
}

function formatSharedLogDate(value: string) {
  return SHARED_LOG_DATE_FORMATTER.format(new Date(value));
}

function buildSharedLogMetadata(log: PublicBattleLog) {
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

export async function generateSharedLogMetadata(token: string): Promise<Metadata> {
  const sharedLog = await getSharedLogSnapshot(token);

  if (!sharedLog) {
    return {
      title: "Shared Battle Log | Poke Notes",
      description: "This shared battle log link is missing or no longer available.",
      robots: {
        follow: false,
        index: false
      }
    };
  }

  const metadata = buildSharedLogMetadata(sharedLog.payload.log);

  return {
    title: metadata.title,
    description: metadata.description,
    robots: {
      follow: false,
      index: false
    },
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

export async function SharedLogPage({ token }: { token: string }) {
  const sharedLog = requireSharedLogSnapshot(await getSharedLogSnapshot(token), notFound);

  const timestampLabel = formatImportedAt(
    sharedLog.payload.log.importedAt || sharedLog.createdAt
  );
  const expiryLabel = formatExpiry(sharedLog.expiresAt);
  const projection = projectPublicBattleLogDetail(sharedLog.payload);
  const actionTagOverrides = await resolveBattleLogActionTagOverrides(
    sharedLog.payload.log.sections
  );

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <PageHeader
          breadcrumb={[{ label: "Poke Notes", href: "/" }, { label: "Shared Battle Log" }]}
          title="Shared Battle Log"
        />

        <BattleLogDetailView
          actionTagOverrides={actionTagOverrides}
          actions={
            projection.linkedDeckList.name ? (
              <LinkedDeckListDialog
                deckListName={projection.linkedDeckList.name}
                rawList={projection.linkedDeckList.rawList}
                sortedCards={projection.linkedDeckList.sortedCards}
              />
            ) : null
          }
          linkedStrategyLabel={projection.linkedStrategyLabel}
          log={projection.log}
          notice={
            <div className="rounded-[20px] border border-[var(--share-notice-border)] bg-[image:var(--share-notice-bg)] px-4 py-3 text-sm leading-6 text-card-foreground shadow-[var(--shadow-sm)]">
              This battle log was opened from a time-limited share link. Linked deck-list details
              are included in this snapshot when they were attached at share time. This link expires
              on {expiryLabel}.
            </div>
          }
          timestampLabel={timestampLabel}
        />
      </div>
    </main>
  );
}
