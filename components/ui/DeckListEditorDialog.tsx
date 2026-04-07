"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { saveDeckListAction } from "@/app/(app)/decks/actions";
import { Button } from "@/components/ui/Button";
import { summarizeDeckList } from "@/lib/decks/deck-list-parse";
import { DECK_FORMAT_OPTIONS, getDefaultDeckFormat } from "@/lib/decks/formats";
import type { DeckList } from "@/types/index";

type DeckListEditorDialogProps = {
  deckId: string;
  deckList?: DeckList;
  defaultFormat?: string;
  defaultCreatedBy: string;
  triggerLabel: string;
  triggerVariant?: "primary" | "secondary" | "ghost";
};

function SaveButton({ isEditing }: { isEditing: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button disabled={pending} type="submit">
      {pending ? "Saving..." : isEditing ? "Save Deck List" : "Add Deck List"}
    </Button>
  );
}

function formatSummaryLabel(rawList: string) {
  const summary = summarizeDeckList(rawList);
  if (summary.total === null) {
    return "Count unknown";
  }

  return `${summary.total} cards`;
}

function formatSummaryMessage(rawList: string) {
  const summary = summarizeDeckList(rawList);
  if (summary.total === null) {
    return "Paste a Limitless-style list with counts to preview the total.";
  }

  if (summary.total === 60) {
    return "Detected a complete 60-card list.";
  }

  return `This list currently totals ${summary.total} cards.`;
}

function getSummaryTone(rawList: string) {
  const summary = summarizeDeckList(rawList);
  if (summary.total === null) {
    return "muted";
  }

  return summary.total === 60 ? "success" : "warning";
}

export function DeckListEditorDialog({
  deckId,
  deckList,
  defaultFormat,
  defaultCreatedBy,
  triggerLabel,
  triggerVariant = "secondary"
}: DeckListEditorDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [rawList, setRawList] = useState(deckList?.rawList ?? "");
  const isEditing = Boolean(deckList?.id);

  const summaryTone = useMemo(() => getSummaryTone(rawList), [rawList]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  function openDialog() {
    setRawList(deckList?.rawList ?? "");
    setIsOpen(true);
  }

  function closeDialog() {
    setIsOpen(false);
    setRawList(deckList?.rawList ?? "");
  }

  return (
    <>
      <Button onClick={openDialog} variant={triggerVariant}>
        {triggerLabel}
      </Button>

      {isOpen ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 bg-[var(--bg-overlay)] p-4"
          onClick={closeDialog}
          role="dialog"
        >
          <div
            className="mx-auto flex max-h-[calc(100vh-2rem)] w-full max-w-4xl flex-col overflow-y-auto rounded-[28px] border border-[var(--border)] bg-[var(--bg-surface)] p-6 shadow-[var(--shadow-lg)] lg:p-8"
            onClick={(event) => event.stopPropagation()}
          >
            <form action={saveDeckListAction} className="flex flex-col gap-6">
              <div className="mb-2 flex flex-col gap-4 border-b border-[var(--border)] pb-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h2 className="text-[1.55rem] font-bold tracking-[-0.05em] text-[var(--text-primary)] sm:text-[1.9rem]">
                    {isEditing ? "Edit Deck List" : "New Deck List"}
                  </h2>
                </div>
                <div className="flex flex-wrap gap-2.5">
                  <Button onClick={closeDialog} type="button" variant="secondary">
                    Close
                  </Button>
                  <SaveButton isEditing={isEditing} />
                </div>
              </div>

              <input name="deckId" type="hidden" value={deckId} />
              <input name="deckListId" type="hidden" value={deckList?.id ?? ""} />
              <input name="createdAt" type="hidden" value={deckList?.createdAt ?? ""} />
              <input name="redirectTo" type="hidden" value={`/decks/${deckId}`} />

              <section className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[var(--text-muted)]">List name</span>
                  <input
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface-alt)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/20"
                    defaultValue={deckList?.name ?? ""}
                    name="name"
                    required
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[var(--text-muted)]">Format</span>
                  <select
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface-alt)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/20"
                    defaultValue={deckList?.format || defaultFormat || getDefaultDeckFormat()}
                    name="format"
                  >
                    {DECK_FORMAT_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[var(--text-muted)]">Date</span>
                  <input
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface-alt)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/20"
                    defaultValue={deckList?.date ?? ""}
                    name="date"
                    type="date"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[var(--text-muted)]">
                    Created by
                  </span>
                  <input
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface-alt)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/20"
                    defaultValue={deckList?.createdBy || defaultCreatedBy}
                    name="createdBy"
                  />
                </label>

                <label className="grid gap-2 md:col-span-2">
                  <span className="text-sm font-semibold text-[var(--text-muted)]">Notes</span>
                  <textarea
                    className="min-h-[100px] w-full rounded-xl border border-[var(--border)] bg-[var(--bg-surface-alt)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/20"
                    defaultValue={deckList?.notes ?? ""}
                    name="notes"
                  />
                </label>
              </section>

              <section className="grid gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={[
                      "inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold",
                      summaryTone === "success"
                        ? "bg-[rgba(31,138,98,0.14)] text-[var(--color-win-strong)]"
                        : summaryTone === "warning"
                          ? "bg-[rgba(213,87,75,0.12)] text-[var(--color-loss)]"
                          : "bg-[var(--bg-surface-alt)] text-[var(--text-muted)]"
                    ].join(" ")}
                  >
                    {formatSummaryLabel(rawList)}
                  </span>
                  <span className="text-sm text-[var(--text-muted)]">
                    {formatSummaryMessage(rawList)}
                  </span>
                </div>

                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[var(--text-muted)]">Deck list</span>
                  <textarea
                    className="min-h-[320px] w-full rounded-xl border border-[var(--border)] bg-[var(--bg-surface-alt)] px-4 py-3 font-mono text-[0.95rem] leading-6 text-[var(--text-primary)] outline-none transition focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/20"
                    defaultValue={deckList?.rawList ?? ""}
                    name="rawList"
                    onChange={(event) => setRawList(event.target.value)}
                    required
                    spellCheck={false}
                  />
                </label>
              </section>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
