"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { XIcon } from "lucide-react";
import {
  createTournamentAction,
  deleteTournamentAction,
  updateTournamentAction
} from "@/app/(app)/tournaments/actions";
import { Alert, AlertDescription } from "@/components/shadcn/alert";
import { AppSelect } from "@/components/shadcn/app-select";
import { BattleLogSpritePicker } from "@/components/ui/BattleLogSpritePicker";
import { Button } from "@/components/shadcn/button";
import { ButtonGroup } from "@/components/shadcn/button-group";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle
} from "@/components/shadcn/dialog";
import { Input } from "@/components/shadcn/input";
import { Textarea } from "@/components/shadcn/textarea";
import { DatePicker } from "@/components/ui/DatePicker";
import { FormatSelect } from "@/components/ui/FormatSelect";
import { useSiteFormats } from "@/components/ui/SiteFormatsProvider";
import {
  TOURNAMENT_CATEGORY_OPTIONS,
  TOURNAMENT_PLACEMENT_OPTIONS
} from "@/lib/tournaments/options";
import type { PokemonOption, Tournament, TournamentDeckChoice } from "@/types/index";

export type TournamentEditorDialogProps = {
  decks: TournamentDeckChoice[];
  initialOpen?: boolean;
  pokemonOptions: PokemonOption[];
  tournament?: Tournament;
  triggerLabel: string;
  triggerVariant?: "default" | "outline" | "ghost";
};

type SaveState = "idle" | "saving" | "success";
type DeleteState = "idle" | "deleting";
type SelectOption = {
  label: string;
  value: string;
};

const SUCCESS_CLOSE_DELAY_MS = 650;
const TOURNAMENT_PLACEMENT_VALUES_BY_CATEGORY: Record<string, string[]> = {
  local: [
    "champion",
    "second",
    "third",
    "fourth",
    "fifth",
    "sixth",
    "seventh",
    "eighth",
    "t16",
    "t32"
  ],
  challenge: ["champion", "finalist", "t4", "t8", "dropped", "no placement"],
  cup: ["champion", "finalist", "t4", "t8", "dropped", "no placement"]
};

function getPlacementOptionsForCategory(category: string): SelectOption[] {
  const placementValues = TOURNAMENT_PLACEMENT_VALUES_BY_CATEGORY[category];

  if (!placementValues) {
    return TOURNAMENT_PLACEMENT_OPTIONS;
  }

  return placementValues.reduce<SelectOption[]>((filteredOptions, placementValue) => {
    const option = TOURNAMENT_PLACEMENT_OPTIONS.find(
      (candidate) => candidate.value === placementValue
    );

    if (option) {
      filteredOptions.push({
        label: option.label,
        value: option.value
      });
    }

    return filteredOptions;
  }, []);
}

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
          ? "pointer-events-none w-full whitespace-nowrap border-[var(--color-win-border)] bg-[var(--color-win-bg)] text-[var(--color-win-strong)] opacity-100 hover:bg-[var(--color-win-bg)] sm:w-[9.5rem] sm:shrink-0"
          : "w-full whitespace-nowrap border-border bg-background text-foreground hover:bg-muted hover:text-foreground sm:w-[9.5rem] sm:shrink-0"
      }
      disabled={isSaving}
      onClick={onClick}
      type="button"
      variant="outline"
    >
      {isSaving ? "Saving..." : isSuccess ? "Saved" : isEditing ? "Save Changes" : "Create Tournament"}
    </Button>
  );
}

