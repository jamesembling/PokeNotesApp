"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useLogsRefresh } from "@/components/ui/LogsRefreshContext";
import { usePathname, useRouter } from "next/navigation";
import {
  type ParseLogActionResult,
  type SaveActionResult
} from "@/app/(app)/logs/actions";
import { Alert, AlertDescription } from "@/components/shadcn/alert";
import { AppSelect } from "@/components/shadcn/app-select";
import { AppDialogContent, AppDialogHeader, AppDialogMobileFooter } from "@/components/ui/AppDialog";
import { BattleLogSpritePicker } from "@/components/ui/BattleLogSpritePicker";
import { Button } from "@/components/shadcn/button";
import { ButtonGroup } from "@/components/shadcn/button-group";
import { DatePicker } from "@/components/ui/DatePicker";
import { Dialog } from "@/components/shadcn/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/shadcn/field";
import { Textarea } from "@/components/shadcn/textarea";
import { FormatSelect } from "@/components/ui/FormatSelect";
import { ChevronIcon } from "@/components/ui/icons";
import { useSiteFormats } from "@/components/ui/SiteFormatsProvider";
import { useImportDialogData } from "@/components/ui/ImportDialogDataProvider";
import { isTrainingCourtLogUrl } from "@/lib/battle-log/training-court";
import {
  makeDeckListSelectionKey,
  parseDeckListSelectionKey,
  selectDeck,
  selectDeckList,
  type DeckListSelectionState
} from "@/lib/log-import/deck-list-selection";
import {
  getBattleLogDeckDisplayName,
  getBattleLogOpponentDisplayName
} from "@/lib/battle-log/display";
import type {
  DeckListSelectionOption,
  PokemonOption
} from "@/types/index";
import type { PersistedBattleLogImportReview } from "@/lib/db/battle-log-import-drafts";
import { loadPokemonOptions } from "@/lib/pokemon/use-pokemon-options";
import { pokemonOptionsClientCache } from "@/lib/client/editor-option-cache";
import { normalizeRedirectPath } from "@/lib/client/redirect-path";

export type ImportLogDialogProps = {
  className?: string;
  initialOpen?: boolean;
  onOpen?: () => void | Promise<void>;
  onClose?: () => void;
  renderTrigger?: boolean;
  triggerLabel?: string;
};

type Stage = "raw" | "review";
type SaveState = "idle" | "saving" | "success";

const SUCCESS_CLOSE_DELAY_MS = 250;
const BULK_PASTE_CHARACTER_THRESHOLD = 200;

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

