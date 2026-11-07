"use client";

import { cloneElement, isValidElement, type ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  deleteTournamentRoundAction,
  saveTournamentRoundAction
} from "@/app/(app)/tournaments/actions";
import { Alert, AlertDescription } from "@/components/shadcn/alert";
import { BattleLogSpritePicker } from "@/components/ui/BattleLogSpritePicker";
import { Button } from "@/components/shadcn/button";
import { ButtonGroup } from "@/components/shadcn/button-group";
import {
  AppDialogContent,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogMobileFooter
} from "@/components/ui/AppDialog";
import { Dialog } from "@/components/shadcn/dialog";
import { Textarea } from "@/components/shadcn/textarea";
import {
  TOURNAMENT_ROUND_GAME_RESULT_OPTIONS,
  TOURNAMENT_ROUND_SPECIAL_RESULT_OPTIONS
} from "@/lib/tournaments/options";
import { getRoundResultGameTokens, getRoundSpecialResult } from "@/lib/tournaments/display";
import {
  toggleRoundGameResult,
  toggleRoundSpecialResult
} from "@/lib/tournaments/round-result-selection";
import { cn } from "@/lib/utils";
import type { PokemonOption, TournamentRound, TournamentRoundSpecialResult } from "@/types/index";
import { normalizeRedirectPath } from "@/lib/client/redirect-path";

type TournamentRoundEditorDialogProps = {
  initialOpen?: boolean;
  pokemonOptions: PokemonOption[];
  round?: TournamentRound;
  tournamentId: string;
  trigger?: ReactElement<{ onClick?: () => void }>;
  triggerClassName?: string;
  triggerLabel: string;
  triggerVariant?: "default" | "outline" | "ghost";
};

type SaveState = "idle" | "saving" | "success";
type DeleteState = "idle" | "deleting";

const SUCCESS_CLOSE_DELAY_MS = 650;

function SaveButton({
  isEditing,
  onClick,
  saveState,
  variant = "default"
}: {
  isEditing: boolean;
  onClick: () => void;
  saveState: SaveState;
  variant?: "default" | "outline";
}) {
  const label = saveState === "saving"
    ? "Saving..."
    : saveState === "success"
      ? "Saved"
      : isEditing
        ? "Save Changes"
        : "Add Round";

  return (
    <Button
      aria-disabled={saveState === "saving" || saveState === "success"}
      className="sm:min-w-32"
      disabled={saveState === "saving"}
      onClick={onClick}
      type="button"
      variant={variant}
    >
      {label}
    </Button>
  );
}

function getGameResultButtonClassName(option: string, isSelected: boolean) {
  return cn(
    "min-h-11 gap-1 border-0 border-r border-border px-3 py-2 text-base font-bold last:border-r-0 sm:text-sm",
    option === "W" && "[border-radius:calc(var(--radius)-1px)_0_0_calc(var(--radius)-1px)]",
    option === "L" && "rounded-none",
    option === "T" && "[border-radius:0_calc(var(--radius)-1px)_calc(var(--radius)-1px)_0]",
    isSelected && option === "W" &&
      "bg-win-bg text-win-strong shadow-[inset_0_0_0_2px_var(--color-win-strong)] hover:bg-win-bg hover:text-win-strong",
    isSelected && option === "L" &&
      "bg-loss-bg text-loss-strong shadow-[inset_0_0_0_2px_var(--color-loss-strong)] hover:bg-loss-bg hover:text-loss-strong",
    isSelected && option === "T" &&
      "bg-warning-bg text-warning-strong shadow-[inset_0_0_0_2px_var(--color-warning-strong)] hover:bg-warning-bg hover:text-warning-strong",
    !isSelected && "bg-transparent text-card-foreground hover:bg-muted hover:text-card-foreground"
  );
}

