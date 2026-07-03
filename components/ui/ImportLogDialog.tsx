"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { importLogAction, parseLogAction } from "@/app/(app)/logs/actions";
import { Alert, AlertDescription } from "@/components/shadcn/alert";
import { AppSelect } from "@/components/shadcn/app-select";
import { BattleLogSpritePicker } from "@/components/ui/BattleLogSpritePicker";
import { Button } from "@/components/shadcn/button";
import { ButtonGroup } from "@/components/shadcn/button-group";
import { DatePicker } from "@/components/ui/DatePicker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle
} from "@/components/shadcn/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/shadcn/field";
import { Textarea } from "@/components/shadcn/textarea";
import { FormatSelect } from "@/components/ui/FormatSelect";
import { ChevronIcon } from "@/components/ui/icons";
import { useSiteFormats } from "@/components/ui/SiteFormatsProvider";
import { isTrainingCourtLogUrl } from "@/lib/battle-log/training-court";
import {
  getBattleLogDeckDisplayName,
  getBattleLogOpponentDisplayName
} from "@/lib/battle-log/display";
import type {
  DeckListOption,
  DeckSelectionOption,
  ParsedLogReview,
  PokemonOption
} from "@/types/index";

export type ImportLogDialogProps = {
  className?: string;
  initialOpen?: boolean;
  importDataError?: string;
  onOpen?: () => void | Promise<void>;
  onClose?: () => void;
  pokemonOptions: PokemonOption[];
  renderTrigger?: boolean;
  ptcglUsername?: string;
  triggerLabel?: string;
  userDecks: DeckSelectionOption[];
};

type Stage = "raw" | "review";
type SaveState = "idle" | "saving" | "success";

const SUCCESS_CLOSE_DELAY_MS = 250;

function ResultChip({ children }: { children: string }) {
  return (
    <span className="inline-flex max-w-full items-center truncate rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-foreground">
      {children}
    </span>
  );
}

function SaveButton({
  onClick,
  saveState
}: {
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
          ? "w-full whitespace-nowrap pointer-events-none bg-win-strong text-primary-foreground opacity-100 hover:bg-win-strong"
          : isSaving
            ? "w-full whitespace-nowrap pointer-events-none"
            : "w-full whitespace-nowrap"
      }
      disabled={isSaving}
      onClick={onClick}
      type="button"
    >
      {isSaving ? "Saving..." : isSuccess ? "Saved" : "Save Log"}
    </Button>
  );
}

function normalizeRedirectPath(value: string) {
  return value.split("?")[0] || value;
}

