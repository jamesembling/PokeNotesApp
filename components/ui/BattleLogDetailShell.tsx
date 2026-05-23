"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { BattleLogActionTagOverrides } from "@/lib/battle-log/action-tags";
import { BattleLogDetailView } from "@/components/ui/BattleLogDetailView";
import { Button } from "@/components/shadcn/button";
import { ButtonGroup } from "@/components/shadcn/button-group";
import type { ShareLinkState } from "@/components/ui/CopyShareLinkButton";
import { LazyImportLogButton } from "@/components/ui/LazyImportLogButton";
import { LazyEditLogButton } from "@/components/ui/LazyEditLogButton";
import { CopyShareLinkButton } from "@/components/ui/CopyShareLinkButton";
import { LinkedDeckListDialog } from "@/components/ui/LinkedDeckListPanel";
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
        <ButtonGroup className="max-w-full flex-wrap">
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
          <Button asChild className="hidden sm:inline-flex" variant="outline">
            <Link href="/logs" prefetch={false}>
              Back to Logs
            </Link>
          </Button>
        </ButtonGroup>
      }
      linkedStrategyLabel={deferredContext?.linkedStrategyLabel ?? linkedStrategyLabel}
      isBodyLoading={!deferredBody && !resolvedLog.rawLog && resolvedLog.sections.length === 0}
      log={resolvedLog}
      mobileNavigation={
        <ButtonGroup className="w-full sm:hidden">
          <Button asChild className="min-w-0 flex-1" variant="outline">
            <Link href="/logs" prefetch={false}>
              Back to Logs
            </Link>
          </Button>
          <LazyImportLogButton
            className="min-w-0 flex-1 justify-center"
            initialUserDecks={resolvedUserDecks}
            label="Import New Log"
          />
        </ButtonGroup>
      }
      timestampLabel={timestampLabel}
    />
  );
}
