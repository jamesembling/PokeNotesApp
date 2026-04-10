"use client";

import { cloneElement, isValidElement, type ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  deleteTournamentRoundAction,
  saveTournamentRoundAction
} from "@/app/(app)/tournaments/actions";
import { BattleLogSpritePicker } from "@/components/ui/BattleLogSpritePicker";
import { Button } from "@/components/ui/Button";
import { useBodyScrollLock } from "@/lib/client/use-body-scroll-lock";
import { TOURNAMENT_ROUND_RESULT_OPTIONS } from "@/lib/tournaments/options";
import type { PokemonOption, TournamentRound } from "@/types/index";

type TournamentRoundEditorDialogProps = {
  initialOpen?: boolean;
  pokemonOptions: PokemonOption[];
  round?: TournamentRound;
  suggestedRoundNumber: number;
  tournamentId: string;
  trigger?: ReactElement<{ onClick?: () => void }>;
  triggerLabel: string;
  triggerVariant?: "primary" | "secondary" | "ghost";
};

type SaveState = "idle" | "saving" | "success";
type DeleteState = "idle" | "deleting";

const SUCCESS_CLOSE_DELAY_MS = 650;

function normalizeRedirectPath(value: string) {
  return value.split("?")[0] || value;
}

export function TournamentRoundEditorDialog({
  initialOpen = false,
  pokemonOptions,
  round,
  suggestedRoundNumber,
  tournamentId,
  trigger,
  triggerLabel,
  triggerVariant = "secondary"
}: TournamentRoundEditorDialogProps) {
  const router = useRouter();
  const pathname = usePathname();
  const formRef = useRef<HTMLFormElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const navigationTimerRef = useRef<number | null>(null);
  const isEditing = Boolean(round?.id);
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [selectedSprites, setSelectedSprites] = useState<string[]>(round?.opponentDeckSprites.slice(0, 2) ?? []);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [deleteState, setDeleteState] = useState<DeleteState>("idle");
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [actionError, setActionError] = useState("");

  useBodyScrollLock(isOpen);

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
    setSelectedSprites(round?.opponentDeckSprites.slice(0, 2) ?? []);
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

  async function handleSubmit(formData: FormData) {
    setActionError("");
    setSaveState("saving");

    try {
      const result = await saveTournamentRoundAction(formData);
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
      setActionError(error instanceof Error ? error.message : "Could not save this round.");
      setSaveState("idle");
    }
  }

  async function handleDelete() {
    if (!round?.id) {
      return;
    }

    setActionError("");
    setDeleteState("deleting");

    try {
      const formData = new FormData();
      formData.set("tournamentId", tournamentId);
      formData.set("roundId", round.id);
      const result = await deleteTournamentRoundAction(formData);
      closeDialog();
      router.push(result.redirectTo);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not delete this round.");
      setDeleteState("idle");
    }
  }

  const isBusy = saveState === "saving" || deleteState === "deleting";
  const triggerElement = isValidElement(trigger) ? (
    cloneElement(trigger, {
      ...trigger.props,
      onClick: () => {
        resetState();
        setIsOpen(true);
      }
    })
  ) : (
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
  );

  return (
    <>
      {triggerElement}

      {isOpen ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 overflow-x-hidden bg-[var(--bg-overlay)] p-4"
          onClick={closeDialog}
          role="dialog"
        >
          <div
            className="mx-auto flex max-h-[calc(100vh-2rem)] w-full max-w-2xl min-w-0 flex-col overflow-hidden rounded-[28px] border border-[var(--border)] bg-[var(--bg-surface)] p-3 shadow-[var(--shadow-lg)] sm:p-4 lg:p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden pr-1 [scrollbar-gutter:stable] sm:pr-2">
            <div className="mb-2 flex min-w-0 flex-col gap-4 border-b border-[var(--border)] pb-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <h2 className="text-[1.55rem] font-bold tracking-[-0.05em] text-[var(--text-primary)] sm:text-[1.9rem]">
                  {isEditing ? `Edit Round ${round?.roundNumber}` : "Add Round"}
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
                <Button
                  disabled={saveState === "saving"}
                  onClick={() => formRef.current?.requestSubmit()}
                  type="button"
                >
                  {saveState === "saving"
                    ? "Saving..."
                    : saveState === "success"
                      ? "Saved"
                      : isEditing
                        ? "Save Changes"
                        : "Add Round"}
                </Button>
              </div>
            </div>

            {isEditing && showDeleteConfirmation ? (
              <div className="mb-4 rounded-2xl border border-[var(--color-loss-border)] bg-[var(--color-loss-bg)] p-4">
                <p className="text-sm text-[var(--text-primary)]">
                  Delete this round from the tournament?
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
                    Keep Round
                  </Button>
                </div>
              </div>
            ) : null}

            {actionError ? (
              <div className="mb-4 rounded-2xl border border-[var(--color-loss-border)] bg-[var(--color-loss-bg)] p-4 text-sm text-[var(--color-loss)]">
                {actionError}
              </div>
            ) : null}

            <form action={handleSubmit} className="grid min-w-0 gap-5" ref={formRef}>
              <input name="tournamentId" type="hidden" value={tournamentId} />
              <input name="redirectTo" type="hidden" value={pathname} />
              {isEditing && round ? <input name="roundId" type="hidden" value={round.id} /> : null}
              {selectedSprites.map((slug, index) => (
                <input
                  key={`round-sprite-${slug}-${index}`}
                  name="opponentDeckSprites"
                  type="hidden"
                  value={slug}
                />
              ))}

              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <label className="text-sm font-semibold text-[var(--text-primary)]" htmlFor="round-number">
                    Round number
                  </label>
                  <input
                    className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface-alt)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--color-brand)]"
                    defaultValue={round?.roundNumber ?? suggestedRoundNumber}
                    id="round-number"
                    min={1}
                    name="roundNumber"
                    type="number"
                  />
                </div>

                <div className="grid gap-2">
                  <label className="text-sm font-semibold text-[var(--text-primary)]" htmlFor="round-result">
                    Result
                  </label>
                  <select
                    className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface-alt)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--color-brand)]"
                    defaultValue={round?.result ?? "Win"}
                    id="round-result"
                    name="result"
                  >
                    {TOURNAMENT_ROUND_RESULT_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-semibold text-[var(--text-primary)]" htmlFor="round-opponent-deck">
                  Opponent deck
                </label>
                <input
                  className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface-alt)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--color-brand)]"
                  defaultValue={round?.opponentDeckName ?? ""}
                  id="round-opponent-deck"
                  name="opponentDeckName"
                  placeholder="Raging Bolt, Gardevoir, Lugia..."
                />
              </div>

              <BattleLogSpritePicker
                onChange={setSelectedSprites}
                pokemonOptions={pokemonOptions}
                sprites={selectedSprites}
                title="Opponent deck"
              />

              <div className="grid gap-2">
                <label className="text-sm font-semibold text-[var(--text-primary)]" htmlFor="round-notes">
                  Notes
                </label>
                <textarea
                  className="min-h-28 rounded-xl border border-[var(--border)] bg-[var(--bg-surface-alt)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--color-brand)]"
                  defaultValue={round?.notes ?? ""}
                  id="round-notes"
                  name="notes"
                  placeholder="Important lines, techs, mistakes, takeaways..."
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
