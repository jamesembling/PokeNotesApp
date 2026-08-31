"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { saveDeckListAction } from "@/app/(app)/decks/actions";
import { Alert, AlertDescription } from "@/components/shadcn/alert";
import { Button } from "@/components/shadcn/button";
import { ButtonGroup } from "@/components/shadcn/button-group";
import { AppDialogContent, AppDialogHeader, AppDialogMobileFooter } from "@/components/ui/AppDialog";
import { CopyDeckListButton } from "@/components/ui/CopyDeckListButton";
import { DatePicker } from "@/components/ui/DatePicker";
import { DeckListVisualGrid } from "@/components/ui/DeckListVisualGrid";
import { Dialog } from "@/components/shadcn/dialog";
import { Input } from "@/components/shadcn/input";
import { Textarea } from "@/components/shadcn/textarea";
import { FormatSelect } from "@/components/ui/FormatSelect";
import { useSiteFormats } from "@/components/ui/SiteFormatsProvider";
import { interpretDeckList } from "@/lib/decks/deck-list-parse";
import type { DeckList } from "@/types/index";

type DeckListSaveActionResult = {
  ok: true;
  redirectTo: string;
} | {
  ok: false;
  message: string;
};

export type DeckListEditorDialogProps = {
  deckId?: string;
  deckList?: DeckList;
  defaultListName?: string;
  defaultFormat?: string;
  defaultCreatedBy: string;
  extraHiddenFields?: ReactNode;
  initialOpen?: boolean;
  saveAction?: (formData: FormData) => Promise<DeckListSaveActionResult>;
  simplePasteMode?: boolean;
  triggerClassName?: string;
  triggerLabel: string;
  triggerSize?: React.ComponentProps<typeof Button>["size"];
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

function normalizeRedirectPath(value: string) {
  return value.split("?")[0] || value;
}

export function DeckListEditorDialog({
  deckId,
  deckList,
  defaultListName,
  defaultFormat,
  defaultCreatedBy,
  extraHiddenFields,
  initialOpen = false,
  saveAction = saveDeckListAction,
  simplePasteMode = false,
  triggerClassName,
  triggerLabel,
  triggerSize = "default",
  triggerVariant = "outline"
}: DeckListEditorDialogProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { defaultFormat: syncedDefaultFormat, options: siteFormatOptions } = useSiteFormats();
  const isEditing = Boolean(deckList?.id);

  const [isOpen, setIsOpen] = useState(initialOpen);
  const [step, setStep] = useState<DialogStep>("list");
  const [rawList, setRawList] = useState(deckList?.rawList ?? "");
  const [listName, setListName] = useState(deckList?.name ?? defaultListName ?? "");
  const [format, setFormat] = useState(
    deckList?.format || defaultFormat || syncedDefaultFormat
  );
  const [date, setDate] = useState(deckList?.date ?? "");
  const [createdBy, setCreatedBy] = useState(deckList?.createdBy || defaultCreatedBy);
  const [notes, setNotes] = useState(deckList?.notes ?? "");
  const [creationKey, setCreationKey] = useState(() => crypto.randomUUID());
  const [saveError, setSaveError] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const closeTimerRef = useRef<number | null>(null);
  const navigationTimerRef = useRef<number | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  const interpretation = useMemo(() => interpretDeckList(rawList), [rawList]);
  const summary = interpretation.summary;
  const parsedCards = interpretation.cards;
  const hasDeckListText = rawList.trim().length > 0;
  const canContinueFromList = simplePasteMode || isEditing ? hasDeckListText : summary.total === 60;
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
    if (simplePasteMode || !isOpen || isEditing || step !== "list") {
      return;
    }

    if (summary.total === 60) {
      setStep("details");
    }
  }, [isEditing, isOpen, simplePasteMode, step, summary.total]);

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
    setListName(deckList?.name ?? defaultListName ?? "");
    setFormat(deckList?.format || defaultFormat || syncedDefaultFormat);
    setDate(deckList?.date ?? "");
    setCreatedBy(deckList?.createdBy || defaultCreatedBy);
    setNotes(deckList?.notes ?? "");
    if (!deckList?.id) {
      setCreationKey(crypto.randomUUID());
    }
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
    setListName(deckList?.name ?? defaultListName ?? "");
    setFormat(deckList?.format || defaultFormat || syncedDefaultFormat);
    setDate(deckList?.date ?? "");
    setCreatedBy(deckList?.createdBy || defaultCreatedBy);
    setNotes(deckList?.notes ?? "");
  }

  async function handleSubmit(formData: FormData) {
    if (!simplePasteMode && step !== "details") {
      return;
    }

    setSaveError("");
    setSaveState("saving");

    try {
      const result = await saveAction(formData);
      if (!result.ok) {
        throw new Error(result.message);
      }

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
          setListName(deckList?.name ?? defaultListName ?? "");
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
      <Button className={triggerClassName} onClick={openDialog} size={triggerSize} variant={triggerVariant}>
        {triggerLabel}
      </Button>

      <AppDialogContent
        size="lg"
        showMobileCloseButton
        showCloseButton={false}
      >
              <AppDialogHeader
                actions={(
                  <ButtonGroup className={simplePasteMode ? "hidden w-full sm:flex" : "hidden w-full sm:flex sm:w-auto sm:justify-end"}>
                  {simplePasteMode ? (
                    <Button
                      className="w-full"
                      disabled={!canSave}
                      onClick={() => formRef.current?.requestSubmit()}
                      type="button"
                    >
                      {saveState === "saving" ? "Saving..." : saveState === "success" ? "Saved" : "Save List"}
                    </Button>
                  ) : step === "list" ? (
                    <Button
                      disabled={!canContinueFromList}
                      onClick={() => setStep("details")}
                      type="button"
                    >
                      Continue to details
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
                )}
                description={simplePasteMode ? "Paste a deck list." : step === "list" ? "Step 1 of 2 · Paste deck list" : "Step 2 of 2 · List details"}
                descriptionHidden={simplePasteMode}
                title={isEditing ? "Edit Deck List" : "New Deck List"}
              />
            <div
              className={[
                "min-h-0 min-w-0 flex-1 touch-pan-y overflow-y-auto overflow-x-hidden overscroll-contain pr-1 [-webkit-overflow-scrolling:touch] [scrollbar-gutter:stable] sm:pr-2",
                simplePasteMode
                  ? "px-3 pb-3 pt-1 sm:px-4 sm:pb-4 sm:pt-1 lg:px-5 lg:pb-5"
                  : step === "list"
                    ? "px-3 pb-3 pt-2 sm:px-4 sm:pb-4 sm:pt-3 lg:px-5 lg:pb-5"
                    : "p-3 sm:p-4 lg:p-5"
              ].join(" ")}
            >
              <form
                className="flex min-w-0 flex-col gap-6"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleSubmit(new FormData(event.currentTarget));
                }}
                ref={formRef}
              >
                <input name="deckId" type="hidden" value={deckId ?? ""} />
                <input name="deckListId" type="hidden" value={deckList?.id ?? ""} />
                <input name="creationKey" type="hidden" value={creationKey} />
                <input name="createdAt" type="hidden" value={deckList?.createdAt ?? ""} />
                <input name="updatedAt" type="hidden" value={deckList?.updatedAt ?? ""} />
                <input name="redirectTo" type="hidden" value={pathname} />
                <input name="name" type="hidden" value={listName} />
                <input name="format" type="hidden" value={format} />
                <input name="date" type="hidden" value={date} />
                <input name="createdBy" type="hidden" value={createdBy} />
                <input name="notes" type="hidden" value={notes} />
                <input name="rawList" type="hidden" value={rawList} />
                {extraHiddenFields}

                {saveError ? (
                  <Alert
                    className="border-loss-border bg-loss-bg text-loss-strong"
                    variant="destructive"
                  >
                    <AlertDescription>{saveError}</AlertDescription>
                  </Alert>
                ) : null}

                {simplePasteMode ? (
                  <section className="grid gap-2">
                    <label className="sr-only" htmlFor="deck-list-raw-list">
                      Deck list
                    </label>
                    <Textarea
                      id="deck-list-raw-list"
                      className="min-h-[360px] w-full rounded-xl border border-border bg-muted px-4 py-3 font-mono text-[0.95rem] leading-6 text-card-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/50"
                      onChange={(event) => setRawList(event.target.value)}
                      placeholder="Paste deck list here"
                      required
                      spellCheck={false}
                      value={rawList}
                    />
                  </section>
                ) : step === "list" ? (
                  <section className="grid gap-3">
                    <label className="block" htmlFor="deck-list-raw-list">
                      <span className="sr-only">Deck list</span>
                      <Textarea
                        id="deck-list-raw-list"
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
                    <label className="grid gap-2" htmlFor="deck-list-name">
                      <span className="text-sm font-semibold text-muted-foreground">List name</span>
                      <Input
                        id="deck-list-name"
                        className="h-auto min-h-[2.75rem] w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-card-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/50"
                        onChange={(event) => setListName(event.target.value)}
                        required
                        value={listName}
                      />
                    </label>

                    <label className="grid gap-2" htmlFor="deck-list-format">
                      <span className="text-sm font-semibold text-muted-foreground">Format</span>
                      <FormatSelect
                        aria-label="Format"
                        id="deck-list-format"
                        onChange={setFormat}
                        options={formatOptions}
                        value={format}
                      />
                    </label>

                    <label className="grid gap-2" htmlFor="deck-list-date">
                      <span className="text-sm font-semibold text-muted-foreground">Date</span>
                      <DatePicker id="deck-list-date" onChange={setDate} value={date} />
                    </label>

                    <label className="grid gap-2" htmlFor="deck-list-created-by">
                      <span className="text-sm font-semibold text-muted-foreground">Created by</span>
                      <Input
                        id="deck-list-created-by"
                        className="h-auto min-h-[2.75rem] w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-card-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/50"
                        onChange={(event) => setCreatedBy(event.target.value)}
                        value={createdBy}
                      />
                    </label>

                    <label className="grid gap-2 md:col-span-2" htmlFor="deck-list-notes">
                      <span className="text-sm font-semibold text-muted-foreground">Notes</span>
                      <Textarea
                        id="deck-list-notes"
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
            <AppDialogMobileFooter>
              {simplePasteMode ? (
                <Button
                  className="w-full"
                  disabled={!canSave}
                  onClick={() => formRef.current?.requestSubmit()}
                  type="button"
                >
                  {saveState === "saving" ? "Saving..." : saveState === "success" ? "Saved" : "Save List"}
                </Button>
              ) : step === "list" ? (
                <Button
                  className="w-full"
                  disabled={!canContinueFromList}
                  onClick={() => setStep("details")}
                  type="button"
                >
                  Continue to details
                </Button>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Button onClick={() => setStep("list")} type="button" variant="outline">
                    Back
                  </Button>
                  <SaveButton
                    disabled={!canSave}
                    isEditing={isEditing}
                    onClick={() => formRef.current?.requestSubmit()}
                    saveState={saveState}
                  />
                </div>
              )}
            </AppDialogMobileFooter>
      </AppDialogContent>
    </Dialog>
  );
}
