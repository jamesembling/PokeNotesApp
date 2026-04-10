"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  createTournamentAction,
  deleteTournamentAction,
  updateTournamentAction
} from "@/app/(app)/tournaments/actions";
import { BattleLogSpritePicker } from "@/components/ui/BattleLogSpritePicker";
import { Button } from "@/components/ui/Button";
import { useBodyScrollLock } from "@/lib/client/use-body-scroll-lock";
import { SITE_FORMAT_OPTIONS } from "@/lib/formats/options";
import {
  TOURNAMENT_CATEGORY_OPTIONS,
  TOURNAMENT_PLACEMENT_OPTIONS
} from "@/lib/tournaments/options";
import type { DeckSummary, PokemonOption, Tournament } from "@/types/index";

type TournamentEditorDialogProps = {
  decks: DeckSummary[];
  initialOpen?: boolean;
  pokemonOptions: PokemonOption[];
  tournament?: Tournament;
  triggerLabel: string;
  triggerVariant?: "primary" | "secondary" | "ghost";
};

type SaveState = "idle" | "saving" | "success";
type DeleteState = "idle" | "deleting";

const SUCCESS_CLOSE_DELAY_MS = 650;

function normalizeRedirectPath(value: string) {
  return value.split("?")[0] || value;
}

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
          ? "w-full pointer-events-none bg-[var(--color-win-strong)] text-[var(--text-inverse)] opacity-100 hover:bg-[var(--color-win-strong)] sm:w-[132px] sm:shrink-0"
          : "w-full sm:w-[132px] sm:shrink-0"
      }
      disabled={isSaving}
      onClick={onClick}
      type="button"
    >
      {isSaving ? "Saving..." : isSuccess ? "Saved" : isEditing ? "Save Changes" : "Create"}
    </Button>
  );
}

