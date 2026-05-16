"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { saveDeckListAction } from "@/app/(app)/decks/actions";
import { Alert, AlertDescription } from "@/components/shadcn/alert";
import { Button } from "@/components/shadcn/button";
import { ButtonGroup } from "@/components/shadcn/button-group";
import { CopyDeckListButton } from "@/components/ui/CopyDeckListButton";
import { DatePicker } from "@/components/ui/DatePicker";
import { DeckListVisualGrid } from "@/components/ui/DeckListVisualGrid";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle
} from "@/components/shadcn/dialog";
import { Input } from "@/components/shadcn/input";
import { Textarea } from "@/components/shadcn/textarea";
import { FormatSelect } from "@/components/ui/FormatSelect";
import { useSiteFormats } from "@/components/ui/SiteFormatsProvider";
import { parseDeckList, summarizeDeckList } from "@/lib/decks/deck-list-parse";
import type { DeckList } from "@/types/index";

export type DeckListEditorDialogProps = {
  deckId: string;
  deckList?: DeckList;
  defaultFormat?: string;
  defaultCreatedBy: string;
  initialOpen?: boolean;
  triggerLabel: string;
  triggerVariant?: "default" | "outline" | "ghost";
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
          ? "w-full whitespace-nowrap pointer-events-none bg-win-strong text-primary-foreground opacity-100 hover:bg-win-strong sm:w-auto sm:shrink-0"
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
  initialOpen = false,
  triggerLabel,
  triggerVariant = "outline"
}: DeckListEditorDialogProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { defaultFormat: syncedDefaultFormat, options: siteFormatOptions } = useSiteFormats();
  const isEditing = Boolean(deckList?.id);

  const [isOpen, setIsOpen] = useState(initialOpen);
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

  useEffect(() => {
    if (deckList?.format) {
      return;
    }

    setFormat((current) => current || defaultFormat || syncedDefaultFormat);
  }, [deckList?.format, defaultFormat, syncedDefaultFormat]);

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
    <Dialog
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          closeDialog();
        }
      }}
      open={isOpen}
    >
      <Button onClick={openDialog} variant={triggerVariant}>
        {triggerLabel}
      </Button>

      <DialogContent
        className="flex max-h-[calc(100dvh-2rem)] max-w-4xl min-w-0 flex-col overflow-hidden rounded-[28px] border border-border bg-card p-3 shadow-[var(--shadow-lg)] sm:max-w-4xl sm:p-4 lg:p-5"
        showMobileCloseButton
        showCloseButton={false}
      >
            <div className="min-h-0 min-w-0 flex-1 touch-pan-y overflow-y-auto overflow-x-hidden overscroll-contain pr-1 [-webkit-overflow-scrolling:touch] [scrollbar-gutter:stable] sm:pr-2">
              <div className="mb-2 flex min-w-0 flex-col gap-4 border-b border-border pb-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <DialogTitle className="text-[1.55rem] font-bold tracking-[-0.05em] text-card-foreground sm:text-[1.9rem]">
                    {isEditing ? "Edit Deck List" : "New Deck List"}
                  </DialogTitle>
                  <DialogDescription className="text-sm text-muted-foreground">
                    {step === "list" ? "Step 1 of 2 · Paste deck list" : "Step 2 of 2 · List details"}
                  </DialogDescription>
                </div>
                <ButtonGroup className="w-full sm:w-auto sm:justify-end">
                  <Button onClick={closeDialog} type="button" variant="outline">
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
                      <Button onClick={() => setStep("list")} type="button" variant="outline">
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
                </ButtonGroup>
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
                  <Alert
                    className="border-loss-border bg-loss-bg text-loss"
                    variant="destructive"
                  >
                    <AlertDescription>{saveError}</AlertDescription>
                  </Alert>
                ) : null}

                {step === "list" ? (
                  <section className="grid gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={[
                          "inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold",
                          summaryTone === "success"
                            ? "bg-[rgba(31,138,98,0.14)] text-win"
                            : summaryTone === "warning"
                              ? "bg-[rgba(213,87,75,0.12)] text-loss"
                              : "bg-muted text-muted-foreground"
                        ].join(" ")}
                      >
                        {formatSummaryLabel(rawList)}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {formatSummaryMessage(rawList)}
                      </span>
                    </div>

                    {!isEditing && summary.total !== 60 ? (
                      <p className="text-sm text-muted-foreground">
                        Add Deck List continues once a complete 60-card list is detected.
                      </p>
                    ) : null}

                    <label className="grid gap-2">
                      <span className="text-sm font-semibold text-muted-foreground">Deck list</span>
                      <Textarea
                        className="min-h-[320px] w-full rounded-xl border border-border bg-muted px-4 py-3 font-mono text-[0.95rem] leading-6 text-card-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/50"
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
                      <span className="text-sm font-semibold text-muted-foreground">List name</span>
                      <Input
                        className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-card-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/50"
                        onChange={(event) => setListName(event.target.value)}
                        required
                        value={listName}
                      />
                    </label>

                    <label className="grid gap-2">
                      <span className="text-sm font-semibold text-muted-foreground">Format</span>
                      <FormatSelect onChange={setFormat} options={formatOptions} value={format} />
                    </label>

                    <label className="grid gap-2">
                      <span className="text-sm font-semibold text-muted-foreground">Date</span>
                      <DatePicker onChange={setDate} value={date} />
                    </label>

                    <label className="grid gap-2">
                      <span className="text-sm font-semibold text-muted-foreground">Created by</span>
                      <Input
                        className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-card-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/50"
                        onChange={(event) => setCreatedBy(event.target.value)}
                        value={createdBy}
                      />
                    </label>

                    <label className="grid gap-2 md:col-span-2">
                      <span className="text-sm font-semibold text-muted-foreground">Notes</span>
                      <Textarea
                        className="min-h-[100px] w-full rounded-xl border border-border bg-muted px-4 py-3 text-sm text-card-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/50"
                        onChange={(event) => setNotes(event.target.value)}
                        value={notes}
                      />
                    </label>
                    <div className="grid gap-2 md:col-span-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-muted-foreground">
                          Visual deck list
                        </span>
                        <CopyDeckListButton text={rawList} />
                      </div>
                      {parsedCards.length > 0 ? (
                        <div className="rounded-xl border border-border bg-muted p-3">
                          <DeckListVisualGrid cards={parsedCards} />
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Paste card lines with set and number to preview the visual deck list.
                        </p>
                      )}
                    </div>
                    {!canSave ? (
                      <p className="md:col-span-2 text-sm text-muted-foreground">
                        Add a list name before saving.
                      </p>
                    ) : null}
                  </section>
                )}
              </form>
            </div>
      </DialogContent>
    </Dialog>
  );
}
