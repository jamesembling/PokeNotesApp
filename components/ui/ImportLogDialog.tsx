"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { importLogAction, parseLogAction } from "@/app/(app)/logs/actions";
import { BattleLogSpritePicker } from "@/components/ui/BattleLogSpritePicker";
import { Button } from "@/components/ui/Button";
import { ChevronIcon, CloseIcon } from "@/components/ui/icons";
import { isTrainingCourtLogUrl } from "@/lib/battle-log/training-court";
import { useBodyScrollLock } from "@/lib/client/use-body-scroll-lock";
import {
  getBattleLogDeckDisplayName,
  getBattleLogOpponentDisplayName
} from "@/lib/battle-log/display";
import { SITE_FORMAT_OPTIONS, getDefaultSiteFormat } from "@/lib/formats/options";
import type { DeckList, DeckSummary, ParsedLogReview, PokemonOption } from "@/types/index";

type ImportLogDialogProps = {
  className?: string;
  initialOpen?: boolean;
  pokemonOptions: PokemonOption[];
  userDecks: DeckSummary[];
};

type Stage = "raw" | "review";
type SaveState = "idle" | "saving" | "success";

const SUCCESS_CLOSE_DELAY_MS = 650;

function ResultChip({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--bg-surface-alt)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)]">
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
          ? "w-full md:w-[148px] md:shrink-0 whitespace-nowrap pointer-events-none bg-[var(--color-win-strong)] text-[var(--text-inverse)] opacity-100 hover:bg-[var(--color-win-strong)]"
          : isSaving
            ? "w-full md:w-[148px] md:shrink-0 whitespace-nowrap pointer-events-none"
            : "w-full md:w-[148px] md:shrink-0 whitespace-nowrap"
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
  pokemonOptions,
  userDecks
}: ImportLogDialogProps) {
  const router = useRouter();
  const pathname = usePathname();
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

  useBodyScrollLock(isOpen);

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

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeDialog();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

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
  }

  function moveToReviewStage(nextReview: ParsedLogReview) {
    setReview(nextReview);
    setStage("review");
    setParseError(null);
    setSelectedSelfSprites(nextReview.selfSprites.slice(0, 2));
    setSelectedOpponentSprites(nextReview.opponentSprites.slice(0, 2));
    setSelectedDeckId(nextReview.suggestedLinkedDeckId ?? "");
    setSelectedDeckListId("");
    setSelectedDate(nextReview.date);
    setSelectedFormat(getDefaultSiteFormat());
    setSaveError("");
    setSaveState("idle");
  }

  async function handlePasteFromClipboard() {
    if (!navigator.clipboard?.readText) {
      setParseError("Clipboard paste is not available in this browser.");
      return;
    }

    try {
      setIsPasting(true);
      const clipboardText = await navigator.clipboard.readText();
      setRawLog(clipboardText);
      setParseError(null);
    } catch {
      setParseError("Unable to read from the clipboard right now.");
    } finally {
      setIsPasting(false);
    }
  }

  function handleReviewLog() {
    setParseError(null);
    const requestId = autoParseRequestIdRef.current + 1;
    autoParseRequestIdRef.current = requestId;

    startParseTransition(async () => {
      const formData = new FormData();
      formData.set("rawLog", rawLog);
      const result = await parseLogAction(formData);

      if (autoParseRequestIdRef.current !== requestId) {
        return;
      }

      if ("error" in result) {
        setParseError(result.error);
        return;
      }

      moveToReviewStage(result);
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
        setIsOpen(false);
        clearNavigationTimer();
        navigationTimerRef.current = window.setTimeout(() => {
          resetImportState();

          if (normalizeRedirectPath(result.redirectTo) === pathname) {
            router.refresh();
            return;
          }

          router.push(result.redirectTo);
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
      return;
    }

    const requestId = autoParseRequestIdRef.current + 1;
    autoParseRequestIdRef.current = requestId;

    const timeoutId = window.setTimeout(() => {
      startParseTransition(async () => {
        const formData = new FormData();
        formData.set("rawLog", trimmedRawLog);
        const result = await parseLogAction(formData);

        if (autoParseRequestIdRef.current !== requestId) {
          return;
        }

        if ("error" in result) {
          setParseError(result.error);
          return;
        }

        moveToReviewStage(result);
      });
    }, 500);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isOpen, isTrainingCourtUrl, stage, startParseTransition, trimmedRawLog]);

  function renderHeader() {
    if (stage === "raw") {
      return (
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-[1.55rem] font-bold tracking-[-0.05em] text-[var(--text-primary)] sm:text-[1.9rem]">
              Import PTCGL Log
            </h2>
          </div>
          <div className="grid w-full gap-2.5 sm:flex sm:w-auto sm:flex-wrap sm:justify-end">
            <Button className="w-full sm:w-auto" onClick={closeDialog} type="button" variant="secondary">
              Close
            </Button>
            {isTrainingCourtUrl ? (
              <Button
                className="w-full whitespace-normal text-center leading-5 sm:w-auto sm:whitespace-nowrap"
                disabled={isParsing || trimmedRawLog.length === 0}
                onClick={handleReviewLog}
                type="button"
              >
                {isParsing ? "Reviewing..." : "Import Training Court URL"}
              </Button>
            ) : null}
          </div>
        </div>
      );
    }

    return (
      <div className="relative flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <button
          aria-label="Close review"
          className="absolute right-0 top-0 inline-flex h-10 w-10 items-center justify-center rounded-full text-[var(--text-muted)] transition hover:bg-[var(--bg-surface-alt)] hover:text-[var(--text-primary)] md:hidden"
          onClick={closeDialog}
          type="button"
        >
          <CloseIcon className="h-5 w-5" />
        </button>
        <div className="pr-12 text-center md:pr-0 md:text-left">
          <h2 className="text-[1.3rem] font-bold tracking-[-0.05em] text-[var(--text-primary)] sm:text-[1.55rem] md:text-[1.9rem]">
            Review Battle Log
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--text-muted)] md:hidden">
            Confirm the parsed result, then save it to your battle logs.
          </p>
        </div>
        <div className="hidden flex-wrap gap-2.5 md:flex">
          <Button onClick={closeDialog} type="button" variant="secondary">
            Close
          </Button>
          <SaveButton onClick={() => formRef.current?.requestSubmit()} saveState={saveState} />
        </div>
      </div>
    );
  }

  return (
    <>
      <Button className={className} onClick={openDialog}>
        Import PTCGL Log
      </Button>

      {isOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              aria-modal="true"
              className="fixed inset-0 z-50 overflow-x-hidden bg-[var(--bg-overlay)] p-2 sm:p-4"
              onClick={closeDialog}
              role="dialog"
            >
              <div
                className="mx-auto flex max-h-[calc(100dvh-1rem)] w-full max-w-3xl min-w-0 flex-col overflow-hidden rounded-[24px] border border-[var(--border)] bg-[var(--bg-surface)] shadow-[var(--shadow-lg)] sm:max-h-[calc(100dvh-2rem)] sm:rounded-[28px]"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="shrink-0 border-b border-[var(--border)] px-4 py-4 sm:px-6 lg:px-8">
                  {renderHeader()}
                </div>

                <div
                  className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 pr-5 [scrollbar-gutter:stable] sm:px-6 sm:py-5 sm:pr-7 lg:px-8 lg:py-6 lg:pr-9"
                  ref={contentRef}
                >
              {stage === "review" && review ? (
                <form
                  className="flex flex-col gap-4 md:gap-6"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void handleSubmit(new FormData(event.currentTarget));
                  }}
                  ref={formRef}
                >
                  <input name="rawLog" type="hidden" value={rawLog} />
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
                    <p className="rounded-xl border border-[var(--color-loss-border)] bg-[var(--color-loss-bg)] px-4 py-3 text-sm text-[var(--color-loss)]">
                      {saveError}
                    </p>
                  ) : null}

                  <BattleLogSpritePicker
                    detectedLabel={detectedSelfLabel}
                    onChange={setSelectedSelfSprites}
                    pokemonOptions={pokemonOptions}
                    sprites={selectedSelfSprites}
                    title={`${review.selfPlayerName}'s deck`}
                  />

                  <BattleLogSpritePicker
                    detectedLabel={detectedOpponentLabel}
                    onChange={setSelectedOpponentSprites}
                    pokemonOptions={pokemonOptions}
                    sprites={selectedOpponentSprites}
                    title={"Opponent's deck"}
                  />

                  <section className="grid gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-surface-alt)] p-4 md:hidden">
                    <label className="grid gap-2">
                      <span className="text-sm font-semibold text-[var(--text-muted)]">Format</span>
                      <select
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/20"
                        onChange={(event) => setSelectedFormat(event.target.value)}
                        value={selectedFormat}
                      >
                        {SITE_FORMAT_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>

                    <details className="group rounded-xl border border-[var(--border)] bg-[var(--bg-surface)]">
                      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-[var(--text-primary)] [&::-webkit-details-marker]:hidden">
                        <span className="flex items-center justify-between gap-3">
                          More details
                          <ChevronIcon className="h-4 w-4 text-[var(--text-muted)] transition group-open:rotate-180" />
                        </span>
                      </summary>
                      <div className="grid gap-3 border-t border-[var(--border)] px-4 py-4">
                        <label className="grid gap-2">
                          <span className="text-sm font-semibold text-[var(--text-muted)]">Date</span>
                          <input
                            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface-alt)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/20"
                            onChange={(event) => setSelectedDate(event.target.value)}
                            type="date"
                            value={selectedDate}
                          />
                        </label>

                        <label className="grid gap-2">
                          <span className="text-sm font-semibold text-[var(--text-muted)]">
                            Deck Strategy
                          </span>
                          <select
                            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface-alt)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/20"
                            onChange={(event) => setSelectedDeckId(event.target.value)}
                            value={selectedDeckId}
                          >
                            <option value="">No linked deck</option>
                            {userDecks.map((deck) => (
                              <option key={deck.id} value={deck.id}>
                                {deck.deckName}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="grid gap-2">
                          <span className="text-sm font-semibold text-[var(--text-muted)]">
                            Deck List
                          </span>
                          <select
                            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface-alt)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/20 disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={availableDeckLists.length === 0}
                            onChange={(event) => setSelectedDeckListId(event.target.value)}
                            value={selectedDeckListId}
                          >
                            <option value="">
                              {availableDeckLists.length > 0
                                ? "No linked deck list"
                                : "Select a deck strategy first"}
                            </option>
                            {availableDeckLists.map((deckList: DeckList) => (
                              <option key={deckList.id} value={deckList.id}>
                                {deckList.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </details>
                  </section>

                  <section className="hidden gap-4 xl:grid-cols-2 md:grid">
                    <label className="grid gap-2">
                      <span className="text-sm font-semibold text-[var(--text-muted)]">Date</span>
                      <input
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface-alt)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/20"
                        onChange={(event) => setSelectedDate(event.target.value)}
                        type="date"
                        value={selectedDate}
                      />
                      <span aria-hidden="true" className="min-h-[20px] text-xs opacity-0">
                        Placeholder
                      </span>
                    </label>

                    <label className="grid gap-2">
                      <span className="text-sm font-semibold text-[var(--text-muted)]">Format</span>
                      <select
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface-alt)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/20"
                        onChange={(event) => setSelectedFormat(event.target.value)}
                        value={selectedFormat}
                      >
                        {SITE_FORMAT_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                      <span className="min-h-[20px] text-xs text-[var(--text-muted)]">
                        Defaulting to Latest Legal Format
                      </span>
                    </label>

                    <label className="grid gap-2">
                      <span className="text-sm font-semibold text-[var(--text-muted)]">
                        Deck Strategy
                      </span>
                      <select
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface-alt)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/20"
                        onChange={(event) => setSelectedDeckId(event.target.value)}
                        value={selectedDeckId}
                      >
                        <option value="">No linked deck</option>
                        {userDecks.map((deck) => (
                          <option key={deck.id} value={deck.id}>
                            {deck.deckName}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="grid gap-2">
                      <span className="text-sm font-semibold text-[var(--text-muted)]">
                        Deck List
                      </span>
                      <select
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface-alt)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/20 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={availableDeckLists.length === 0}
                        onChange={(event) => setSelectedDeckListId(event.target.value)}
                        value={selectedDeckListId}
                      >
                        <option value="">
                          {availableDeckLists.length > 0
                            ? "No linked deck list"
                            : "Select a deck strategy first"}
                        </option>
                        {availableDeckLists.map((deckList: DeckList) => (
                          <option key={deckList.id} value={deckList.id}>
                            {deckList.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </section>

                  <section className="grid gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-surface-alt)] p-4">
                    <p className="text-base font-semibold text-[var(--text-primary)]">
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

                  <div className="grid gap-3 md:hidden">
                    <SaveButton onClick={() => formRef.current?.requestSubmit()} saveState={saveState} />
                    <Button className="w-full" onClick={closeDialog} type="button" variant="secondary">
                      Close
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-col gap-6">
                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-[var(--text-muted)]">Battle log</span>
                    <textarea
                      className="min-h-[280px] w-full rounded-xl border border-[var(--border)] bg-[var(--bg-surface-alt)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/20"
                      onChange={(event) => setRawLog(event.target.value)}
                      placeholder="Paste your full PTCGL battle log here"
                      spellCheck={false}
                      value={rawLog}
                    />
                  </label>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Button
                      disabled={isPasting}
                      onClick={handlePasteFromClipboard}
                      type="button"
                      variant="secondary"
                    >
                      {isPasting ? "Pasting..." : "Paste From Clipboard"}
                    </Button>
                    <p className="text-sm text-[var(--text-muted)]">
                      Paste a PTCGL battle log to auto-review, or enter a Training Court URL and use
                      the button above.
                    </p>
                  </div>

                  {isParsing && !isTrainingCourtUrl ? (
                    <p className="rounded-xl border border-[var(--color-brand)]/15 bg-[var(--color-brand)]/5 px-4 py-3 text-sm text-[var(--color-brand)]">
                      Reviewing battle log…
                    </p>
                  ) : null}

                  {parseError ? (
                    <p className="rounded-xl border border-[var(--color-loss-border)] bg-[var(--color-loss-bg)] px-4 py-3 text-sm text-[var(--color-loss)]">
                      {parseError}
                    </p>
                  ) : null}
                </div>
              )}
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