export function TournamentEditorDialog({
  decks,
  initialOpen = false,
  pokemonOptions,
  tournament,
  triggerLabel,
  triggerVariant = "primary"
}: TournamentEditorDialogProps) {
  const router = useRouter();
  const pathname = usePathname();
  const formRef = useRef<HTMLFormElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const navigationTimerRef = useRef<number | null>(null);
  const isEditing = Boolean(tournament?.id);
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [linkedDeckId, setLinkedDeckId] = useState(tournament?.linkedDeckId ?? "");
  const [deckName, setDeckName] = useState(tournament?.deckName ?? "");
  const [selectedSprites, setSelectedSprites] = useState<string[]>(tournament?.deckSprites.slice(0, 2) ?? []);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [deleteState, setDeleteState] = useState<DeleteState>("idle");
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [actionError, setActionError] = useState("");

  useBodyScrollLock(isOpen);

  const selectedDeck = useMemo(
    () => decks.find((deck) => deck.id === linkedDeckId) ?? null,
    [decks, linkedDeckId]
  );

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

  function resetState() {
    setLinkedDeckId(tournament?.linkedDeckId ?? "");
    setDeckName(tournament?.deckName ?? "");
    setSelectedSprites(tournament?.deckSprites.slice(0, 2) ?? []);
    setSaveState("idle");
    setDeleteState("idle");
    setShowDeleteConfirmation(false);
    setActionError("");
  }

  function closeDialog() {
    clearCloseTimer();
    clearNavigationTimer();
    setIsOpen(false);
    resetState();
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
    return () => {
      clearCloseTimer();
      clearNavigationTimer();
    };
  }, []);

  function handleLinkedDeckChange(nextDeckId: string) {
    setLinkedDeckId(nextDeckId);

    if (!nextDeckId) {
      return;
    }

    const nextDeck = decks.find((deck) => deck.id === nextDeckId);
    if (!nextDeck) {
      return;
    }

    setDeckName(nextDeck.deckName);
    setSelectedSprites(nextDeck.deckPokemon.slice(0, 2));
  }

  async function handleSubmit(formData: FormData) {
    setActionError("");
    setSaveState("saving");

    try {
      const result = await (isEditing ? updateTournamentAction(formData) : createTournamentAction(formData));
      setSaveState("success");

      clearCloseTimer();
      closeTimerRef.current = window.setTimeout(() => {
        setIsOpen(false);
        clearNavigationTimer();
        navigationTimerRef.current = window.setTimeout(() => {
          resetState();

          if (normalizeRedirectPath(result.redirectTo) === pathname) {
            router.refresh();
          } else {
            router.push(result.redirectTo);
          }
        }, 50);
      }, SUCCESS_CLOSE_DELAY_MS);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not save this tournament.");
      setSaveState("idle");
    }
  }

  async function handleDelete() {
    if (!tournament?.id) {
      return;
    }

    setActionError("");
    setDeleteState("deleting");

    try {
      const formData = new FormData();
      formData.set("tournamentId", tournament.id);
      const result = await deleteTournamentAction(formData);
      closeDialog();
      router.push(result.redirectTo);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not delete this tournament.");
      setDeleteState("idle");
    }
  }

  const isBusy = saveState === "saving" || deleteState === "deleting";

  return (
    <>
      <Button
        disabled={deleteState === "deleting"}
        onClick={() => {
          resetState();
          setIsOpen(true);
        }}
        variant={triggerVariant}
      >
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
            className="mx-auto flex max-h-[calc(100vh-2rem)] w-full max-w-3xl min-w-0 flex-col overflow-hidden rounded-[28px] border border-[var(--border)] bg-[var(--bg-surface)] p-3 shadow-[var(--shadow-lg)] sm:p-4 lg:p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden pr-1 [scrollbar-gutter:stable] sm:pr-2">
            <div className="mb-2 flex min-w-0 flex-col gap-4 border-b border-[var(--border)] pb-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <h2 className="text-[1.55rem] font-bold tracking-[-0.05em] text-[var(--text-primary)] sm:text-[1.9rem]">
                  {isEditing ? "Edit Tournament" : "New Tournament"}
                </h2>
              </div>

              <div className="grid w-full gap-2.5 sm:flex sm:w-auto sm:flex-wrap sm:justify-end">
                <Button onClick={closeDialog} type="button" variant="secondary">
                  Close
                </Button>
                {isEditing ? (
                  <Button
                    disabled={isBusy}
                    onClick={() => {
                      setActionError("");
                      setShowDeleteConfirmation((current) => !current);
                    }}
                    type="button"
                    variant="danger"
                  >
                    Delete
                  </Button>
                ) : null}
                <SaveButton
                  isEditing={isEditing}
                  onClick={() => formRef.current?.requestSubmit()}
                  saveState={saveState}
                />
              </div>
            </div>

            {isEditing && showDeleteConfirmation ? (
              <div className="mb-4 rounded-2xl border border-[var(--color-loss-border)] bg-[var(--color-loss-bg)] p-4">
                <p className="text-sm text-[var(--text-primary)]">
                  Delete this tournament and all of its rounds?
                </p>
                <div className="mt-3 grid gap-3 sm:flex sm:flex-wrap">
                  <Button disabled={deleteState === "deleting"} onClick={handleDelete} variant="danger">
                    {deleteState === "deleting" ? "Deleting..." : "Yes, delete"}
                  </Button>
                  <Button
                    disabled={deleteState === "deleting"}
                    onClick={() => setShowDeleteConfirmation(false)}
                    variant="secondary"
                  >
                    Keep Tournament
                  </Button>
                </div>
              </div>
            ) : null}

            {actionError ? (
              <div className="mb-4 rounded-2xl border border-[var(--color-loss-border)] bg-[var(--color-loss-bg)] p-4 text-sm text-[var(--color-loss)]">
                {actionError}
              </div>
            ) : null}

            <form
              action={handleSubmit}
              className="grid min-w-0 gap-5"
              ref={formRef}
            >
              {isEditing && tournament ? <input name="tournamentId" type="hidden" value={tournament.id} /> : null}
              <input name="redirectTo" type="hidden" value={pathname} />

              <div className="grid gap-2">
                <label className="text-sm font-semibold text-[var(--text-primary)]" htmlFor="tournament-name">
                  Tournament name
                </label>
                <input
                  className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface-alt)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--color-brand)]"
                  defaultValue={tournament?.name ?? ""}
                  id="tournament-name"
                  name="name"
                  placeholder="EUIC, local cup, online challenge..."
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <label className="text-sm font-semibold text-[var(--text-primary)]" htmlFor="tournament-date-from">
                    Start date
                  </label>
                  <input
                    className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface-alt)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--color-brand)]"
                    defaultValue={tournament?.dateFrom ?? ""}
                    id="tournament-date-from"
                    name="dateFrom"
                    type="date"
                  />
                </div>

                <div className="grid gap-2">
                  <label className="text-sm font-semibold text-[var(--text-primary)]" htmlFor="tournament-date-to">
                    End date
                  </label>
                  <input
                    className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface-alt)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--color-brand)]"
                    defaultValue={tournament?.dateTo ?? ""}
                    id="tournament-date-to"
                    name="dateTo"
                    type="date"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <label className="text-sm font-semibold text-[var(--text-primary)]" htmlFor="tournament-linked-deck">
                    Link to deck strategy
                  </label>
                  <select
                    className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface-alt)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--color-brand)]"
                    id="tournament-linked-deck"
                    name="linkedDeckId"
                    onChange={(event) => handleLinkedDeckChange(event.target.value)}
                    value={linkedDeckId}
                  >
                    <option value="">No linked deck</option>
                    {decks.map((deck) => (
                      <option key={deck.id} value={deck.id}>
                        {deck.deckName}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid gap-2">
                  <label className="text-sm font-semibold text-[var(--text-primary)]" htmlFor="tournament-deck-name">
                    Deck name
                  </label>
                  <input
                    className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface-alt)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--color-brand)] disabled:cursor-not-allowed disabled:opacity-60"
                    id="tournament-deck-name"
                    name="deckName"
                    onChange={(event) => setDeckName(event.target.value)}
                    placeholder="Dragapult / Dusknoir"
                    value={deckName}
                  />
                </div>
              </div>

              {selectedSprites.map((slug, index) => (
                <input
                  key={`tournament-sprite-${slug}-${index}`}
                  name="deckSprites"
                  type="hidden"
                  value={slug}
                />
              ))}

              <BattleLogSpritePicker
                onChange={setSelectedSprites}
                pokemonOptions={pokemonOptions}
                sprites={selectedSprites}
                title="Tournament sprites"
              />

              <div className="grid gap-4 md:grid-cols-3">
                <div className="grid gap-2">
                  <label className="text-sm font-semibold text-[var(--text-primary)]" htmlFor="tournament-category">
                    Category
                  </label>
                  <select
                    className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface-alt)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--color-brand)]"
                    defaultValue={tournament?.category ?? ""}
                    id="tournament-category"
                    name="category"
                  >
                    <option value="">Select category</option>
                    {TOURNAMENT_CATEGORY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid gap-2">
                  <label className="text-sm font-semibold text-[var(--text-primary)]" htmlFor="tournament-placement">
                    Placement
                  </label>
                  <select
                    className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface-alt)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--color-brand)]"
                    defaultValue={tournament?.placement ?? ""}
                    id="tournament-placement"
                    name="placement"
                  >
                    <option value="">Select placement</option>
                    {TOURNAMENT_PLACEMENT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid gap-2">
                  <label className="text-sm font-semibold text-[var(--text-primary)]" htmlFor="tournament-format">
                    Format
                  </label>
                  <select
                    className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface-alt)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--color-brand)]"
                    defaultValue={tournament?.format ?? ""}
                    id="tournament-format"
                    name="format"
                  >
                    <option value="">Select format</option>
                    {SITE_FORMAT_OPTIONS.map((format) => (
                      <option key={format} value={format}>
                        {format}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-semibold text-[var(--text-primary)]" htmlFor="tournament-notes">
                  Notes
                </label>
                <textarea
                  className="min-h-32 rounded-xl border border-[var(--border)] bg-[var(--bg-surface-alt)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--color-brand)]"
                  defaultValue={tournament?.notes ?? ""}
                  id="tournament-notes"
                  name="notes"
                  placeholder="Takeaways, matchup notes, prep notes..."
                />
              </div>
            </form>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
