"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { BattleLogActionTagOverrides } from "@/lib/battle-log/action-tags";
import { BattleLogDetailView } from "@/components/ui/BattleLogDetailView";
import { Button } from "@/components/shadcn/button";
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

const feedbackClassName: Record<ShareTone, string> = {
  success:
    "rounded-[18px] border border-[rgba(31,138,98,0.22)] bg-[linear-gradient(180deg,rgba(31,138,98,0.18),rgba(31,138,98,0.1))] px-4 py-3 text-sm font-semibold text-[var(--color-win)] shadow-[var(--shadow-sm)]",
  info:
    "rounded-[18px] border border-border bg-muted px-4 py-3 text-sm font-semibold text-muted-foreground shadow-[var(--shadow-sm)]",
  error:
    "rounded-[18px] border border-[rgba(213,87,75,0.22)] bg-[linear-gradient(180deg,rgba(213,87,75,0.18),rgba(213,87,75,0.1))] px-4 py-3 text-sm font-semibold text-[var(--color-loss)] shadow-[var(--shadow-sm)]"
};

async function revokeLogShare(shareId: string) {
  const response = await fetch(`/api/log-shares?shareId=${encodeURIComponent(shareId)}`, {
    cache: "no-store",
    credentials: "same-origin",
    method: "DELETE"
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error || "Could not revoke this share link right now.");
  }
}

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
    performance.mark("logs-detail-summary-visible");
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;
    let idleCallbackId: number | null = null;

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

    const scheduleContextLoad = () => {
      void loadDeferredContext();
    };

    if ("requestIdleCallback" in window) {
      idleCallbackId = window.requestIdleCallback(scheduleContextLoad, { timeout: 2000 });
    } else {
      timeoutId = globalThis.setTimeout(scheduleContextLoad, 1000);
    }

    return () => {
      if (idleCallbackId !== null) {
        window.cancelIdleCallback(idleCallbackId);
      }
      if (timeoutId !== null) {
        globalThis.clearTimeout(timeoutId);
      }
      controller.abort();
    };
  }, [log.id]);

  useEffect(() => {
    if (log.rawLog || log.sections.length > 0) {
      performance.mark("logs-detail-body-visible");
      return;
    }

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
        performance.mark("logs-detail-body-visible");
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
  }, [log.id, log.rawLog, log.sections.length]);

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
      await revokeLogShare(currentShare.shareId);
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
          <Button
            asChild
            className="hidden h-auto px-1 py-2 text-muted-foreground hover:bg-transparent hover:text-primary sm:inline-flex"
            variant="ghost"
          >
            <Link href="/logs" prefetch={false}>
              Back to Logs
            </Link>
          </Button>
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
      isBodyLoading={!deferredBody && !resolvedLog.rawLog && resolvedLog.sections.length === 0}
      log={resolvedLog}
      mobileNavigation={
        <div className="grid grid-cols-2 gap-3 sm:hidden">
          <Button asChild className="min-w-0" variant="outline">
            <Link href="/logs" prefetch={false}>
              Back to Logs
            </Link>
          </Button>
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
