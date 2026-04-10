"use client";

import Link from "next/link";
import { useState } from "react";
import { BattleLogDetailView } from "@/components/ui/BattleLogDetailView";
import { CopyShareLinkButton } from "@/components/ui/CopyShareLinkButton";
import { LazyEditLogButton } from "@/components/ui/LazyEditLogButton";
import type { BattleLog, DeckCard, DeckSummary } from "@/types/index";

type ShareTone = "success" | "info" | "error";

type ShareFeedback = {
  tone: ShareTone;
  text: string;
};

type BattleLogDetailShellProps = {
  linkedDeckId?: string;
  linkedDeckListFormat?: string;
  linkedDeckListId?: string;
  linkedDeckListName?: string;
  linkedDeckListNotes?: string;
  linkedDeckListSortedCards?: DeckCard[];
  linkedStrategyLabel: string;
  log: BattleLog;
  timestampLabel: string;
  userDecks: DeckSummary[];
};

const backLinkClassName =
  "inline-flex items-center justify-center px-1 py-2 text-sm font-medium text-[var(--text-muted)] transition hover:text-[var(--color-brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-page)]";

const mobileBackLinkClassName =
  "inline-flex items-center justify-center px-1 py-1 text-sm font-medium text-[var(--text-muted)] transition hover:text-[var(--color-brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-page)]";

const feedbackClassName: Record<ShareTone, string> = {
  success:
    "rounded-[18px] border border-[rgba(31,138,98,0.22)] bg-[linear-gradient(180deg,rgba(31,138,98,0.18),rgba(31,138,98,0.1))] px-4 py-3 text-sm font-semibold text-[var(--color-win)] shadow-[var(--shadow-sm)]",
  info:
    "rounded-[18px] border border-[var(--border)] bg-[var(--bg-surface-alt)] px-4 py-3 text-sm font-semibold text-[var(--text-muted)] shadow-[var(--shadow-sm)]",
  error:
    "rounded-[18px] border border-[rgba(213,87,75,0.22)] bg-[linear-gradient(180deg,rgba(213,87,75,0.18),rgba(213,87,75,0.1))] px-4 py-3 text-sm font-semibold text-[var(--color-loss)] shadow-[var(--shadow-sm)]"
};

export function BattleLogDetailShell({
  linkedDeckId,
  linkedDeckListFormat,
  linkedDeckListId,
  linkedDeckListName,
  linkedDeckListNotes,
  linkedDeckListSortedCards,
  linkedStrategyLabel,
  log,
  timestampLabel,
  userDecks
}: BattleLogDetailShellProps) {
  const [shareFeedback, setShareFeedback] = useState<ShareFeedback | null>(null);

  return (
    <BattleLogDetailView
      actions={
        <>
          <LazyEditLogButton log={log} userDecks={userDecks} />
          <CopyShareLinkButton logId={log.id} onFeedbackChange={setShareFeedback} />
          <Link className={`${backLinkClassName} hidden sm:inline-flex`} href="/logs">
            Back to Logs
          </Link>
        </>
      }
      linkedDeckId={linkedDeckId}
      linkedDeckListFormat={linkedDeckListFormat}
      linkedDeckListId={linkedDeckListId}
      linkedDeckListName={linkedDeckListName}
      linkedDeckListNotes={linkedDeckListNotes}
      linkedDeckListSortedCards={linkedDeckListSortedCards}
      linkedStrategyLabel={linkedStrategyLabel}
      log={log}
      mobileNavigation={
        <Link className={mobileBackLinkClassName} href="/logs">
          Back to Logs
        </Link>
      }
      notice={
        shareFeedback ? (
          <p className={feedbackClassName[shareFeedback.tone]}>{shareFeedback.text}</p>
        ) : null
      }
      timestampLabel={timestampLabel}
    />
  );
}
