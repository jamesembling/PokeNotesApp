"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { revokeLogShareAction } from "@/app/(app)/logs/actions";
import type { BattleLogActionTagOverrides } from "@/lib/battle-log/action-tags";
import { BattleLogDetailView } from "@/components/ui/BattleLogDetailView";
import { Button } from "@/components/ui/Button";
import type { ShareLinkState } from "@/components/ui/CopyShareLinkButton";
import { LazyImportLogButton } from "@/components/ui/LazyImportLogButton";
import { LazyEditLogButton } from "@/components/ui/LazyEditLogButton";
import { CopyShareLinkButton } from "@/components/ui/CopyShareLinkButton";
import type { BattleLog, DeckCard, DeckSelectionOption } from "@/types/index";

type ShareTone = "success" | "info" | "error";

type ShareFeedback = {
  tone: ShareTone;
  text: string;
};

type BattleLogDetailShellProps = {
  activeShare?: ShareLinkState | null;
  actionTagOverrides?: BattleLogActionTagOverrides;
  linkedDeckId?: string;
  linkedDeckListFormat?: string;
  linkedDeckListId?: string;
  linkedDeckListName?: string;
  linkedDeckListNotes?: string;
  linkedDeckListRawList?: string;
  linkedDeckListSortedCards?: DeckCard[];
  linkedStrategyLabel: string;
  log: BattleLog;
  timestampLabel: string;
  userDecks: DeckSelectionOption[];
};

type LogDetailContextResponse = {
  activeShare?: ShareLinkState | null;
  linkedDeckId?: string;
  linkedDeckListFormat?: string;
  linkedDeckListId?: string;
  linkedDeckListName?: string;
  linkedDeckListNotes?: string;
  linkedDeckListRawList?: string;
  linkedDeckListSortedCards?: DeckCard[];
  linkedStrategyLabel?: string;
  userDecks?: DeckSelectionOption[];
};

type LogDetailBodyResponse = {
  actionTagOverrides?: BattleLogActionTagOverrides;
  rawLog?: string;
  sections?: BattleLog["sections"];
};

const backLinkClassName =
  "inline-flex items-center justify-center px-1 py-2 text-sm font-medium text-[var(--text-muted)] transition hover:text-[var(--color-brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-page)]";

const mobileBackLinkClassName =
  "ui-control-text inline-flex min-w-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-2 text-center text-[var(--text-secondary)] transition hover:bg-[var(--bg-surface-alt)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-page)]";

const feedbackClassName: Record<ShareTone, string> = {
  success:
    "rounded-[18px] border border-[rgba(31,138,98,0.22)] bg-[linear-gradient(180deg,rgba(31,138,98,0.18),rgba(31,138,98,0.1))] px-4 py-3 text-sm font-semibold text-[var(--color-win)] shadow-[var(--shadow-sm)]",
  info:
    "rounded-[18px] border border-[var(--border)] bg-[var(--bg-surface-alt)] px-4 py-3 text-sm font-semibold text-[var(--text-muted)] shadow-[var(--shadow-sm)]",
  error:
    "rounded-[18px] border border-[rgba(213,87,75,0.22)] bg-[linear-gradient(180deg,rgba(213,87,75,0.18),rgba(213,87,75,0.1))] px-4 py-3 text-sm font-semibold text-[var(--color-loss)] shadow-[var(--shadow-sm)]"
};