export function ImportLogDialog({
  className,
  initialOpen = false,
  importDataError = "",
  onClose,
  onOpen,
  pokemonOptions,
  renderTrigger = true,
  ptcglUsername = "",
  triggerLabel = "Import PTCGL Log",
  userDecks
}: ImportLogDialogProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { defaultFormat, options: siteFormatOptions } = useSiteFormats();
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [stage, setStage] = useState<Stage>("raw");
  const [rawLog, setRawLog] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [review, setReview] = useState<ParsedLogReview | null>(null);
  const [selectedSelfSprites, setSelectedSelfSprites] = useState<string[]>([]);
  const [selectedOpponentSprites, setSelectedOpponentSprites] = useState<string[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState("");
  const [selectedDeckListId, setSelectedDeckListId] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedFormat, setSelectedFormat] = useState("");
  const [isPasting, setIsPasting] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [isParsing, startParseTransition] = useTransition();
  const autoParseRequestIdRef = useRef(0);
  const shouldAutoParseImmediatelyRef = useRef(false);
  const closeTimerRef = useRef<number | null>(null);
  const navigationTimerRef = useRef<number | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const selectedDeck = useMemo(
    () => userDecks.find((deck) => deck.id === selectedDeckId) ?? null,
    [selectedDeckId, userDecks]
  );

  const availableDeckLists = selectedDeck?.deckLists ?? [];
  const resultLabel = review?.result === "Loss" ? "L" : "W";
  const trimmedRawLog = rawLog.trim();
  const isTrainingCourtUrl = isTrainingCourtLogUrl(trimmedRawLog);
  const canReviewRawLog = trimmedRawLog.length > 0 && !isParsing;
  const detectedSelfLabel = useMemo(
    () =>
      review ? getBattleLogDeckDisplayName(review.selfDeckName, selectedSelfSprites) : undefined,
    [review, selectedSelfSprites]
  );
  const detectedOpponentLabel = useMemo(
    () =>
      review
        ? getBattleLogOpponentDisplayName(review.opponentDeckName, selectedOpponentSprites)
        : undefined,
    [review, selectedOpponentSprites]
  );
  const formatOptions = useMemo(() => {
    const normalizedFormat = String(selectedFormat || "").trim();
    if (!normalizedFormat) {
      return [...siteFormatOptions];
    }

    return siteFormatOptions.includes(normalizedFormat)
      ? [...siteFormatOptions]
      : [normalizedFormat, ...siteFormatOptions];
  }, [selectedFormat, siteFormatOptions]);

  function resetImportState() {
    setStage("raw");
    setRawLog("");
    setParseError(null);
    setSaveError("");
    setSaveState("idle");
    setReview(null);
    setSelectedSelfSprites([]);
    setSelectedOpponentSprites([]);
    setSelectedDeckId("");
    setSelectedDeckListId("");
    setSelectedDate("");
    setSelectedFormat("");
    setIsPasting(false);
  }

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

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      contentRef.current?.scrollTo({ top: 0 });
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [isOpen, stage]);

  useEffect(() => {
    return () => {
      clearCloseTimer();
      clearNavigationTimer();
    };
  }, []);

  useEffect(() => {
    if (initialOpen) {
      setIsOpen(true);
    }
  }, [initialOpen]);

  useEffect(() => {
    if (!selectedDeckId) {
      setSelectedDeckListId("");
      return;
    }

    const stillValid = availableDeckLists.some((deckList) => deckList.id === selectedDeckListId);
    if (!stillValid) {
      setSelectedDeckListId("");
    }
  }, [availableDeckLists, selectedDeckId, selectedDeckListId]);

  function openDialog() {
    void onOpen?.();
    clearCloseTimer();
    clearNavigationTimer();
    setSaveError("");
    setSaveState("idle");
    setIsOpen(true);
  }

  function closeDialog() {
    clearCloseTimer();
    clearNavigationTimer();
    setIsOpen(false);
    resetImportState();
    onClose?.();
  }

  const moveToReviewStage = useCallback(
    (nextReview: ParsedLogReview) => {
      setReview(nextReview);
      setStage("review");
      setParseError(null);
      setSelectedSelfSprites(nextReview.selfSprites.slice(0, 2));
      setSelectedOpponentSprites(nextReview.opponentSprites.slice(0, 2));
      setSelectedDeckId(nextReview.suggestedLinkedDeckId ?? "");
      setSelectedDeckListId("");
      setSelectedDate(nextReview.date);
      setSelectedFormat(defaultFormat);
      setSaveError("");
      setSaveState("idle");
    },
    [defaultFormat]
  );

  async function handlePasteFromClipboard() {
    if (!navigator.clipboard?.readText) {
      setParseError("Clipboard paste is not available in this browser.");
      return;
    }

    try {
      setIsPasting(true);
      const clipboardText = await navigator.clipboard.readText();
      shouldAutoParseImmediatelyRef.current = true;
      setRawLog(clipboardText);
      setParseError(null);
    } catch {
      setParseError("Unable to read from the clipboard right now.");
    } finally {
      setIsPasting(false);
    }
  }

  const requestParseReview = useCallback(
    async (rawLogValue: string, requestId: number) => {
      const formData = new FormData();
      formData.set("rawLog", rawLogValue.trim());
      if (ptcglUsername) {
        formData.set("ptcglUsername", ptcglUsername);
      }

      const result = await parseLogAction(formData);

      if (autoParseRequestIdRef.current !== requestId) {
        return;
      }

      if ("error" in result) {
        setParseError(result.error);
        return;
      }

      moveToReviewStage(result);
    },
    [moveToReviewStage, ptcglUsername]
  );

  function handleReviewLog() {
    setParseError(null);
    const requestId = autoParseRequestIdRef.current + 1;
    autoParseRequestIdRef.current = requestId;

    startParseTransition(async () => {
      await requestParseReview(rawLog, requestId);
    });
  }

  async function handleSubmit(formData: FormData) {
    setSaveError("");
    setSaveState("saving");

    try {
      const result = await importLogAction(formData);
      setSaveState("success");

      clearCloseTimer();
      closeTimerRef.current = window.setTimeout(() => {
        clearNavigationTimer();

        if (normalizeRedirectPath(result.redirectTo) === pathname) {
          setIsOpen(false);
          router.refresh();
          onClose?.();
          resetImportState();
          return;
        }

        router.push(result.redirectTo);
        navigationTimerRef.current = window.setTimeout(() => {
          setIsOpen(false);
          resetImportState();
          onClose?.();
        }, 50);
      }, SUCCESS_CLOSE_DELAY_MS);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save this battle log.");
      setSaveState("idle");
    }
  }

  useEffect(() => {
    if (!isOpen || stage !== "raw") {
      return;
    }

    if (!trimmedRawLog || isTrainingCourtUrl) {
      shouldAutoParseImmediatelyRef.current = false;
      return;
    }

    const requestId = autoParseRequestIdRef.current + 1;
    autoParseRequestIdRef.current = requestId;
    const shouldParseImmediately = shouldAutoParseImmediatelyRef.current;
    shouldAutoParseImmediatelyRef.current = false;

    const timeoutId = window.setTimeout(() => {
      if (autoParseRequestIdRef.current !== requestId) {
        return;
      }

      const parseRequestId = autoParseRequestIdRef.current + 1;
      autoParseRequestIdRef.current = parseRequestId;

      startParseTransition(async () => {
        await requestParseReview(trimmedRawLog, parseRequestId);
      });
    }, shouldParseImmediately ? 0 : 500);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isOpen, isTrainingCourtUrl, requestParseReview, stage, trimmedRawLog]);

  function renderHeader() {
    if (stage === "raw") {
      return (
        <div className="flex min-w-0 flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <DialogTitle className="text-[1.55rem] font-bold tracking-[-0.05em] text-card-foreground sm:text-[1.9rem]">
              Import PTCGL Log
            </DialogTitle>
            <DialogDescription className="sr-only">
              Paste a PTCGL battle log URL or raw log text to review before saving.
            </DialogDescription>
          </div>
          {trimmedRawLog ? (
            <ButtonGroup className="w-full sm:w-auto sm:justify-end">
              <Button
                className="min-w-0 flex-1 whitespace-normal text-center leading-5 sm:flex-none sm:whitespace-nowrap"
                disabled={!canReviewRawLog}
                onClick={handleReviewLog}
                type="button"
              >
                {isParsing
                  ? "Reviewing..."
                  : isTrainingCourtUrl
                    ? "Import Training Court URL"
                    : "Review PTCGL Log"}
              </Button>
            </ButtonGroup>
          ) : null}
        </div>
      );
    }

    return (
      <div className="relative flex min-w-0 flex-col gap-3">
        <div className="min-w-0 pr-12 text-left md:pr-0">
          <DialogTitle className="text-[1.3rem] font-bold tracking-[-0.05em] text-card-foreground sm:text-[1.55rem] md:text-[1.9rem]">
            Review Battle Log
          </DialogTitle>
          <DialogDescription className="sr-only">
            Confirm the parsed result, then save it to your battle logs.
          </DialogDescription>
        </div>
        <ButtonGroup className="w-full md:hidden [&>button]:w-full">
          <SaveButton onClick={() => formRef.current?.requestSubmit()} saveState={saveState} />
        </ButtonGroup>
      </div>
    );
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
      {renderTrigger ? (
        <Button className={className} onClick={openDialog}>
          {triggerLabel}
        </Button>
      ) : null}

      <DialogContent
        className="flex max-h-[calc(100dvh-1rem)] max-w-3xl min-w-0 flex-col overflow-hidden rounded-[24px] border border-border bg-card p-0 shadow-[var(--shadow-lg)] sm:max-h-[calc(100dvh-2rem)] sm:max-w-3xl sm:rounded-[28px]"
        showMobileCloseButton
        showCloseButton={false}
      >
                <div className="shrink-0 border-b border-border p-4 pr-14 sm:px-6 sm:pr-14 lg:px-8 lg:pr-14">
                  {renderHeader()}
                </div>

                <div
                  className="min-h-0 min-w-0 flex-1 touch-pan-y overflow-y-auto overflow-x-hidden overscroll-contain p-4 pr-5 [-webkit-overflow-scrolling:touch] [scrollbar-gutter:stable] sm:px-6 sm:py-5 sm:pr-7 lg:px-8 lg:py-6 lg:pr-9"
                  ref={contentRef}
                >
              {stage === "review" && review ? (
                <form
                  className="flex min-w-0 flex-col gap-4 md:gap-6"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void handleSubmit(new FormData(event.currentTarget));
                  }}
                  ref={formRef}
                >
                  <input name="rawLog" type="hidden" value={review.rawLog} />
                  <input name="selfPlayerName" type="hidden" value={review.selfPlayerName} />
                  <input name="opponentPlayerName" type="hidden" value={review.opponentPlayerName} />
                  <input
                    name="selfDeckName"
                    type="hidden"
                    value={detectedSelfLabel ?? review.selfDeckName}
                  />
                  <input
                    name="opponentDeckName"
                    type="hidden"
                    value={detectedOpponentLabel ?? review.opponentDeckName}
                  />
                  <input name="selfDeckSlug" type="hidden" value={review.selfDeckSlug} />
                  <input name="opponentDeckSlug" type="hidden" value={review.opponentDeckSlug} />
                  <input name="date" type="hidden" value={selectedDate} />
                  <input name="format" type="hidden" value={selectedFormat} />
                  <input name="result" type="hidden" value={review.result} />
                  <input name="goOrder" type="hidden" value={review.goOrder} />
                  <input
                    name="coinTossWon"
                    type="hidden"
                    value={
                      review.coinTossWon === null ? "" : review.coinTossWon ? "true" : "false"
                    }
                  />
                  <input name="language" type="hidden" value={review.language} />
                  <input name="linkedDeckId" type="hidden" value={selectedDeckId} />
                  <input name="linkedDeckListId" type="hidden" value={selectedDeckListId} />
                  <input name="totalTurns" type="hidden" value={String(review.totalTurns)} />
                  <input name="selfPrizesTaken" type="hidden" value={String(review.selfPrizesTaken)} />
                  <input
                    name="opponentPrizesTaken"
                    type="hidden"
                    value={String(review.opponentPrizesTaken)}
                  />
                  <input
                    name="selfAttackDamage"
                    type="hidden"
                    value={String(review.selfAttackDamage)}
                  />
                  <input
                    name="opponentAttackDamage"
                    type="hidden"
                    value={String(review.opponentAttackDamage)}
                  />
                  <input name="selfMulligans" type="hidden" value={String(review.selfMulligans)} />
                  <input
                    name="opponentMulligans"
                    type="hidden"
                    value={String(review.opponentMulligans)}
                  />
                  <input name="reason" type="hidden" value={review.reason} />
                  <input
                    name="sections"
                    type="hidden"
                    value={JSON.stringify(review.sections)}
                  />

                  {selectedSelfSprites.map((slug, index) => (
                    <input
                      key={`self-sprite-${slug}-${index}`}
                      name="selfSprites"
                      type="hidden"
                      value={slug}
                    />
                  ))}
                  {selectedOpponentSprites.map((slug, index) => (
                    <input
                      key={`opponent-sprite-${slug}-${index}`}
                      name="opponentSprites"
                      type="hidden"
                      value={slug}
                    />
                  ))}

                  {saveError ? (
                    <Alert variant="loss">
                      <AlertDescription>{saveError}</AlertDescription>
                    </Alert>
                  ) : null}

                  <BattleLogSpritePicker
                    onChange={setSelectedSelfSprites}
                    pokemonOptions={pokemonOptions}
                    sprites={selectedSelfSprites}
                    title={`${review.selfPlayerName}'s deck`}
                  />

                  <BattleLogSpritePicker
                    onChange={setSelectedOpponentSprites}
                    pokemonOptions={pokemonOptions}
                    sprites={selectedOpponentSprites}
                    title={"Opponent's deck"}
                  />

                  <FieldGroup className="grid gap-3 rounded-2xl border border-border bg-muted p-4 md:hidden">
                    <Field>
                      <FieldLabel htmlFor="import-format-mobile">Format</FieldLabel>
                      <FormatSelect
                        className="bg-card"
                        id="import-format-mobile"
                        onChange={setSelectedFormat}
                        options={formatOptions}
                        value={selectedFormat}
                      />
                    </Field>

                    <details className="group rounded-xl border border-border bg-card">
                      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-card-foreground [&::-webkit-details-marker]:hidden">
                        <span className="flex items-center justify-between gap-3">
                          More details
                          <ChevronIcon className="size-4 text-muted-foreground transition group-open:rotate-180" />
                        </span>
                      </summary>
                      <div className="grid gap-3 border-t border-border p-4">
                        <Field>
                          <FieldLabel htmlFor="import-date-mobile">Date</FieldLabel>
                          <DatePicker
                            id="import-date-mobile"
                            onChange={setSelectedDate}
                            value={selectedDate}
                          />
                        </Field>

                        <Field>
                          <FieldLabel htmlFor="import-deck-mobile">Deck Strategy</FieldLabel>
                          <AppSelect
                            id="import-deck-mobile"
                            onChange={setSelectedDeckId}
                            options={[
                              { label: "No linked deck", value: "" },
                              ...userDecks.map((deck) => ({
                                label: deck.deckName,
                                value: deck.id
                              }))
                            ]}
                            value={selectedDeckId}
                          />
                        </Field>

                        <Field>
                          <FieldLabel htmlFor="import-deck-list-mobile">Deck List</FieldLabel>
                          <AppSelect
                            disabled={availableDeckLists.length === 0}
                            id="import-deck-list-mobile"
                            onChange={setSelectedDeckListId}
                            options={[
                              {
                                label:
                                  availableDeckLists.length > 0
                                    ? "No linked deck list"
                                    : "Select a deck strategy first",
                                value: ""
                              },
                              ...availableDeckLists.map((deckList: DeckListOption) => ({
                                label: deckList.name,
                                value: deckList.id
                              }))
                            ]}
                            value={selectedDeckListId}
                          />
                        </Field>
                      </div>
                    </details>
                  </FieldGroup>

                  <FieldGroup className="hidden gap-4 xl:grid-cols-2 md:grid">
                    <Field className="min-w-0">
                      <FieldLabel htmlFor="import-date">Date</FieldLabel>
                      <DatePicker id="import-date" onChange={setSelectedDate} value={selectedDate} />
                      <span aria-hidden="true" className="min-h-[20px] text-xs opacity-0">
                        Placeholder
                      </span>
                    </Field>

                    <Field className="min-w-0">
                      <FieldLabel htmlFor="import-format">Format</FieldLabel>
                      <FormatSelect
                        id="import-format"
                        onChange={setSelectedFormat}
                        options={formatOptions}
                        value={selectedFormat}
                      />
                      <span aria-hidden="true" className="min-h-[20px] text-xs opacity-0">
                        Placeholder
                      </span>
                    </Field>

                    <Field className="min-w-0">
                      <FieldLabel htmlFor="import-deck">Deck Strategy</FieldLabel>
                      <AppSelect
                        id="import-deck"
                        onChange={setSelectedDeckId}
                        options={[
                          { label: "No linked deck", value: "" },
                          ...userDecks.map((deck) => ({
                            label: deck.deckName,
                            value: deck.id
                          }))
                        ]}
                        value={selectedDeckId}
                      />
                    </Field>

                    <Field className="min-w-0">
                      <FieldLabel htmlFor="import-deck-list">Deck List</FieldLabel>
                      <AppSelect
                        disabled={availableDeckLists.length === 0}
                        id="import-deck-list"
                        onChange={setSelectedDeckListId}
                        options={[
                          {
                            label:
                              availableDeckLists.length > 0
                                ? "No linked deck list"
                                : "Select a deck strategy first",
                            value: ""
                          },
                          ...availableDeckLists.map((deckList: DeckListOption) => ({
                            label: deckList.name,
                            value: deckList.id
                          }))
                        ]}
                        value={selectedDeckListId}
                      />
                    </Field>
                  </FieldGroup>

                  <section className="grid gap-3 rounded-2xl border border-border bg-muted p-4">
                    <p className="text-base font-semibold text-card-foreground">
                      {review.selfPlayerName}&apos;s Result: {resultLabel}
                    </p>
                    <div className="hidden flex-wrap gap-2 md:flex">
                      <ResultChip>{selectedFormat}</ResultChip>
                      <ResultChip>{review.goOrder || "Unknown go order"}</ResultChip>
                      <ResultChip>
                        {review.coinTossWon === null
                          ? "Coin toss unknown"
                          : review.coinTossWon
                            ? "Won coin toss"
                            : "Lost coin toss"}
                      </ResultChip>
                      <ResultChip>{review.language}</ResultChip>
                    </div>
                  </section>

                  <ButtonGroup className="hidden w-full md:flex [&>button]:w-full">
                    <SaveButton
                      onClick={() => formRef.current?.requestSubmit()}
                      saveState={saveState}
                    />
                  </ButtonGroup>
                </form>
              ) : (
                <div className="flex min-w-0 flex-col gap-6">
                  {importDataError ? (
                    <Alert variant="loss">
                      <AlertDescription>{importDataError}</AlertDescription>
                    </Alert>
                  ) : null}

                  <Field>
                    <FieldLabel htmlFor="battle-log">Battle log</FieldLabel>
                    <Textarea
                      className="min-h-[280px]"
                      id="battle-log"
                      onPaste={() => {
                        shouldAutoParseImmediatelyRef.current = true;
                      }}
                      onChange={(event) => setRawLog(event.target.value)}
                      placeholder="Paste your full PTCGL battle log here"
                      spellCheck={false}
                      value={rawLog}
                    />
                  </Field>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Button
                      disabled={isPasting}
                      onClick={handlePasteFromClipboard}
                      type="button"
                      variant="outline"
                    >
                      {isPasting ? "Pasting..." : "Paste From Clipboard"}
                    </Button>
                    <p className="text-sm text-muted-foreground">
                      Paste a PTCGL battle log to auto-review, or enter a Training Court URL and use
                      the button above.
                    </p>
                  </div>

                  {isParsing && !isTrainingCourtUrl ? (
                    <Alert className="border-ring/20 bg-muted text-primary">
                      <AlertDescription className="text-primary">
                        Reviewing battle log…
                      </AlertDescription>
                    </Alert>
                  ) : null}

                  {parseError ? (
                    <Alert
                      className="border-loss-border bg-loss-bg text-loss"
                      variant="destructive"
                    >
                      <AlertDescription>{parseError}</AlertDescription>
                    </Alert>
                  ) : null}
                </div>
              )}
                </div>
      </DialogContent>
    </Dialog>
  );
}
