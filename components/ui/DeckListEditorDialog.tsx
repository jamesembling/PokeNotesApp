"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { saveDeckListAction } from "@/app/(app)/decks/actions";
import { Button } from "@/components/ui/Button";
import { useBodyScrollLock } from "@/lib/client/use-body-scroll-lock";
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

type SaveState = "idle" | "saving" | "success";

const SUCCESS_CLOSE_DELAY_MS = 650;

function SaveButton({
  isEditing,
  onClick,
  saveState
}: {
  isEditing: boolean;
  onClick: () => void;
  saveState: SaveState;
}) {
  const isSaving = saveState === "saving";
  const isSuccess = saveState === "success";

  return (
    <Button
      aria-disabled={isSaving || isSuccess}
      className={
        isSuccess
          ? "w-[130px] shrink-0 pointer-events-none bg-[var(--color-win-strong)] text-[var(--text-inverse)] opacity-100 hover:bg-[var(--color-win-strong)]"
          : isSaving
            ? "w-[130px] shrink-0 pointer-events-none"
            : "w-[130px] shrink-0"
      }
      disabled={isSaving}
      onClick={onClick}
      type="button"
    >
      {isSaving
        ? "Saving..."
        : isSuccess
          ? "Saved"
          : isEditing
            ? "Save Deck List"
            : "Add Deck List"}
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

function normalizeRedirectPath(value: string) {
  return value.split("?")[0] || value;
}

export function DeckListEditorDialog({
  deckId,
  deckList,
  defaultFormat,
  defaultCreatedBy,
  triggerLabel,
  triggerVariant = "secondary"
}: DeckListEditorDialogProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [rawList, setRawList] = useState(deckList?.rawList ?? "");
  const [saveError, setSaveError] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const closeTimerRef = useRef<number | null>(null);
  const navigationTimerRef = useRef<number | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const isEditing = Boolean(deckList?.id);

  const summaryTone = useMemo(() => getSummaryTone(rawList), [rawList]);

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

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }

      if (navigationTimerRef.current !== null) {
        window.clearTimeout(navigationTimerRef.current);
      }
    };
  }, []);

  function clearCloseTimer() {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }

  function clearNavigationTimer() {
    if (navigationTimerRef.current !== null) {
      window.clearTimeout(navigationTimerRef.current);
      navigationTimerRef.current = null;
    }
  }

  function openDialog() {
    clearCloseTimer();
    clearNavigationTimer();
    setSaveError("");
    setSaveState("idle");
    setRawList(deckList?.rawList ?? "");
    setIsOpen(true);
  }

  function closeDialog() {
    clearCloseTimer();
    clearNavigationTimer();
    setIsOpen(false);
    setSaveError("");
    setSaveState("idle");
    setRawList(deckList?.rawList ?? "");
  }

  async function handleSubmit(formData: FormData) {
    setSaveError("");
    setSaveState("saving");

    try {
      const result = await saveDeckListAction(formData);
      setSaveState("success");

      clearCloseTimer();
      closeTimerRef.current = window.setTimeout(() => {
        setIsOpen(false);
        clearNavigationTimer();
        navigationTimerRef.current = window.setTimeout(() => {
          setSaveError("");
          setSaveState("idle");
          setRawList(deckList?.rawList ?? "");

          if (normalizeRedirectPath(result.redirectTo) === pathname) {
            router.refresh();
            return;
          }

          router.push(result.redirectTo);
        }, 50);
      }, SUCCESS_CLOSE_DELAY_MS);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save this deck list.");
      setSaveState("idle");
    }
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
            className="mx-auto flex max-h-[calc(100vh-2rem)] w-full max-w-4xl flex-col overflow-hidden rounded-[28px] border border-[var(--border)] bg-[var(--bg-surface)] p-3 shadow-[var(--shadow-lg)] sm:p-4 lg:p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="min-h-0 flex-1 overflow-y-auto pr-1 [scrollbar-gutter:stable] sm:pr-2">
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
                <SaveButton
                  isEditing={isEditing}
                  onClick={() => formRef.current?.requestSubmit()}
                  saveState={saveState}
                />
              </div>
            </div>
            <form
              className="flex flex-col gap-6"
              onSubmit={(event) => {
                event.preventDefault();
                void handleSubmit(new FormData(event.currentTarget));
              }}
              ref={formRef}
            >
              <input name="deckId" type="hidden" value={deckId} />
              <input name="deckListId" type="hidden" value={deckList?.id ?? ""} />
              <input name="createdAt" type="hidden" value={deckList?.createdAt ?? ""} />
              <input name="redirectTo" type="hidden" value={pathname} />

              {saveError ? (
                <p className="rounded-xl border border-[var(--color-loss-border)] bg-[var(--color-loss-bg)] px-4 py-3 text-sm text-[var(--color-loss)]">
                  {saveError}
                </p>
              ) : null}

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
        </div>
      ) : null}
    </>
  );
}
