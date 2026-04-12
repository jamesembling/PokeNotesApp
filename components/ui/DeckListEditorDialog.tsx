"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { saveDeckListAction } from "@/app/(app)/decks/actions";
import { Button } from "@/components/ui/Button";
import { DeckListVisualGrid } from "@/components/ui/DeckListVisualGrid";
import { useSiteFormats } from "@/components/ui/SiteFormatsProvider";
import { useBodyScrollLock } from "@/lib/client/use-body-scroll-lock";
import { parseDeckList, summarizeDeckList } from "@/lib/decks/deck-list-parse";
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
type DialogStep = "list" | "details";

const SUCCESS_CLOSE_DELAY_MS = 650;

function SaveButton({
  disabled = false,
  isEditing,
  onClick,
  saveState
}: {
  disabled?: boolean;
  isEditing: boolean;
  onClick: () => void;
  saveState: SaveState;
}) {
  const isSaving = saveState === "saving";
  const isSuccess = saveState === "success";
  const isDisabled = disabled || isSaving;

  return (
    <Button
      aria-disabled={isSaving || isSuccess}
      className={
        isSuccess
          ? "w-full whitespace-nowrap pointer-events-none bg-[var(--color-win-strong)] text-[var(--text-inverse)] opacity-100 hover:bg-[var(--color-win-strong)] sm:w-auto sm:shrink-0"
          : isDisabled
            ? "w-full whitespace-nowrap pointer-events-none sm:w-auto sm:shrink-0"
            : "w-full whitespace-nowrap sm:w-auto sm:shrink-0"
      }
      disabled={isDisabled}
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
  const { defaultFormat: syncedDefaultFormat, options: siteFormatOptions } = useSiteFormats();
  const isEditing = Boolean(deckList?.id);

  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<DialogStep>("list");
  const [rawList, setRawList] = useState(deckList?.rawList ?? "");
  const [listName, setListName] = useState(deckList?.name ?? "");
  const [format, setFormat] = useState(
    deckList?.format || defaultFormat || syncedDefaultFormat
  );
  const [date, setDate] = useState(deckList?.date ?? "");
  const [createdBy, setCreatedBy] = useState(deckList?.createdBy || defaultCreatedBy);
  const [notes, setNotes] = useState(deckList?.notes ?? "");
  const [saveError, setSaveError] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const closeTimerRef = useRef<number | null>(null);
  const navigationTimerRef = useRef<number | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  const summary = useMemo(() => summarizeDeckList(rawList), [rawList]);
  const parsedCards = useMemo(() => parseDeckList(rawList), [rawList]);
  const summaryTone = useMemo(() => getSummaryTone(rawList), [rawList]);
  const hasDeckListText = rawList.trim().length > 0;
  const canContinueFromList = isEditing ? hasDeckListText : summary.total === 60;
  const canSave = hasDeckListText && listName.trim().length > 0;
  const formatOptions = useMemo(() => {
    const normalizedFormat = String(format || "").trim();
    if (!normalizedFormat) {
      return [...siteFormatOptions];
    }

    return siteFormatOptions.includes(normalizedFormat)
      ? [...siteFormatOptions]
      : [normalizedFormat, ...siteFormatOptions];
  }, [format, siteFormatOptions]);

  useBodyScrollLock(isOpen);

  useEffect(() => {
    if (deckList?.format) {
      return;
    }

    setFormat((current) => current || defaultFormat || syncedDefaultFormat);
  }, [deckList?.format, defaultFormat, syncedDefaultFormat]);

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

  useEffect(() => {
    if (!isOpen || isEditing || step !== "list") {
      return;
    }

    if (summary.total === 60) {
      setStep("details");
    }
  }, [isEditing, isOpen, step, summary.total]);

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
    setStep("list");
    setRawList(deckList?.rawList ?? "");
    setListName(deckList?.name ?? "");
    setFormat(deckList?.format || defaultFormat || syncedDefaultFormat);
    setDate(deckList?.date ?? "");
    setCreatedBy(deckList?.createdBy || defaultCreatedBy);
    setNotes(deckList?.notes ?? "");
    setIsOpen(true);
  }

  function closeDialog() {
    clearCloseTimer();
    clearNavigationTimer();
    setIsOpen(false);
    setSaveError("");
    setSaveState("idle");
    setStep("list");
    setRawList(deckList?.rawList ?? "");
    setListName(deckList?.name ?? "");
    setFormat(deckList?.format || defaultFormat || syncedDefaultFormat);
    setDate(deckList?.date ?? "");
    setCreatedBy(deckList?.createdBy || defaultCreatedBy);
    setNotes(deckList?.notes ?? "");
  }

  async function handleSubmit(formData: FormData) {
    if (step !== "details") {
      return;
    }

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
          setStep("list");
          setRawList(deckList?.rawList ?? "");
          setListName(deckList?.name ?? "");
          setFormat(deckList?.format || defaultFormat || syncedDefaultFormat);
          setDate(deckList?.date ?? "");
          setCreatedBy(deckList?.createdBy || defaultCreatedBy);
          setNotes(deckList?.notes ?? "");

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
          className="fixed inset-0 z-50 overflow-x-hidden bg-[var(--bg-overlay)] p-4"
          onClick={closeDialog}
          role="dialog"
        >
          <div
            className="mx-auto flex max-h-[calc(100dvh-2rem)] w-full max-w-4xl min-w-0 flex-col overflow-hidden rounded-[28px] border border-[var(--border)] bg-[var(--bg-surface)] p-3 shadow-[var(--shadow-lg)] sm:p-4 lg:p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="min-h-0 min-w-0 flex-1 touch-pan-y overflow-y-auto overflow-x-hidden overscroll-contain pr-1 [-webkit-overflow-scrolling:touch] [scrollbar-gutter:stable] sm:pr-2">
              <div className="mb-2 flex min-w-0 flex-col gap-4 border-b border-[var(--border)] pb-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <h2 className="text-[1.55rem] font-bold tracking-[-0.05em] text-[var(--text-primary)] sm:text-[1.9rem]">
                    {isEditing ? "Edit Deck List" : "New Deck List"}
                  </h2>
                  <p className="text-sm text-[var(--text-muted)]">
                    {step === "list" ? "Step 1 of 2 · Paste deck list" : "Step 2 of 2 · List details"}
                  </p>
                </div>
                <div className="flex w-full flex-wrap gap-2.5 sm:w-auto sm:flex-nowrap sm:justify-end">
                  <Button onClick={closeDialog} type="button" variant="secondary">
                    Close
                  </Button>
                  {step === "list" ? (
                    <Button
                      disabled={!canContinueFromList}
                      onClick={() => setStep("details")}
                      type="button"
                    >
                      Continue
                    </Button>
                  ) : (
                    <>
                      <Button onClick={() => setStep("list")} type="button" variant="secondary">
                        Back
                      </Button>
                      <SaveButton
                        disabled={!canSave}
                        isEditing={isEditing}
                        onClick={() => formRef.current?.requestSubmit()}
                        saveState={saveState}
                      />
                    </>
                  )}
                </div>
              </div>
              <form
                className="flex min-w-0 flex-col gap-6"
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
                <input name="name" type="hidden" value={listName} />
                <input name="format" type="hidden" value={format} />
                <input name="date" type="hidden" value={date} />
                <input name="createdBy" type="hidden" value={createdBy} />
                <input name="notes" type="hidden" value={notes} />
                <input name="rawList" type="hidden" value={rawList} />

                {saveError ? (
                  <p className="rounded-xl border border-[var(--color-loss-border)] bg-[var(--color-loss-bg)] px-4 py-3 text-sm text-[var(--color-loss)]">
                    {saveError}
                  </p>
                ) : null}

                {step === "list" ? (
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

                    {!isEditing && summary.total !== 60 ? (
                      <p className="text-sm text-[var(--text-muted)]">
                        Add Deck List continues once a complete 60-card list is detected.
                      </p>
                    ) : null}

                    <label className="grid gap-2">
                      <span className="text-sm font-semibold text-[var(--text-muted)]">Deck list</span>
                      <textarea
                        className="min-h-[320px] w-full rounded-xl border border-[var(--border)] bg-[var(--bg-surface-alt)] px-4 py-3 font-mono text-[0.95rem] leading-6 text-[var(--text-primary)] outline-none transition focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/20"
                        onChange={(event) => setRawList(event.target.value)}
                        required
                        spellCheck={false}
                        value={rawList}
                      />
                    </label>
                  </section>
                ) : (
                  <section className="grid gap-4 md:grid-cols-2">
                    <label className="grid gap-2">
                      <span className="text-sm font-semibold text-[var(--text-muted)]">List name</span>
                      <input
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface-alt)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/20"
                        onChange={(event) => setListName(event.target.value)}
                        required
                        value={listName}
                      />
                    </label>

                    <label className="grid gap-2">
                      <span className="text-sm font-semibold text-[var(--text-muted)]">Format</span>
                      <select
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface-alt)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/20"
                        onChange={(event) => setFormat(event.target.value)}
                        value={format}
                      >
                        {formatOptions.map((option) => (
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
                        onChange={(event) => setDate(event.target.value)}
                        type="date"
                        value={date}
                      />
                    </label>

                    <label className="grid gap-2">
                      <span className="text-sm font-semibold text-[var(--text-muted)]">Created by</span>
                      <input
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface-alt)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/20"
                        onChange={(event) => setCreatedBy(event.target.value)}
                        value={createdBy}
                      />
                    </label>

                    <label className="grid gap-2 md:col-span-2">
                      <span className="text-sm font-semibold text-[var(--text-muted)]">Notes</span>
                      <textarea
                        className="min-h-[100px] w-full rounded-xl border border-[var(--border)] bg-[var(--bg-surface-alt)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/20"
                        onChange={(event) => setNotes(event.target.value)}
                        value={notes}
                      />
                    </label>
                    <div className="grid gap-2 md:col-span-2">
                      <span className="text-sm font-semibold text-[var(--text-muted)]">
                        Visual deck list
                      </span>
                      {parsedCards.length > 0 ? (
                        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface-alt)] p-3">
                          <DeckListVisualGrid cards={parsedCards} />
                        </div>
                      ) : (
                        <p className="text-sm text-[var(--text-muted)]">
                          Paste card lines with set and number to preview the visual deck list.
                        </p>
                      )}
                    </div>
                    {!canSave ? (
                      <p className="md:col-span-2 text-sm text-[var(--text-muted)]">
                        Add a list name before saving.
                      </p>
                    ) : null}
                  </section>
                )}
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
