"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ExportIcon } from "@phosphor-icons/react";
import { PencilIcon } from "lucide-react";
import type { BattleLogActionTagOverrides } from "@/lib/battle-log/action-tags";
import { BattleLogDetailView } from "@/components/ui/BattleLogDetailView";
import { Button } from "@/components/shadcn/button";
import type { ShareLinkState } from "@/components/ui/CopyShareLinkButton";
import { LazyEditLogButton } from "@/components/ui/LazyEditLogButton";
import { CopyShareLinkButton } from "@/components/ui/CopyShareLinkButton";
import { LinkedDeckListDialog } from "@/components/ui/LinkedDeckListPanel";
import { PageActions } from "@/components/ui/PageActions";
import type { BattleLog, DeckCard, DeckSelectionOption } from "@/types/index";

type BattleLogDetailShellProps = {
  activeShare?: ShareLinkState | null;
  actionTagOverrides?: BattleLogActionTagOverrides;
  linkedDeckId?: string;
  linkedDeckListName?: string;
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

export function BattleLogDetailShell({
  activeShare = null,
  actionTagOverrides,
  linkedDeckId,
  linkedDeckListName,
  linkedDeckListRawList,
  linkedDeckListSortedCards,
  linkedStrategyLabel,
  log,
  timestampLabel,
  userDecks
}: BattleLogDetailShellProps) {
  const [currentShare, setCurrentShare] = useState<ShareLinkState | null>(activeShare);
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
  const resolvedLinkedDeckId = deferredContext?.linkedDeckId ?? linkedDeckId;
  const resolvedLinkedDeckListName = deferredContext?.linkedDeckListName ?? linkedDeckListName;
  const resolvedLinkedDeckListRawList = deferredContext?.linkedDeckListRawList ?? linkedDeckListRawList;
  const resolvedLinkedDeckListSortedCards =
    deferredContext?.linkedDeckListSortedCards ?? linkedDeckListSortedCards;

  return (
    <BattleLogDetailView
      actionTagOverrides={deferredBody?.actionTagOverrides ?? actionTagOverrides}
      actions={
        <>
          <PageActions className="sm:hidden">
            <LazyEditLogButton
              log={log}
              trigger={
                <Button className="min-w-0 px-3">
                  <PencilIcon className="size-4" />
                  <span>Edit</span>
                </Button>
              }
              userDecks={resolvedUserDecks}
            />
            <CopyShareLinkButton
              ariaLabel="Share Log"
              className="min-w-0 px-3 text-primary hover:border-primary hover:bg-background hover:text-primary"
              initialShare={currentShare}
              logId={log.id}
              onShareReady={setCurrentShare}
              variant="outline"
            >
              <ExportIcon className="size-5" weight="bold" />
              <span className="sr-only">Share Log</span>
            </CopyShareLinkButton>
          </PageActions>

          <PageActions className="hidden sm:flex">
            <LazyEditLogButton log={log} userDecks={resolvedUserDecks} />
            <CopyShareLinkButton
              initialShare={currentShare}
              logId={log.id}
              onShareReady={setCurrentShare}
            />
            {resolvedLinkedDeckListName ? (
              <LinkedDeckListDialog
                deckId={resolvedLinkedDeckId}
                deckListName={resolvedLinkedDeckListName}
                rawList={resolvedLinkedDeckListRawList}
                sortedCards={resolvedLinkedDeckListSortedCards ?? []}
              />
            ) : null}
            <Button asChild variant="outline">
              <Link href="/logs" prefetch={false}>
                Back to Logs
              </Link>
            </Button>
          </PageActions>
        </>
      }
      linkedStrategyLabel={deferredContext?.linkedStrategyLabel ?? linkedStrategyLabel}
      isBodyLoading={!deferredBody && !resolvedLog.rawLog && resolvedLog.sections.length === 0}
      log={resolvedLog}
      timestampLabel={timestampLabel}
    />
  );
}
