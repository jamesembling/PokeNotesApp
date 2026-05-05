"use client";

import { useEffect, useState } from "react";
import { loadDeckLinkedLogsAction } from "@/app/(app)/decks/actions";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger
} from "@/components/shadcn/dialog";
import { LogRow } from "@/components/ui/LogRow";
import type { BattleLogSummary } from "@/types/index";

type DeckLinkedLogsDialogProps = {
  deckId: string;
};

export function DeckLinkedLogsDialog({ deckId }: DeckLinkedLogsDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [logs, setLogs] = useState<BattleLogSummary[]>([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || logs.length > 0 || isLoading) {
      return;
    }

    let isActive = true;
    setIsLoading(true);
    setError("");

    loadDeckLinkedLogsAction(deckId)
      .then((nextLogs) => {
        if (isActive) {
          setLogs(nextLogs);
        }
      })
      .catch(() => {
        if (isActive) {
          setError("Could not load the full linked log list right now.");
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [deckId, isLoading, isOpen, logs.length]);

  return (
    <Dialog onOpenChange={setIsOpen} open={isOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary">Show all linked logs</Button>
      </DialogTrigger>

      <DialogContent
        className="flex max-h-[calc(100dvh-2rem)] max-w-5xl min-w-0 flex-col overflow-hidden rounded-[28px] border border-[var(--border)] bg-[var(--bg-surface)] p-0 shadow-[var(--shadow-lg)] sm:max-w-5xl"
        showCloseButton={false}
      >
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-4 border-b border-[var(--border)] px-6 py-5 lg:px-8">
              <div className="min-w-0 space-y-2">
                <p className="ui-eyebrow">Battle Logs</p>
                <DialogTitle className="text-[1.45rem] font-bold tracking-[-0.04em] text-[var(--text-primary)] sm:text-[1.8rem]">
                  All linked logs
                </DialogTitle>
                <DialogDescription className="text-sm text-[var(--text-secondary)]">
                  {isLoading
                    ? "Loading linked battle logs..."
                    : `${logs.length} linked battle log${logs.length === 1 ? "" : "s"} for this deck.`}
                </DialogDescription>
              </div>

              <Button onClick={() => setIsOpen(false)} variant="secondary">
                Close
              </Button>
            </div>

            <div className="min-w-0 flex-1 touch-pan-y overflow-y-auto overflow-x-hidden overscroll-contain px-6 py-5 pr-8 [-webkit-overflow-scrolling:touch] [scrollbar-gutter:stable] lg:px-8 lg:pr-10">
              {error ? (
                <p className="text-sm text-[var(--color-loss)]">{error}</p>
              ) : isLoading ? (
                <div className="flex flex-col gap-3" role="status">
                  <div className="h-24 rounded-[20px] border border-[var(--border)] bg-[var(--bg-surface-alt)]" />
                  <div className="h-24 rounded-[20px] border border-[var(--border)] bg-[var(--bg-surface-alt)]" />
                  <div className="h-24 rounded-[20px] border border-[var(--border)] bg-[var(--bg-surface-alt)]" />
                </div>
              ) : (
                <div className="flex min-w-0 flex-col gap-3">
                  {logs.map((log) => (
                    <LogRow key={log.id} log={log} />
                  ))}
                </div>
              )}
            </div>
      </DialogContent>
    </Dialog>
  );
}
