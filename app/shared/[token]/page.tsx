import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BattleLogDetailView } from "@/components/ui/BattleLogDetailView";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  getBattleLogDeckDisplayName,
  getBattleLogOpponentDisplayName,
  getBattleLogSpriteDisplayName
} from "@/lib/battle-log/display";
import { sortDeckListCardsLocally } from "@/lib/deck-lists/local-sort";
import { parseDeckList } from "@/lib/decks/deck-list-parse";
import { getSharedLogSnapshot } from "@/lib/db/log-shares";
import { requireSharedLogSnapshot } from "@/lib/shared-log-routing";
import type { BattleLog } from "@/types/index";

type SharedLogPageProps = {
  params: Promise<{
    token: string;
  }>;
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

function formatExpiry(value: string) {
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
  const { token } = await params;
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

export default async function SharedLogPage({ params }: SharedLogPageProps) {
  const { token } = await params;
  const sharedLog = requireSharedLogSnapshot(await getSharedLogSnapshot(token), notFound);

  const timestampLabel = formatImportedAt(
    sharedLog.payload.log.importedAt || sharedLog.createdAt
  );
  const expiryLabel = formatExpiry(sharedLog.expiresAt);
  const linkedDeckListSortedCards =
    sharedLog.payload.linkedDeckListSortedCards &&
    sharedLog.payload.linkedDeckListSortedCards.length > 0
      ? sharedLog.payload.linkedDeckListSortedCards
      : sharedLog.payload.linkedDeckListRawList?.trim()
        ? sortDeckListCardsLocally(parseDeckList(sharedLog.payload.linkedDeckListRawList))
        : [];

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <PageHeader
          breadcrumb={[{ label: "Poke Notes", href: "/" }, { label: "Shared Battle Log" }]}
          title="Shared Battle Log"
        />

        <BattleLogDetailView
          linkedDeckListFormat={sharedLog.payload.linkedDeckListFormat}
          linkedDeckListName={sharedLog.payload.linkedDeckListName}
          linkedDeckListNotes={sharedLog.payload.linkedDeckListNotes}
          linkedDeckListRawList={sharedLog.payload.linkedDeckListRawList}
          linkedDeckListSortedCards={linkedDeckListSortedCards}
          linkedStrategyLabel={sharedLog.payload.linkedStrategyLabel}
          log={sharedLog.payload.log}
          notice={
            <div className="rounded-[20px] border border-[rgba(43,109,246,0.14)] bg-[linear-gradient(180deg,var(--bg-surface),rgba(43,109,246,0.08))] px-4 py-3 text-sm leading-6 text-card-foreground shadow-[var(--shadow-sm)]">
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