export function BattleLogDetailShell({
  activeShare = null,
  actionTagOverrides,
  linkedDeckId,
  linkedDeckListFormat,
  linkedDeckListId,
  linkedDeckListName,
  linkedDeckListNotes,
  linkedDeckListRawList,
  linkedDeckListSortedCards,
  linkedStrategyLabel,
  log,
  timestampLabel,
  userDecks
}: BattleLogDetailShellProps) {
  const [currentShare, setCurrentShare] = useState<ShareLinkState | null>(activeShare);
  const [shareFeedback, setShareFeedback] = useState<ShareFeedback | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);
  const [deferredContext, setDeferredContext] = useState<LogDetailContextResponse | null>(null);
  const [deferredBody, setDeferredBody] = useState<LogDetailBodyResponse | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadDeferredContext() {
      try {
        const response = await fetch(`/api/log-detail-context?id=${encodeURIComponent(log.id)}`, {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as LogDetailContextResponse;
        setDeferredContext(payload);

        if (payload.activeShare !== undefined) {
          setCurrentShare(payload.activeShare);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
      }
    }

    void loadDeferredContext();

    return () => {
      controller.abort();
    };
  }, [log.id]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadDeferredBody() {
      try {
        const response = await fetch(`/api/log-detail-body?id=${encodeURIComponent(log.id)}`, {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as LogDetailBodyResponse;
        setDeferredBody(payload);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
      }
    }

    void loadDeferredBody();

    return () => {
      controller.abort();
    };
  }, [log.id]);

  const resolvedUserDecks = useMemo(
    () => deferredContext?.userDecks ?? userDecks,
    [deferredContext?.userDecks, userDecks]
  );
  const resolvedLog = useMemo(
    () => ({
      ...log,
      rawLog: deferredBody?.rawLog ?? log.rawLog,
      sections: deferredBody?.sections ?? log.sections
    }),
    [deferredBody?.rawLog, deferredBody?.sections, log]
  );

  async function handleRevoke() {
    if (!currentShare) {
      return;
    }

    setIsRevoking(true);

    try {
      await revokeLogShareAction(currentShare.shareId);
      setCurrentShare(null);
      setShareFeedback({
        tone: "success",
        text: "Share link revoked. The previous URL stops working immediately."
      });
    } catch (error) {
      setShareFeedback({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Could not revoke this share link right now."
      });
    } finally {
      setIsRevoking(false);
    }
  }

  return (
    <BattleLogDetailView
      actionTagOverrides={deferredBody?.actionTagOverrides ?? actionTagOverrides}
      actions={
        <>
          <LazyEditLogButton log={log} userDecks={resolvedUserDecks} />
          <CopyShareLinkButton
            initialShare={currentShare}
            logId={log.id}
            onFeedbackChange={setShareFeedback}
            onShareReady={setCurrentShare}
          />
          {currentShare ? (
            <Button disabled={isRevoking} onClick={handleRevoke} type="button" variant="ghost">
              {isRevoking ? "Revoking..." : "Revoke Link"}
            </Button>
          ) : null}
          <Link className={`${backLinkClassName} hidden sm:inline-flex`} href="/logs" prefetch={false}>
            Back to Logs
          </Link>
        </>
      }
      linkedDeckId={deferredContext?.linkedDeckId ?? linkedDeckId}
      linkedDeckListFormat={deferredContext?.linkedDeckListFormat ?? linkedDeckListFormat}
      linkedDeckListId={deferredContext?.linkedDeckListId ?? linkedDeckListId}
      linkedDeckListName={deferredContext?.linkedDeckListName ?? linkedDeckListName}
      linkedDeckListNotes={deferredContext?.linkedDeckListNotes ?? linkedDeckListNotes}
      linkedDeckListRawList={deferredContext?.linkedDeckListRawList ?? linkedDeckListRawList}
      linkedDeckListSortedCards={
        deferredContext?.linkedDeckListSortedCards ?? linkedDeckListSortedCards
      }
      linkedStrategyLabel={deferredContext?.linkedStrategyLabel ?? linkedStrategyLabel}
      isBodyLoading={!deferredBody}
      log={resolvedLog}
      mobileNavigation={
        <div className="grid grid-cols-2 gap-3 sm:hidden">
          <Link className={mobileBackLinkClassName} href="/logs" prefetch={false}>
            Back to Logs
          </Link>
          <LazyImportLogButton
            className="w-full justify-center"
            initialUserDecks={resolvedUserDecks}
            label="Import New Log"
          />
        </div>
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
