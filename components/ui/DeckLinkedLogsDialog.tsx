"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useBodyScrollLock } from "@/lib/client/use-body-scroll-lock";
import { LogRow } from "@/components/ui/LogRow";
import type { BattleLogSummary } from "@/types/index";

type DeckLinkedLogsDialogProps = {
  logs: BattleLogSummary[];
};

export function DeckLinkedLogsDialog({ logs }: DeckLinkedLogsDialogProps) {
  const [isOpen, setIsOpen] = useState(false);

  useBodyScrollLock(isOpen);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <>
      <Button onClick={() => setIsOpen(true)} variant="secondary">
        Show all linked logs
      </Button>

      {isOpen ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 overflow-x-hidden bg-[var(--bg-overlay)] p-4"
          onClick={() => setIsOpen(false)}
          role="dialog"
        >
          <div
            className="mx-auto flex max-h-[calc(100vh-2rem)] w-full max-w-5xl min-w-0 flex-col overflow-hidden rounded-[28px] border border-[var(--border)] bg-[var(--bg-surface)] shadow-[var(--shadow-lg)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-4 border-b border-[var(--border)] px-6 py-5 lg:px-8">
              <div className="min-w-0 space-y-2">
                <p className="ui-eyebrow">Battle Logs</p>
                <h2 className="text-[1.45rem] font-bold tracking-[-0.04em] text-[var(--text-primary)] sm:text-[1.8rem]">
                  All linked logs
                </h2>
                <p className="text-sm text-[var(--text-secondary)]">
                  {logs.length} linked battle log{logs.length === 1 ? "" : "s"} for this deck.
                </p>
              </div>

              <Button onClick={() => setIsOpen(false)} variant="secondary">
                Close
              </Button>
            </div>

            <div className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-6 py-5 pr-8 [scrollbar-gutter:stable] lg:px-8 lg:pr-10">
              <div className="flex min-w-0 flex-col gap-3">
                {logs.map((log) => (
                  <LogRow key={log.id} log={log} />
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
