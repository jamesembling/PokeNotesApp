"use client";

import { cloneElement, isValidElement, type ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  deleteTournamentRoundAction,
  saveTournamentRoundAction
} from "@/app/(app)/tournaments/actions";
import { AppSelect } from "@/components/ui/AppSelect";
import { BattleLogSpritePicker } from "@/components/ui/BattleLogSpritePicker";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle
} from "@/components/shadcn/dialog";
import { Checkbox } from "@/components/shadcn/checkbox";
import { Textarea } from "@/components/shadcn/textarea";
import {
  TOURNAMENT_ROUND_GAME_RESULT_OPTIONS,
  TOURNAMENT_ROUND_SPECIAL_RESULT_OPTIONS
} from "@/lib/tournaments/options";
import { getRoundResultGameTokens, getRoundSpecialResult } from "@/lib/tournaments/display";
import type { PokemonOption, TournamentRound, TournamentRoundSpecialResult } from "@/types/index";

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
  const roundSpecialResult = round?.result ? getRoundSpecialResult(round.result) : null;
  const roundGameDefaults = round?.result ? getRoundResultGameTokens(round.result) : [];
  const gameDefaults = roundSpecialResult
    ? ["", "", ""]
    : [
      roundGameDefaults[0] ?? "",
      roundGameDefaults[1] ?? "",
      roundGameDefaults[2] ?? ""
    ];
  const router = useRouter();
  const pathname = usePathname();
  const formRef = useRef<HTMLFormElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const navigationTimerRef = useRef<number | null>(null);
  const isEditing = Boolean(round?.id);
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [selectedSprites, setSelectedSprites] = useState<string[]>(round?.opponentDeckSprites.slice(0, 2) ?? []);
  const [specialResult, setSpecialResult] = useState<TournamentRoundSpecialResult | "">(roundSpecialResult ?? "");
  const [gameResults, setGameResults] = useState<string[]>([
    gameDefaults[0] ?? "",
    gameDefaults[1] ?? "",
    gameDefaults[2] ?? ""
  ]);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [deleteState, setDeleteState] = useState<DeleteState>("idle");
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [actionError, setActionError] = useState("");

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
    setSpecialResult(roundSpecialResult ?? "");
    setGameResults([
      gameDefaults[0] ?? "",
      gameDefaults[1] ?? "",
      gameDefaults[2] ?? ""
    ]);
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
    return () => {
      clearCloseTimer();
      clearNavigationTimer();
    };
  }, []);

  async function handleSubmit(formData: FormData) {
    setActionError("");
    setSaveState("saving");

    const result = await saveTournamentRoundAction(formData);

    if (!result.ok) {
      setActionError(result.message);
      setSaveState("idle");
      return;
    }

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
  }

  async function handleDelete() {
    if (!round?.id) {
      return;
    }

    setActionError("");
    setDeleteState("deleting");

    const formData = new FormData();
    formData.set("tournamentId", tournamentId);
    formData.set("roundId", round.id);
    const result = await deleteTournamentRoundAction(formData);

    if (!result.ok) {
      setActionError(result.message);
      setDeleteState("idle");
      return;
    }

    closeDialog();
    router.push(result.redirectTo);
  }

  const isBusy = saveState === "saving" || deleteState === "deleting";
  const openDialog = () => {
    resetState();
    setIsOpen(true);
  };
  const triggerElement = isValidElement(trigger) ? (
    cloneElement(trigger, {
      ...trigger.props,
      onClick: openDialog
    })
  ) : (
    <Button
      disabled={deleteState === "deleting"}
      onClick={openDialog}
      variant={triggerVariant}
    >
      {triggerLabel}
    </Button>
  );

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          openDialog();
        } else {
          closeDialog();
        }
      }}
      open={isOpen}
    >
      {triggerElement}

      <DialogContent
        className="flex max-h-[calc(100dvh-2rem)] max-w-2xl min-w-0 flex-col overflow-hidden rounded-[28px] border border-[var(--border)] bg-[var(--bg-surface)] p-3 shadow-[var(--shadow-lg)] sm:max-w-2xl sm:p-4 lg:p-5"
        showCloseButton={false}
      >
            <div className="min-h-0 min-w-0 flex-1 touch-pan-y overflow-y-auto overflow-x-hidden overscroll-contain pr-1 [-webkit-overflow-scrolling:touch] [scrollbar-gutter:stable] sm:pr-2">
            <div className="mb-2 flex min-w-0 flex-col gap-4 border-b border-[var(--border)] pb-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <DialogTitle className="text-[1.55rem] font-bold tracking-[-0.05em] text-[var(--text-primary)] sm:text-[1.9rem]">
                  {isEditing ? `Edit Round ${round?.roundNumber}` : "Add Round"}
                </DialogTitle>
                <DialogDescription className="sr-only">
                  {isEditing ? "Update this tournament round result, Pokemon, and notes." : "Add a tournament round result, Pokemon, and notes."}
                </DialogDescription>
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

              <div className="grid gap-4">
                <div className="grid gap-2">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">Result</p>
                  <div className="grid gap-2">
                    <div className="flex flex-wrap gap-x-5 gap-y-2">
                      {TOURNAMENT_ROUND_SPECIAL_RESULT_OPTIONS.map((option) => {
                        const fieldName =
                          option.value === "BYE"
                            ? "isBye"
                            : option.value === "ID"
                              ? "isId"
                              : "isNoShow";

                        return (
                          <label
                            className="inline-flex w-fit items-center gap-2 text-sm"
                            htmlFor={`round-special-${fieldName}`}
                            key={option.value}
                          >
                            <Checkbox
                              checked={specialResult === option.value}
                              className="h-4 w-4 accent-[var(--color-win)]"
                              id={`round-special-${fieldName}`}
                              name={fieldName}
                              onCheckedChange={(checked) => {
                                const nextSpecialResult = checked ? option.value : "";
                                setSpecialResult(nextSpecialResult);
                                if (nextSpecialResult) {
                                  setGameResults(["", "", ""]);
                                }
                              }}
                            />
                            {option.label}
                          </label>
                        );
                      })}
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      {[0, 1, 2].map((index) => (
                        <label
                          className="grid gap-1 text-sm"
                          htmlFor={`round-game-${index + 1}`}
                          key={index}
                        >
                          Game {index + 1}
                          <AppSelect
                            className="min-h-[3rem] rounded-xl px-4 py-3"
                            disabled={Boolean(specialResult)}
                            id={`round-game-${index + 1}`}
                            name={`game${index + 1}`}
                            onChange={(value) => {
                              const next = [...gameResults];
                              next[index] = value;
                              setGameResults(next);
                            }}
                            options={[
                              { label: "-", value: "" },
                              ...TOURNAMENT_ROUND_GAME_RESULT_OPTIONS.map((option) => ({
                                label: option,
                                value: option
                              }))
                            ]}
                            value={gameResults[index]}
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
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
                <Textarea
                  className="min-h-28 rounded-xl border border-[var(--border)] bg-[var(--bg-surface-alt)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--color-brand)]"
                  defaultValue={round?.notes ?? ""}
                  id="round-notes"
                  name="notes"
                  placeholder="Important lines, techs, mistakes, takeaways..."
                />
              </div>
            </form>
            </div>
      </DialogContent>
    </Dialog>
  );
}
