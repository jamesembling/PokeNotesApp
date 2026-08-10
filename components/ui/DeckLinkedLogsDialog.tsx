"use client";

import { useEffect, useState } from "react";
import { loadDeckLinkedLogsAction } from "@/app/(app)/decks/actions";
import { Button } from "@/components/shadcn/button";
import {
  Dialog,
  DialogTrigger
} from "@/components/shadcn/dialog";
import { AppDialogContent, AppDialogHeader } from "@/components/ui/AppDialog";
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
    if (!isOpen || logs.length > 0) {
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
  }, [deckId, isOpen, logs.length]);

  return (
    <Dialog onOpenChange={setIsOpen} open={isOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Show all linked logs</Button>
      </DialogTrigger>

      <AppDialogContent
        size="xl"
        showMobileCloseButton
        showCloseButton={false}
      >
            <AppDialogHeader
              description={isLoading
                ? "Loading linked battle logs..."
                : `${logs.length} linked battle log${logs.length === 1 ? "" : "s"} for this deck.`}
              descriptionClassName="text-foreground"
              descriptionHidden={false}
              eyebrow="Battle Logs"
              title="All linked logs"
            />

            <div className="min-w-0 flex-1 touch-pan-y overflow-y-auto overflow-x-hidden overscroll-contain px-6 py-5 pr-8 [-webkit-overflow-scrolling:touch] [scrollbar-gutter:stable] lg:px-8 lg:pr-10">
              {error ? (
                <p className="text-sm text-loss-strong">{error}</p>
              ) : isLoading ? (
                <div className="flex flex-col gap-3" role="status">
                  <div className="h-24 rounded-[20px] border border-border bg-muted" />
                  <div className="h-24 rounded-[20px] border border-border bg-muted" />
                  <div className="h-24 rounded-[20px] border border-border bg-muted" />
                </div>
              ) : (
                <div className="flex min-w-0 flex-col gap-3">
                  {logs.map((log) => (
                    <LogRow key={log.id} log={log} />
                  ))}
                </div>
              )}
            </div>
      </AppDialogContent>
    </Dialog>
  );
}