export function TournamentEditorDialog({
  decks,
  initialOpen = false,
  pokemonOptions,
  tournament,
  triggerLabel,
  triggerVariant = "default"
}: TournamentEditorDialogProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { defaultFormat, options: siteFormatOptions } = useSiteFormats();
  const formRef = useRef<HTMLFormElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const navigationTimerRef = useRef<number | null>(null);
  const isEditing = Boolean(tournament?.id);
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [linkedDeckId, setLinkedDeckId] = useState(tournament?.linkedDeckId ?? "");
  const [linkedDeckListId, setLinkedDeckListId] = useState(tournament?.linkedDeckListId ?? "");
  const [category, setCategory] = useState<string>(tournament?.category ?? "");
  const [placement, setPlacement] = useState<string>(tournament?.placement ?? "");
  const [format, setFormat] = useState<string>(tournament?.format || defaultFormat);
  const [dateTo, setDateTo] = useState(tournament?.dateTo ?? "");
  const [isMultiDay, setIsMultiDay] = useState(Boolean(tournament?.dateTo));
  const [selectedSprites, setSelectedSprites] = useState<string[]>(tournament?.deckSprites.slice(0, 2) ?? []);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [deleteState, setDeleteState] = useState<DeleteState>("idle");
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [actionError, setActionError] = useState("");

  const placementOptions = useMemo(() => getPlacementOptionsForCategory(category), [category]);
  const selectedDeck = useMemo(
    () => decks.find((deck) => deck.id === linkedDeckId) ?? null,
    [decks, linkedDeckId]
  );
  const availableDeckLists = selectedDeck?.deckLists ?? [];
  const formatOptions = useMemo(() => {
    const normalizedFormat = String(format || "").trim();
    const options = normalizedFormat && !siteFormatOptions.includes(normalizedFormat)
      ? [normalizedFormat, ...siteFormatOptions]
      : siteFormatOptions;

    return options.map((option) => ({
      label: option,
      value: option
    }));
  }, [format, siteFormatOptions]);

  useEffect(() => {
    if (!placement) {
      return;
    }

    if (placementOptions.some((option) => option.value === placement)) {
      return;
    }

    setPlacement("");
  }, [placement, placementOptions]);

  useEffect(() => {
    if (tournament?.format) {
      return;
    }

    setFormat((current) => current || defaultFormat);
  }, [defaultFormat, tournament?.format]);

  useEffect(() => {
    if (!linkedDeckId || availableDeckLists.length === 0) {
      setLinkedDeckListId("");
      return;
    }

    if (!linkedDeckListId) {
      return;
    }

    const stillValid = availableDeckLists.some((deckList) => deckList.id === linkedDeckListId);
    if (!stillValid) {
      setLinkedDeckListId(availableDeckLists[0]?.id ?? "");
    }
  }, [availableDeckLists, linkedDeckId, linkedDeckListId]);

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
    setLinkedDeckListId(tournament?.linkedDeckListId ?? "");
    setCategory(tournament?.category ?? "");
    setPlacement(tournament?.placement ?? "");
    setFormat(tournament?.format || defaultFormat);
    setDateTo(tournament?.dateTo ?? "");
    setIsMultiDay(Boolean(tournament?.dateTo));
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

  function handleLinkedDeckChange(nextDeckId: string) {
    setLinkedDeckId(nextDeckId);
    setLinkedDeckListId("");

    if (!nextDeckId) {
      return;
    }

    const nextDeck = decks.find((deck) => deck.id === nextDeckId);
    if (!nextDeck) {
      return;
    }

    setSelectedSprites(nextDeck.deckPokemon.slice(0, 2));
  }

  async function handleSubmit(formData: FormData) {
    setActionError("");
    setSaveState("saving");

    const result = await (
      isEditing ? updateTournamentAction(formData) : createTournamentAction(formData)
    );

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
    if (!tournament?.id) {
      return;
    }

    setActionError("");
    setDeleteState("deleting");

    const formData = new FormData();
    formData.set("tournamentId", tournament.id);
    const result = await deleteTournamentAction(formData);

    if (!result.ok) {
      setActionError(result.message);
      setDeleteState("idle");
      return;
    }

    closeDialog();
    router.push(result.redirectTo);
  }

  const isBusy = saveState === "saving" || deleteState === "deleting";

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          closeDialog();
        }
      }}
      open={isOpen}
    >
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

      <DialogContent
        className="flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-2rem)] max-w-[22.5rem] min-w-0 flex-col overflow-hidden rounded-[10px] border border-border bg-card p-6 shadow-[var(--shadow-lg)] sm:max-h-[calc(100dvh-2rem)] sm:max-w-3xl sm:rounded-[28px] sm:p-4 lg:p-5"
        showCloseButton={false}
      >
            <div className="relative mb-5 flex shrink-0 min-w-0 flex-col gap-4 border-b border-border pb-6 pr-14 sm:mb-2 sm:pb-4 sm:pr-0 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <DialogTitle className="text-[1.25rem] font-bold tracking-[-0.02em] text-card-foreground sm:text-[1.9rem] sm:tracking-[-0.05em]">
                  {isEditing ? "Edit Tournament" : "New Tournament"}
                </DialogTitle>
                <DialogDescription className="sr-only">
                  {isEditing ? "Update tournament details, deck choices, and notes." : "Create a tournament with deck choices and notes."}
                </DialogDescription>
              </div>

              <ButtonGroup className="hidden max-w-full flex-wrap sm:flex sm:justify-end">
                <Button className="whitespace-nowrap" onClick={closeDialog} type="button" variant="outline">
                  Close
                </Button>
                {isEditing ? (
                  <Button
                    className="whitespace-nowrap text-destructive hover:bg-destructive/10 hover:text-destructive"
                    disabled={isBusy}
                    onClick={() => {
                      setActionError("");
                      setShowDeleteConfirmation((current) => !current);
                    }}
                    type="button"
                    variant="outline"
                  >
                    Delete
                  </Button>
                ) : null}
                <SaveButton
                  isEditing={isEditing}
                  onClick={() => formRef.current?.requestSubmit()}
                  saveState={saveState}
                />
              </ButtonGroup>

              <DialogClose asChild>
                <Button
                  aria-label="Close dialog"
                  className="absolute right-0 top-0 z-20 border-border bg-card text-card-foreground hover:bg-muted sm:hidden"
                  size="icon-lg"
                  variant="outline"
                >
                  <XIcon className="h-4 w-4" />
                  <span className="sr-only">Close</span>
                </Button>
              </DialogClose>
            </div>

            <div
              className="min-h-0 min-w-0 flex-1 touch-pan-y overflow-y-auto overflow-x-hidden overscroll-contain [-webkit-overflow-scrolling:touch] [scrollbar-gutter:stable] sm:pr-2"
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
                className="mb-4 border-[var(--color-loss-border)] bg-[var(--color-loss-bg)]"
                variant="destructive"
              >
                <AlertDescription className="text-card-foreground">
                  Delete this tournament and all of its rounds?
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
                    Keep Tournament
                  </Button>
                </ButtonGroup>
              </Alert>
            ) : null}

            {actionError ? (
              <Alert
                className="mb-4 border-[var(--color-loss-border)] bg-[var(--color-loss-bg)] text-[var(--color-loss)]"
                variant="destructive"
              >
                <AlertDescription>{actionError}</AlertDescription>
              </Alert>
            ) : null}

            <form
              action={handleSubmit}
              className="grid min-w-0 gap-6 sm:gap-5"
              ref={formRef}
            >
              {isEditing && tournament ? <input name="tournamentId" type="hidden" value={tournament.id} /> : null}
              <input name="redirectTo" type="hidden" value={pathname} />

              <div className="border-b border-border pb-5 sm:border-0 sm:pb-0">
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <label className="text-sm font-semibold text-card-foreground" htmlFor="tournament-name">
                      Tournament Name
                    </label>
                    <Input
                      className="min-h-[2.75rem] rounded-lg border border-border bg-muted px-3 py-2.5 text-base font-semibold text-card-foreground outline-none transition placeholder:font-semibold focus:border-ring sm:rounded-xl sm:px-4 sm:py-3 sm:text-sm"
                      defaultValue={tournament?.name ?? ""}
                      id="tournament-name"
                      name="name"
                      placeholder="Event Name"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-4">
                    <label className="grid gap-2">
                      <span className="text-sm font-semibold text-card-foreground">Category</span>
                      <AppSelect
                        className="min-h-[2.75rem] rounded-lg px-3 py-2.5 text-base font-semibold sm:min-h-[3rem] sm:rounded-xl sm:px-4 sm:py-3 sm:text-sm"
                        id="tournament-category"
                        name="category"
                        onChange={setCategory}
                        options={TOURNAMENT_CATEGORY_OPTIONS}
                        placeholder="Select..."
                        value={category}
                      />
                    </label>

                    <label className="grid gap-2">
                      <span className="text-sm font-semibold text-card-foreground">Format</span>
                      <FormatSelect
                        className="min-h-[2.75rem] rounded-lg px-3 py-2.5 text-base font-semibold sm:min-h-[3rem] sm:rounded-xl sm:px-4 sm:py-3 sm:text-sm"
                        id="tournament-format"
                        name="format"
                        onChange={setFormat}
                        options={formatOptions.map((option) => option.value)}
                        placeholder="Select..."
                        value={format}
                      />
                    </label>

                    <label className="col-span-2 grid gap-2 sm:col-span-1">
                      <span className="text-sm font-semibold text-card-foreground">Placement</span>
                      <AppSelect
                        className="min-h-[2.75rem] rounded-lg px-3 py-2.5 text-base font-semibold sm:min-h-[3rem] sm:rounded-xl sm:px-4 sm:py-3 sm:text-sm"
                        id="tournament-placement"
                        name="placement"
                        onChange={setPlacement}
                        options={placementOptions}
                        placeholder="Select placement..."
                        value={placement}
                      />
                    </label>
                  </div>
                </div>
              </div>

              <div className="border-b border-border pb-5 sm:border-0 sm:pb-0">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="grid gap-2">
                    <label className="text-sm font-semibold text-card-foreground" htmlFor="tournament-date-from">
                      Date
                    </label>
                    <DatePicker
                      className="min-h-[2.75rem] rounded-lg px-3 py-2.5 text-base font-semibold sm:text-sm"
                      defaultValue={tournament?.dateFrom ?? ""}
                      id="tournament-date-from"
                      name="dateFrom"
                      placeholder="dd/mm/yyyy"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3 sm:hidden">
                    <span className="text-sm font-semibold text-card-foreground">Multi-Day Event</span>
                    <button
                      aria-checked={isMultiDay}
                      className="relative h-6 w-11 rounded-full border border-border bg-muted transition aria-checked:bg-primary"
                      onClick={() => {
                        setIsMultiDay((current) => {
                          if (current) {
                            setDateTo("");
                          }
                          return !current;
                        });
                      }}
                      role="switch"
                      type="button"
                    >
                      <span
                        className={[
                          "absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-card shadow-sm transition",
                          isMultiDay ? "translate-x-5" : ""
                        ].join(" ")}
                      />
                    </button>
                  </div>

                  <div className={`${isMultiDay ? "grid" : "hidden"} gap-2 sm:grid`}>
                    <label className="text-sm font-semibold text-card-foreground" htmlFor="tournament-date-to">
                      End date
                    </label>
                    <DatePicker
                      className="min-h-[2.75rem] rounded-lg px-3 py-2.5 text-base font-semibold sm:text-sm"
                      id="tournament-date-to"
                      name="dateTo"
                      onChange={setDateTo}
                      placeholder="dd/mm/yyyy"
                      value={dateTo}
                    />
                  </div>
                </div>
              </div>

              <div className="border-b border-border pb-5 sm:border-0 sm:pb-0">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="grid gap-2">
                    <label className="text-sm font-semibold text-card-foreground" htmlFor="tournament-linked-deck">
                      Deck Strategy
                    </label>
                    <AppSelect
                      className="min-h-[2.75rem] rounded-lg px-3 py-2.5 text-base font-semibold sm:min-h-[3rem] sm:rounded-xl sm:px-4 sm:py-3 sm:text-sm"
                      id="tournament-linked-deck"
                      name="linkedDeckId"
                      onChange={handleLinkedDeckChange}
                      options={[
                        { label: "No Linked Deck", value: "" },
                        ...decks.map((deck) => ({
                          label: deck.deckName,
                          value: deck.id
                        }))
                      ]}
                      value={linkedDeckId}
                    />
                  </div>

                  <div className="grid gap-2">
                    <label className="text-sm font-semibold text-card-foreground" htmlFor="tournament-linked-deck-list">
                      Saved Decklist
                    </label>
                    <AppSelect
                      className="min-h-[2.75rem] rounded-lg px-3 py-2.5 text-base font-semibold sm:min-h-[3rem] sm:rounded-xl sm:px-4 sm:py-3 sm:text-sm"
                      disabled={availableDeckLists.length === 0}
                      id="tournament-linked-deck-list"
                      name="linkedDeckListId"
                      onChange={setLinkedDeckListId}
                      options={[
                        {
                          label:
                            availableDeckLists.length > 0
                              ? "No Linked Decklist"
                              : "Select a Deck Strategy First",
                          value: ""
                        },
                        ...availableDeckLists.map((deckList) => ({
                          label: deckList.name,
                          value: deckList.id
                        }))
                      ]}
                      value={linkedDeckListId}
                    />
                    {availableDeckLists.length === 0 ? (
                      <p className="text-xs text-muted-foreground sm:hidden">
                        Choose a Deck Strategy above to unlock
                      </p>
                    ) : null}
                  </div>
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

              <div className="grid gap-2 border-t border-border pt-5 sm:border-0 sm:pt-0">
                <label className="text-sm font-semibold text-card-foreground" htmlFor="tournament-notes">
                  Notes
                </label>
                <Textarea
                  className="min-h-32 rounded-lg border border-border bg-muted px-3 py-2.5 text-base font-semibold text-card-foreground outline-none transition focus:border-ring sm:rounded-xl sm:px-4 sm:py-3 sm:text-sm"
                  defaultValue={tournament?.notes ?? ""}
                  id="tournament-notes"
                  name="notes"
                  placeholder="Takeaways, matchup notes, prep notes..."
                />
              </div>

              <div className="border-t border-border pt-5 sm:hidden">
                <div className="grid gap-2">
                  <Button
                    aria-disabled={saveState === "saving" || saveState === "success"}
                    className={[
                      "w-full",
                      saveState === "success"
                        ? "pointer-events-none border-[var(--color-win-border)] bg-[var(--color-win-bg)] text-[var(--color-win-strong)] opacity-100 hover:bg-[var(--color-win-bg)]"
                        : ""
                    ].join(" ")}
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
                          : "Create Tournament"}
                  </Button>
                  <Button className="w-full" onClick={closeDialog} type="button" variant="outline">
                    Close
                  </Button>
                </div>
              </div>
            </form>
            </div>
      </DialogContent>
    </Dialog>
  );
}