export function TournamentRoundEditorDialog({
  initialOpen = false,
  pokemonOptions,
  round,
  tournamentId,
  trigger,
  triggerClassName,
  triggerLabel,
  triggerVariant = "outline"
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
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const navigationTimerRef = useRef<number | null>(null);
  const isEditing = Boolean(round?.id);
  const [creationKey] = useState(() => crypto.randomUUID());
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

  function resetHorizontalScroll() {
    window.requestAnimationFrame(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollLeft = 0;
      }
    });
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
    formData.set("expectedUpdatedAt", round.updatedAt);
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
      className={triggerClassName}
      disabled={deleteState === "deleting"}
      onClick={openDialog}
      variant={triggerVariant}
    >
      {triggerLabel}
    </Button>
  );
  const deleteButton = isEditing ? (
    <Button
      disabled={isBusy}
      onClick={() => {
        setActionError("");
        setShowDeleteConfirmation((current) => !current);
      }}
      type="button"
      variant="destructive"
    >
      Delete
    </Button>
  ) : null;

  const desktopCancelButton = (
    <Button disabled={isBusy} onClick={closeDialog} type="button" variant="outline">
      Cancel
    </Button>
  );

  const mobileCancelButton = (
    <Button disabled={isBusy} onClick={closeDialog} type="button" variant="ghost">
      Cancel
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

      <AppDialogContent
        showMobileCloseButton
        showCloseButton={false}
        size="lg"
      >
            <AppDialogHeader
              description={isEditing ? "Update this tournament round result, Pokemon, and notes." : "Add a tournament round result, Pokemon, and notes."}
              title={isEditing ? `Edit Round ${round?.roundNumber}` : "Add Round"}
            />
            <div
              className="min-h-0 min-w-0 flex-1 touch-pan-y overflow-y-auto overflow-x-hidden overscroll-contain p-3 pr-1 [-webkit-overflow-scrolling:touch] [scrollbar-gutter:stable] sm:p-4 sm:pr-2 lg:p-5"
              onFocusCapture={resetHorizontalScroll}
              onInputCapture={resetHorizontalScroll}
              onScroll={(event) => {
                if (event.currentTarget.scrollLeft !== 0) {
                  event.currentTarget.scrollLeft = 0;
                }
              }}
              ref={scrollContainerRef}
            >

            {isEditing && showDeleteConfirmation ? (
              <Alert
                className="mb-4 border-loss-border bg-loss-bg"
                variant="destructive"
              >
                <AlertDescription className="text-card-foreground">
                  Delete this round from the tournament?
                </AlertDescription>
                <ButtonGroup className="mt-3 max-w-full flex-wrap">
                  <Button disabled={deleteState === "deleting"} onClick={handleDelete} variant="destructive">
                    {deleteState === "deleting" ? "Deleting..." : "Yes, delete"}
                  </Button>
                  <Button
                    disabled={deleteState === "deleting"}
                    onClick={() => setShowDeleteConfirmation(false)}
                    variant="outline"
                  >
                    Keep Round
                  </Button>
                </ButtonGroup>
              </Alert>
            ) : null}

            {actionError ? (
              <Alert
                className="mb-4 border-loss-border bg-loss-bg text-loss-strong"
                variant="destructive"
              >
                <AlertDescription>{actionError}</AlertDescription>
              </Alert>
            ) : null}

            <form action={handleSubmit} className="grid min-w-0 gap-6" ref={formRef}>
              <input name="tournamentId" type="hidden" value={tournamentId} />
              <input name="redirectTo" type="hidden" value={pathname} />
              {isEditing && round ? <input name="roundId" type="hidden" value={round.id} /> : null}
              {isEditing && round ? <input name="expectedUpdatedAt" type="hidden" value={round.updatedAt} /> : null}
              {!isEditing ? <input name="creationKey" type="hidden" value={creationKey} /> : null}
              {selectedSprites.map((slug, index) => (
                <input
                  key={`round-sprite-${slug}-${index}`}
                  name="opponentDeckSprites"
                  type="hidden"
                  value={slug}
                />
              ))}

              <section aria-labelledby="round-match-result-heading" className="grid gap-4">
                <h3
                  className="text-base font-semibold text-card-foreground"
                  id="round-match-result-heading"
                >
                  Match result
                </h3>

                <div className="grid sm:grid-cols-3">
                  {[0, 1, 2].map((index) => (
                    <fieldset
                      className={cn(
                        "grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-3 border-b border-border py-3 sm:grid-cols-1 sm:items-stretch sm:border-b-0 sm:border-r sm:px-4 sm:py-0",
                        index === 0 && "pt-0 sm:pl-0",
                        index === 2 && "border-b-0 pb-0 sm:border-r-0 sm:pr-0"
                      )}
                      key={index}
                    >
                      <legend className="sr-only">Game {index + 1}</legend>
                      <span
                        aria-hidden="true"
                        className="text-sm font-semibold text-card-foreground"
                      >
                        Game {index + 1}
                      </span>
                      <div className="grid min-w-0 grid-cols-3 overflow-hidden rounded-lg border border-border bg-muted">
                        {TOURNAMENT_ROUND_GAME_RESULT_OPTIONS.map((option) => {
                          const isSelected = gameResults[index] === option;

                          return (
                            <Button
                              aria-pressed={isSelected}
                              className={getGameResultButtonClassName(option, isSelected)}
                              key={option}
                              onClick={() => {
                                const nextSelection = toggleRoundGameResult(
                                  gameResults,
                                  index,
                                  option
                                );
                                setGameResults(nextSelection.gameResults);
                                setSpecialResult(nextSelection.specialResult);
                              }}
                              type="button"
                              variant="ghost"
                            >
                              {option}
                            </Button>
                          );
                        })}
                      </div>
                      {gameResults[index] ? (
                        <input
                          name={`game${index + 1}`}
                          type="hidden"
                          value={gameResults[index]}
                        />
                      ) : null}
                    </fieldset>
                  ))}
                </div>

                <fieldset className="grid gap-3">
                  <legend className="sr-only">Other outcome</legend>
                  <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
                    <span aria-hidden="true" className="h-px bg-border" />
                    <span className="text-center text-sm font-semibold text-muted-foreground">
                      Or choose a match outcome
                    </span>
                    <span aria-hidden="true" className="h-px bg-border" />
                  </div>
                  <div className="grid grid-cols-3 overflow-hidden rounded-lg border border-border bg-muted">
                    {TOURNAMENT_ROUND_SPECIAL_RESULT_OPTIONS.map((option) => {
                      const fieldName =
                        option.value === "BYE"
                          ? "isBye"
                          : option.value === "ID"
                            ? "isId"
                            : "isNoShow";

                      const isSelected = specialResult === option.value;

                      return (
                        <div className="grid" key={option.value}>
                          <Button
                            aria-pressed={isSelected}
                            className={cn(
                              "min-h-11 w-full rounded-none border-0 px-2",
                              option.value !== "NO SHOW" && "border-r border-border",
                              option.value === "BYE" &&
                                "[border-radius:calc(var(--radius)-1px)_0_0_calc(var(--radius)-1px)]",
                              option.value === "NO SHOW" &&
                                "[border-radius:0_calc(var(--radius)-1px)_calc(var(--radius)-1px)_0]",
                              isSelected &&
                                "bg-win-bg text-win-strong shadow-[inset_0_0_0_2px_var(--color-win-strong)] hover:bg-win-bg hover:text-win-strong"
                            )}
                            onClick={() => {
                              const nextSelection = toggleRoundSpecialResult(
                                gameResults,
                                specialResult,
                                option.value
                              );
                              setGameResults(nextSelection.gameResults);
                              setSpecialResult(nextSelection.specialResult);
                            }}
                            type="button"
                            variant="ghost"
                          >
                            {option.label}
                          </Button>
                          {isSelected ? (
                            <input
                              name={fieldName}
                              type="hidden"
                              value={option.value}
                            />
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </fieldset>
              </section>

              <BattleLogSpritePicker
                onChange={setSelectedSprites}
                pokemonOptions={pokemonOptions}
                sprites={selectedSprites}
                title="Opponent deck"
              />

              <div className="grid gap-2">
                <label className="text-sm font-semibold text-card-foreground" htmlFor="round-notes">
                  Round notes
                </label>
                <Textarea
                  className="min-h-28 rounded-xl border border-border bg-muted px-4 py-3 text-sm text-card-foreground outline-none transition focus:border-ring"
                  defaultValue={round?.notes ?? ""}
                  id="round-notes"
                  name="notes"
                  placeholder="Information about your match"
                />
              </div>
            </form>
            </div>
            <AppDialogFooter className="w-full">
              {isEditing ? (
                <ButtonGroup className="ml-auto">
                  <SaveButton
                    isEditing
                    onClick={() => formRef.current?.requestSubmit()}
                    saveState={saveState}
                    variant="outline"
                  />
                  {deleteButton}
                </ButtonGroup>
              ) : (
                <>
                  {desktopCancelButton}
                  <SaveButton
                    isEditing={false}
                    onClick={() => formRef.current?.requestSubmit()}
                    saveState={saveState}
                  />
                </>
              )}
            </AppDialogFooter>
            <AppDialogMobileFooter>
              <div className="grid gap-2">
                {deleteButton ? (
                  <div className="grid grid-cols-2 gap-2">
                    {deleteButton}
                    {mobileCancelButton}
                  </div>
                ) : mobileCancelButton}
                <SaveButton
                  isEditing={isEditing}
                  onClick={() => formRef.current?.requestSubmit()}
                  saveState={saveState}
                />
              </div>
            </AppDialogMobileFooter>
      </AppDialogContent>
    </Dialog>
  );
}
