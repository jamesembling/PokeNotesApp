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
import { AppDialogContent } from "@/components/ui/AppDialog";
import {
  Dialog,
  DialogDescription,
  DialogTitle
} from "@/components/shadcn/dialog";
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
  triggerClassName?: string;
  triggerLabel: string;
  triggerVariant?: "default" | "outline" | "ghost";
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
      >
            <div className="flex min-w-0 flex-col gap-4 border-b border-border bg-card px-3 py-4 sm:px-4 lg:px-5">
              <div className="min-w-0 pr-11">
                <DialogTitle className="text-[1.55rem] font-bold tracking-[-0.05em] text-card-foreground sm:text-[1.9rem]">
                  {isEditing ? `Edit Round ${round?.roundNumber}` : "Add Round"}
                </DialogTitle>
                <DialogDescription className="sr-only">
                  {isEditing ? "Update this tournament round result, Pokemon, and notes." : "Add a tournament round result, Pokemon, and notes."}
                </DialogDescription>
              </div>

              <div
                className={isEditing ? "grid w-full grid-cols-2" : "w-full"}
                role="group"
              >
                {isEditing ? (
                  <Button
                    className="w-full rounded-r-none"
                    disabled={isBusy}
                    onClick={() => {
                      setActionError("");
                      setShowDeleteConfirmation((current) => !current);
                    }}
                    type="button"
                  >
                    Delete
                  </Button>
                ) : null}
                <Button
                  className={isEditing ? "w-full rounded-l-none border-l-0" : "w-full"}
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
                className="mb-4 border-loss-border bg-loss-bg text-loss"
                variant="destructive"
              >
                <AlertDescription>{actionError}</AlertDescription>
              </Alert>
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

              <div className="grid gap-5">
                <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
                  {[0, 1, 2].map((index) => (
                    <fieldset
                      className="flex items-center gap-3 border-b border-border pb-3 last:border-b-0 last:pb-0 sm:grid sm:grid-cols-1 sm:items-start sm:border-b-0 sm:border-r sm:pb-0 sm:pr-4 sm:last:border-r-0 sm:last:pr-0"
                      key={index}
                    >
                      <legend className="sr-only">
                        Game {index + 1}
                      </legend>
                      <span className="w-[4.5rem] shrink-0 text-sm font-semibold text-card-foreground sm:w-auto">
                        Game {index + 1}
                      </span>
                      <div className="grid flex-1 grid-cols-3 gap-2 sm:w-full sm:flex-none">
                        {TOURNAMENT_ROUND_GAME_RESULT_OPTIONS.map((option) => (
                          <label
                            className="flex cursor-pointer items-center justify-center gap-2 text-sm font-semibold text-card-foreground has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50"
                            htmlFor={`round-game-${index + 1}-${option}`}
                            key={option}
                          >
                            <input
                              checked={gameResults[index] === option}
                              className="size-4 accent-primary"
                              id={`round-game-${index + 1}-${option}`}
                              name={`game${index + 1}`}
                              onChange={() => {
                                const next = [...gameResults];
                                next[index] = option;
                                setSpecialResult("");
                                setGameResults(next);
                              }}
                              type="radio"
                              value={option}
                            />
                            {option}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  ))}
                </div>

                <fieldset className="grid gap-2">
                  <legend className="text-sm font-semibold text-card-foreground">
                    Other Outcome
                  </legend>
                  <div className="grid grid-cols-3 gap-2">
                    {TOURNAMENT_ROUND_SPECIAL_RESULT_OPTIONS.map((option) => {
                      const fieldName =
                        option.value === "BYE"
                          ? "isBye"
                          : option.value === "ID"
                            ? "isId"
                            : "isNoShow";

                      return (
                        <label
                          className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-card-foreground has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground"
                          htmlFor={`round-special-${fieldName}`}
                          key={option.value}
                        >
                          <input
                            checked={specialResult === option.value}
                            className="size-4 accent-primary"
                            id={`round-special-${fieldName}`}
                            name={fieldName}
                            onChange={() => {
                              setSpecialResult(option.value);
                              setGameResults(["", "", ""]);
                            }}
                            onClick={() => {
                              if (specialResult === option.value) {
                                setSpecialResult("");
                              }
                            }}
                            type="radio"
                            value={option.value}
                          />
                          {option.label}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              </div>

              <BattleLogSpritePicker
                onChange={setSelectedSprites}
                pokemonOptions={pokemonOptions}
                sprites={selectedSprites}
                title="Opponent deck"
              />

              <div className="grid gap-2">
                <label className="text-sm font-semibold text-card-foreground" htmlFor="round-notes">
                  Notes
                </label>
                <Textarea
                  className="min-h-28 rounded-xl border border-border bg-muted px-4 py-3 text-sm text-card-foreground outline-none transition focus:border-ring"
                  defaultValue={round?.notes ?? ""}
                  id="round-notes"
                  name="notes"
                  placeholder="Important lines, techs, mistakes, takeaways..."
                />
              </div>
            </form>
            </div>
      </AppDialogContent>
    </Dialog>
  );
}