export function ImportLogDialog({
  className,
  initialOpen = false,
  onClose,
  onOpen,
  renderTrigger = true,
  triggerLabel = "Import PTCGL Log"
}: ImportLogDialogProps) {
  const router = useRouter();
  const refreshLogs = useLogsRefresh();
  const pathname = usePathname();
  const { defaultFormat, options: siteFormatOptions } = useSiteFormats();
  const {
    ensureUserDecks,
    isLoadingUserDecks,
    userDeckLists,
    userDecks: sharedUserDecks,
    userDecksError
  } = useImportDialogData();
  const userDecks = sharedUserDecks ?? [];
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [stage, setStage] = useState<Stage>("raw");
  const [rawLog, setRawLog] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [review, setReview] = useState<PersistedBattleLogImportReview | null>(null);
  const [saveIdentity, setSaveIdentity] = useState("");
  const [selectedSelfSprites, setSelectedSelfSprites] = useState<string[]>([]);
  const [selectedOpponentSprites, setSelectedOpponentSprites] = useState<string[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState("");
  const [selectedDeckListSelectionKey, setSelectedDeckListSelectionKey] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedFormat, setSelectedFormat] = useState("");
  const [matchNotes, setMatchNotes] = useState("");
  const [pokemonOptions, setPokemonOptions] = useState<PokemonOption[]>(
    () => pokemonOptionsClientCache.read() ?? []
  );
  const [isLoadingPokemonOptions, setIsLoadingPokemonOptions] = useState(false);
  const [pokemonOptionsError, setPokemonOptionsError] = useState("");
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

  const availableDeckLists = userDeckLists;
  const deckListPlaceholder = isLoadingUserDecks
    ? "Loading deck lists..."
    : userDecksError
      ? "Deck lists unavailable"
      : availableDeckLists.length > 0
        ? "No linked deck list"
        : "No deck lists available";
  const selectedDeckListId =
    parseDeckListSelectionKey(selectedDeckListSelectionKey)?.deckListId ?? "";

  function applyDeckListSelection(next: DeckListSelectionState) {
    setSelectedDeckId(next.deckId);
    setSelectedDeckListSelectionKey(next.selectionKey);
  }

  function handleDeckChange(nextDeckId: string) {
    applyDeckListSelection(
      selectDeck(
        {
          deckId: selectedDeckId,
          deckListId: selectedDeckListId,
          selectionKey: selectedDeckListSelectionKey
        },
        nextDeckId,
        availableDeckLists
      )
    );
  }

  function handleDeckListChange(nextSelectionKey: string) {
    applyDeckListSelection(
      selectDeckList(
        {
          deckId: selectedDeckId,
          deckListId: selectedDeckListId,
          selectionKey: selectedDeckListSelectionKey
        },
        nextSelectionKey,
        availableDeckLists
      )
    );
  }
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
  const detectedDeckOptions = useMemo(() => {
    if (
      !selectedDeckId ||
      selectedDeckId !== review?.suggestedLinkedDeckId ||
      userDecks.some((deck) => deck.id === selectedDeckId)
    ) {
      return [];
    }

    return [
      {
        label: review.suggestedLinkedDeckName || "Detected deck strategy",
        value: selectedDeckId
      }
    ];
  }, [review, selectedDeckId, userDecks]);

  function resetImportState() {
    setStage("raw");
    setRawLog("");
    setParseError(null);
    setSaveError("");
    setSaveState("idle");
    setReview(null);
    setSaveIdentity("");
    setSelectedSelfSprites([]);
    setSelectedOpponentSprites([]);
    setSelectedDeckId("");
    setSelectedDeckListSelectionKey("");
    setSelectedDate("");
    setSelectedFormat("");
    setMatchNotes("");
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
    if (userDeckLists.length === 0 || !selectedDeckListSelectionKey) {
      return;
    }

    const deckList = userDeckLists.find(
      (option) =>
        (option.selectionKey ??
          makeDeckListSelectionKey({ deckId: option.deckId, deckListId: option.id })) ===
        selectedDeckListSelectionKey
    );
    if (!deckList) {
      setSelectedDeckListSelectionKey("");
    } else if (selectedDeckId && deckList.deckId !== selectedDeckId) {
      setSelectedDeckListSelectionKey("");
    }
  }, [selectedDeckId, selectedDeckListSelectionKey, userDeckLists]);

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
    (nextReview: PersistedBattleLogImportReview) => {
      setReview(nextReview);
      setSaveIdentity(crypto.randomUUID());
      setStage("review");
      setParseError(null);
      setSelectedSelfSprites(nextReview.selfSprites.slice(0, 2));
      setSelectedOpponentSprites(nextReview.opponentSprites.slice(0, 2));
      setSelectedDeckId(nextReview.suggestedLinkedDeckId ?? "");
      setSelectedDeckListSelectionKey("");
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
      let result: ParseLogActionResult;

      try {
        const response = await fetch("/api/log-import/review", {
          body: JSON.stringify({
            format: defaultFormat,
            rawLog: rawLogValue.trim()
          }),
          cache: "no-store",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json"
          },
          method: "POST"
        });
        result = (await response.json()) as ParseLogActionResult;
      } catch {
        result = { error: "Could not review this Battle Log." };
      }

      if (autoParseRequestIdRef.current !== requestId) {
        return;
      }

      if ("error" in result) {
        setParseError(result.error);
        return;
      }

      moveToReviewStage(result);
    },
    [defaultFormat, moveToReviewStage]
  );

  const loadSpritePickerOptions = useCallback(async () => {
    if (pokemonOptions.length > 0 || isLoadingPokemonOptions) {
      return;
    }

    setIsLoadingPokemonOptions(true);
    setPokemonOptionsError("");

    try {
      setPokemonOptions(await loadPokemonOptions());
    } catch (error) {
      setPokemonOptionsError(
        error instanceof Error ? error.message : "Could not load Pokemon options."
      );
    } finally {
      setIsLoadingPokemonOptions(false);
    }
  }, [isLoadingPokemonOptions, pokemonOptions.length]);

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
      const response = await fetch("/api/log-import/save", {
        body: formData,
        cache: "no-store",
        credentials: "same-origin",
        method: "POST"
      });
      const result = (await response.json()) as SaveActionResult | { error?: string };

      if (!response.ok || !("ok" in result)) {
        const message = "error" in result ? result.error : undefined;
        throw new Error(message || "Could not save this battle log.");
      }

      setSaveState("success");
      router.prefetch(result.redirectTo);

      clearCloseTimer();
      closeTimerRef.current = window.setTimeout(() => {
        clearNavigationTimer();

        if (normalizeRedirectPath(result.redirectTo) === pathname) {
          setIsOpen(false);
          if (refreshLogs) void refreshLogs().catch(() => undefined);
          else router.refresh();
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

  useEffect(() => {
    if (isOpen && sharedUserDecks === null) {
      void ensureUserDecks().catch(() => undefined);
    }
  }, [ensureUserDecks, isOpen, sharedUserDecks]);

  function renderHeader() {
    if (stage === "raw") {
      return (
        <AppDialogHeader
          actions={trimmedRawLog ? (
            <ButtonGroup className="hidden w-full md:flex md:w-auto md:justify-end">
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
          description="Paste a PTCGL battle log URL or raw log text to review before saving."
          title="Import PTCGL Log"
        />
      );
    }

    return (
      <AppDialogHeader
        description="Confirm the parsed result, then save it to your battle logs."
        title="Review Battle Log"
      />
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

      <AppDialogContent
        showMobileCloseButton
        showCloseButton={false}
      >
                {renderHeader()}

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
                  <input name="draftId" type="hidden" value={review.draftId} />
                  <input name="idempotencyKey" type="hidden" value={saveIdentity} />
                  <input name="date" type="hidden" value={selectedDate} />
                  <input name="format" type="hidden" value={selectedFormat} />
                  <input name="linkedDeckId" type="hidden" value={selectedDeckId} />
                  <input name="linkedDeckListId" type="hidden" value={selectedDeckListId} />

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

                  {pokemonOptionsError ? (
                    <Alert variant="loss">
                      <AlertDescription>{pokemonOptionsError}</AlertDescription>
                    </Alert>
                  ) : null}

                  {userDecksError ? (
                    <Alert variant="loss" role="alert">
                      <AlertDescription className="flex items-center justify-between gap-3">
                        <span>{userDecksError}</span>
                        <Button
                          disabled={isLoadingUserDecks}
                          onClick={() => void ensureUserDecks().catch(() => undefined)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          Retry
                        </Button>
                      </AlertDescription>
                    </Alert>
                  ) : null}

                  <BattleLogSpritePicker
                    isLoadingOptions={isLoadingPokemonOptions}
                    onChange={setSelectedSelfSprites}
                    onSearchIntent={loadSpritePickerOptions}
                    pokemonOptions={pokemonOptions}
                    sprites={selectedSelfSprites}
                    title={`${review.selfPlayerName}'s deck`}
                  />

                  <BattleLogSpritePicker
                    isLoadingOptions={isLoadingPokemonOptions}
                    onChange={setSelectedOpponentSprites}
                    onSearchIntent={loadSpritePickerOptions}
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
                            disabled={isLoadingUserDecks}
                            id="import-deck-mobile"
                            onChange={handleDeckChange}
                            options={[
                              {
                                label: isLoadingUserDecks
                                  ? "Loading deck strategies..."
                                  : "No linked deck",
                                value: ""
                              },
                              ...detectedDeckOptions,
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
                            disabled={isLoadingUserDecks || availableDeckLists.length === 0}
                            id="import-deck-list-mobile"
                            onChange={handleDeckListChange}
                            options={[
                              {
                                label: deckListPlaceholder,
                                value: ""
                              },
                              ...availableDeckLists.map((deckList: DeckListSelectionOption) => ({
                                label: deckList.name,
                                value:
                                  deckList.selectionKey ??
                                  makeDeckListSelectionKey({
                                    deckId: deckList.deckId,
                                    deckListId: deckList.id
                                  })
                              }))
                            ]}
                            value={selectedDeckListSelectionKey}
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
                        disabled={isLoadingUserDecks}
                        id="import-deck"
                        onChange={handleDeckChange}
                        options={[
                          {
                            label: isLoadingUserDecks
                              ? "Loading deck strategies..."
                              : "No linked deck",
                            value: ""
                          },
                          ...detectedDeckOptions,
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
                        disabled={isLoadingUserDecks || availableDeckLists.length === 0}
                        id="import-deck-list"
                        onChange={handleDeckListChange}
                        options={[
                          {
                            label: deckListPlaceholder,
                            value: ""
                          },
                          ...availableDeckLists.map((deckList: DeckListSelectionOption) => ({
                            label: deckList.name,
                            value:
                              deckList.selectionKey ??
                              makeDeckListSelectionKey({
                                deckId: deckList.deckId,
                                deckListId: deckList.id
                              })
                          }))
                        ]}
                        value={selectedDeckListSelectionKey}
                      />
                    </Field>
                  </FieldGroup>

                  <section className="grid gap-3 rounded-2xl border border-border bg-muted p-4 md:hidden">
                    <p className="text-base font-semibold text-card-foreground">
                      {review.selfPlayerName}&apos;s Result: {resultLabel}
                    </p>
                  </section>

                  <Field>
                    <FieldLabel htmlFor="import-match-notes">Match notes</FieldLabel>
                    <Textarea
                      className="min-h-28 resize-y"
                      id="import-match-notes"
                      name="matchNotes"
                      onChange={(event) => setMatchNotes(event.target.value)}
                      placeholder="Record key decisions, turning points, or follow-up ideas"
                      value={matchNotes}
                    />
                    <FieldDescription>
                      Optional and private to you. Match notes are not included in shared links.
                    </FieldDescription>
                  </Field>

                  <ButtonGroup className="hidden w-full md:flex [&>button]:w-full">
                    <SaveButton
                      onClick={() => formRef.current?.requestSubmit()}
                      saveState={saveState}
                    />
                  </ButtonGroup>
                </form>
              ) : (
                <div className="flex min-w-0 flex-col gap-6">
                  <Field>
                    <FieldLabel htmlFor="battle-log">Battle log</FieldLabel>
                    <Textarea
                      className="min-h-[280px]"
                      id="battle-log"
                      onPaste={() => {
                        shouldAutoParseImmediatelyRef.current = true;
                      }}
                      onChange={(event) => {
                        const nextRawLog = event.target.value;
                        if (nextRawLog.length - rawLog.length >= BULK_PASTE_CHARACTER_THRESHOLD) {
                          shouldAutoParseImmediatelyRef.current = true;
                        }
                        setRawLog(nextRawLog);
                      }}
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
                      className="border-loss-border bg-loss-bg text-loss-strong"
                      variant="destructive"
                    >
                      <AlertDescription>{parseError}</AlertDescription>
                    </Alert>
                  ) : null}
                </div>
              )}
                </div>
                {stage === "raw" && trimmedRawLog ? (
                  <AppDialogMobileFooter className="md:hidden">
                    <Button
                      className="min-w-0 w-full whitespace-normal text-center leading-5"
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
                  </AppDialogMobileFooter>
                ) : stage === "review" && review ? (
                  <AppDialogMobileFooter className="md:hidden">
                    <SaveButton onClick={() => formRef.current?.requestSubmit()} saveState={saveState} />
                  </AppDialogMobileFooter>
                ) : null}
      </AppDialogContent>
    </Dialog>
  );
}
