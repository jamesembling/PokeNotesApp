"use client";

import {
  cloneElement,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { updateLogAction } from "@/app/(app)/logs/actions";
import { BattleLogSpritePicker } from "@/components/ui/BattleLogSpritePicker";
import { Button } from "@/components/ui/Button";
import { getBattleLogDeckDisplayName } from "@/lib/battle-log/display";
import type { BattleLog, DeckList, DeckSummary, PokemonOption } from "@/types/index";

type EditLogDialogProps = {
  initialOpen?: boolean;
  log: BattleLog;
  pokemonOptions: PokemonOption[];
  trigger?: ReactElement<{ onClick?: () => void }>;
  userDecks: DeckSummary[];
};

type SaveState = "idle" | "saving" | "success";

const SUCCESS_CLOSE_DELAY_MS = 650;

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
          ? "w-[148px] shrink-0 whitespace-nowrap pointer-events-none bg-[var(--color-win-strong)] text-[var(--text-inverse)] opacity-100 hover:bg-[var(--color-win-strong)]"
          : isSaving
            ? "w-[148px] shrink-0 whitespace-nowrap pointer-events-none"
            : "w-[148px] shrink-0 whitespace-nowrap"
      }
      disabled={isSaving}
      onClick={onClick}
      type="button"
    >
      {isSaving ? "Saving..." : isSuccess ? "Saved" : "Save Changes"}
    </Button>
  );
}

function normalizeRedirectPath(value: string) {
  return value.split("?")[0] || value;
}

export function EditLogDialog({
  initialOpen = false,
  log,
  pokemonOptions,
  trigger,
  userDecks
}: EditLogDialogProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [selectedSelfSprites, setSelectedSelfSprites] = useState(log.selfDeckSprites.slice(0, 2));
  const [selectedOpponentSprites, setSelectedOpponentSprites] = useState(
    log.opponentDeckSprites.slice(0, 2)
  );
  const [selectedDeckId, setSelectedDeckId] = useState(log.linkedDeckId ?? "");
  const [selectedDeckListId, setSelectedDeckListId] = useState(log.linkedDeckListId ?? "");
  const [selectedDate, setSelectedDate] = useState(log.date);
  const [selectedFormat, setSelectedFormat] = useState(log.format);
  const [saveError, setSaveError] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const closeTimerRef = useRef<number | null>(null);
  const navigationTimerRef = useRef<number | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  const selectedDeck = useMemo(
    () => userDecks.find((deck) => deck.id === selectedDeckId) ?? null,
    [selectedDeckId, userDecks]
  );
  const detectedSelfLabel = useMemo(
    () => getBattleLogDeckDisplayName(log.selfDeckName, selectedSelfSprites),
    [log.selfDeckName, selectedSelfSprites]
  );
  const detectedOpponentLabel = useMemo(
    () => getBattleLogDeckDisplayName(log.opponentDeckName, selectedOpponentSprites),
    [log.opponentDeckName, selectedOpponentSprites]
  );
  const formatOptions = FORMAT_OPTIONS.includes(selectedFormat as (typeof FORMAT_OPTIONS)[number])
    ? [...FORMAT_OPTIONS]
    : [selectedFormat, ...FORMAT_OPTIONS];

  const availableDeckLists = selectedDeck?.deckLists ?? [];

  function resetEditorState() {
    setSelectedSelfSprites(log.selfDeckSprites.slice(0, 2));
    setSelectedOpponentSprites(log.opponentDeckSprites.slice(0, 2));
    setSelectedDeckId(log.linkedDeckId ?? "");
    setSelectedDeckListId(log.linkedDeckListId ?? "");
    setSelectedDate(log.date);
    setSelectedFormat(log.format);
    setSaveError("");
    setSaveState("idle");
  }

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    resetEditorState();

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
  }, [isOpen, log]);

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

  function closeDialog() {
    clearCloseTimer();
    clearNavigationTimer();
    setIsOpen(false);
    resetEditorState();
  }

  async function handleSubmit(formData: FormData) {
    setSaveError("");
    setSaveState("saving");

    try {
      const result = await updateLogAction(formData);
      setSaveState("success");

      clearCloseTimer();
      closeTimerRef.current = window.setTimeout(() => {
        setIsOpen(false);
        clearNavigationTimer();
        navigationTimerRef.current = window.setTimeout(() => {
          resetEditorState();

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

  return (
    <>
      {isValidElement(trigger) ? (
        cloneElement(trigger, {
          ...trigger.props,
          onClick: () => {
            setSaveError("");
            setSaveState("idle");
            setIsOpen(true);
          }
        })
      ) : (
        <Button
          onClick={() => {
            setSaveError("");
            setSaveState("idle");
            setIsOpen(true);
          }}
          variant="secondary"
        >
          Edit Log
        </Button>
      )}

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
            <div className="mb-6 flex flex-col gap-4 border-b border-[var(--border)] pb-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-[1.55rem] font-bold tracking-[-0.05em] text-[var(--text-primary)] sm:text-[1.9rem]">
                  Edit Battle Log
                </h2>
              </div>
              <div className="flex flex-wrap gap-2.5">
                <Button onClick={closeDialog} type="button" variant="secondary">
                  Close
                </Button>
                <SaveButton onClick={() => formRef.current?.requestSubmit()} saveState={saveState} />
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
              <input name="logId" type="hidden" value={log.id} />
              <input name="date" type="hidden" value={selectedDate} />
              <input name="format" type="hidden" value={selectedFormat} />
              <input name="linkedDeckId" type="hidden" value={selectedDeckId} />
              <input name="linkedDeckListId" type="hidden" value={selectedDeckListId} />
              <input name="redirectTo" type="hidden" value={pathname} />

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
                title={`${log.selfPlayerName}'s deck`}
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
                    {formatOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <span className="min-h-[20px] text-xs text-[var(--text-muted)]">
                    Update the saved format shown in your battle log history
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
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
