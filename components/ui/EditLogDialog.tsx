"use client";

import {
  cloneElement,
  isValidElement,
  useEffect,
  useMemo,
  useState,
  type ReactElement
} from "react";
import { useFormStatus } from "react-dom";
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

function SaveButton() {
  const { pending } = useFormStatus();

  return (
    <Button disabled={pending} type="submit">
      {pending ? "Saving..." : "Save Changes"}
    </Button>
  );
}

export function EditLogDialog({
  initialOpen = false,
  log,
  pokemonOptions,
  trigger,
  userDecks
}: EditLogDialogProps) {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [selectedSelfSprites, setSelectedSelfSprites] = useState(log.selfDeckSprites.slice(0, 2));
  const [selectedOpponentSprites, setSelectedOpponentSprites] = useState(
    log.opponentDeckSprites.slice(0, 2)
  );
  const [selectedDeckId, setSelectedDeckId] = useState(log.linkedDeckId ?? "");
  const [selectedDeckListId, setSelectedDeckListId] = useState(log.linkedDeckListId ?? "");
  const [selectedDate, setSelectedDate] = useState(log.date);
  const [selectedFormat, setSelectedFormat] = useState(log.format);

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

  function closeDialog() {
    setIsOpen(false);
    resetEditorState();
  }

  return (
    <>
      {isValidElement(trigger) ? (
        cloneElement(trigger, {
          ...trigger.props,
          onClick: () => setIsOpen(true)
        })
      ) : (
        <Button onClick={() => setIsOpen(true)} variant="secondary">
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
            <form action={updateLogAction} className="flex flex-col gap-6">
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
                  <SaveButton />
                </div>
              </div>

              <input name="logId" type="hidden" value={log.id} />
              <input name="date" type="hidden" value={selectedDate} />
              <input name="format" type="hidden" value={selectedFormat} />
              <input name="linkedDeckId" type="hidden" value={selectedDeckId} />
              <input name="linkedDeckListId" type="hidden" value={selectedDeckListId} />

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
