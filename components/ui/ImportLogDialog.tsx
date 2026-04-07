"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { importLogAction, parseLogAction } from "@/app/(app)/logs/actions";
import { BattleLogSpritePicker } from "@/components/ui/BattleLogSpritePicker";
import { Button } from "@/components/ui/Button";
import { getBattleLogDeckDisplayName } from "@/lib/battle-log/display";
import type { DeckList, DeckSummary, ParsedLogReview, PokemonOption } from "@/types/index";

type ImportLogDialogProps = {
  className?: string;
  pokemonOptions: PokemonOption[];
  userDecks: DeckSummary[];
  userId: string;
};

type Stage = "raw" | "review";

const FORMAT_OPTIONS = [
  "SVI-ASC",
  "SVI-PRE",
  "SVI-SSP",
  "SVI-TWM",
  "SVI-SFA",
  "SVI-OBF",
  "SVI-PAR",
  "SVI-PAL",
  "SVI-MEW",
  "SVI-TEF",
  "SVI-BRS"
] as const;

function ResultChip({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--bg-surface-alt)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)]">
      {children}
    </span>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();

  return (
    <Button disabled={pending} type="submit">
      {pending ? "Saving..." : "Confirm"}
    </Button>
  );
}

export function ImportLogDialog({
  className,
  pokemonOptions,
  userDecks,
  userId
}: ImportLogDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
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
  const [isParsing, startParseTransition] = useTransition();

  const selectedDeck = useMemo(
    () => userDecks.find((deck) => deck.id === selectedDeckId) ?? null,
    [selectedDeckId, userDecks]
  );

  const availableDeckLists = selectedDeck?.deckLists ?? [];
  const resultLabel = review?.result === "Loss" ? "L" : "W";
  const detectedSelfLabel = useMemo(
    () =>
      review ? getBattleLogDeckDisplayName(review.selfDeckName, selectedSelfSprites) : undefined,
    [review, selectedSelfSprites]
  );
  const detectedOpponentLabel = useMemo(
    () =>
      review
        ? getBattleLogDeckDisplayName(review.opponentDeckName, selectedOpponentSprites)
        : undefined,
    [review, selectedOpponentSprites]
  );

  function resetImportState() {
    setStage("raw");
    setRawLog("");
    setParseError(null);
    setReview(null);
    setSelectedSelfSprites([]);
    setSelectedOpponentSprites([]);
    setSelectedDeckId("");
    setSelectedDeckListId("");
    setSelectedDate("");
    setSelectedFormat("");
    setIsPasting(false);
  }

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeDialog();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

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
    setIsOpen(true);
  }

  function closeDialog() {
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
    setSelectedFormat(FORMAT_OPTIONS.includes("SVI-ASC") ? "SVI-ASC" : "");
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
    startParseTransition(async () => {
      const formData = new FormData();
      formData.set("rawLog", rawLog);
      const result = await parseLogAction(formData);

      if ("error" in result) {
        setParseError(result.error);
        return;
      }

      moveToReviewStage(result);
    });
  }

  function renderHeader() {
    if (stage === "raw") {
      return (
        <div className="mb-6 flex flex-col gap-4 border-b border-[var(--border)] pb-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-[1.55rem] font-bold tracking-[-0.05em] text-[var(--text-primary)] sm:text-[1.9rem]">
              Import PTCGL Log
            </h2>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <Button onClick={closeDialog} type="button" variant="secondary">
              Close
            </Button>
            <Button
              disabled={isParsing || rawLog.trim().length === 0}
              onClick={handleReviewLog}
              type="button"
            >
              {isParsing ? "Reviewing..." : "Review Log"}
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="mb-6 flex flex-col gap-4 border-b border-[var(--border)] pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-[1.55rem] font-bold tracking-[-0.05em] text-[var(--text-primary)] sm:text-[1.9rem]">
            Review Battle Log
          </h2>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Button onClick={closeDialog} type="button" variant="secondary">
            Close
          </Button>
          <SaveButton />
        </div>
      </div>
    );
  }

  return (
    <>
      <Button className={className} data-user-id={userId} onClick={openDialog}>
        Import PTCGL Log
      </Button>

      {isOpen ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 bg-[var(--bg-overlay)] p-4"
          onClick={closeDialog}
          role="dialog"
        >
          <div
            className="mx-auto flex max-h-[calc(100vh-2rem)] w-full max-w-3xl flex-col overflow-y-auto rounded-[28px] border border-[var(--border)] bg-[var(--bg-surface)] p-6 shadow-[var(--shadow-lg)] lg:p-8"
            onClick={(event) => event.stopPropagation()}
          >
            {stage === "review" && review ? (
              <form action={importLogAction} className="flex flex-col gap-6">
                {renderHeader()}

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
                  <input key={`self-sprite-${slug}-${index}`} name="selfSprites" type="hidden" value={slug} />
                ))}
                {selectedOpponentSprites.map((slug, index) => (
                  <input
                    key={`opponent-sprite-${slug}-${index}`}
                    name="opponentSprites"
                    type="hidden"
                    value={slug}
                  />
                ))}

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

                <section className="grid gap-4 md:grid-cols-2">
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
                      {FORMAT_OPTIONS.map((option) => (
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
                    <span className="text-sm font-semibold text-[var(--text-muted)]">Deck List</span>
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
                  <div className="flex flex-wrap gap-2">
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
              </form>
            ) : (
              <div className="flex flex-col gap-6">
                {renderHeader()}

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
                    Paste a PTCGL battle log or a Training Court log URL
                  </p>
                </div>

                {parseError ? (
                  <p className="rounded-xl border border-[var(--color-loss-border)] bg-[var(--color-loss-bg)] px-4 py-3 text-sm text-[var(--color-loss)]">
                    {parseError}
                  </p>
                ) : null}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
