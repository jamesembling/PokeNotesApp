"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
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
          ? "pointer-events-none whitespace-nowrap border-[var(--color-win-border)] bg-[var(--color-win-bg)] text-[var(--color-win-strong)] opacity-100 hover:bg-[var(--color-win-bg)] sm:w-[9.5rem] sm:shrink-0"
          : "border-border bg-background whitespace-nowrap text-foreground hover:bg-muted hover:text-foreground sm:w-[9.5rem] sm:shrink-0"
      }
      disabled={isSaving}
      onClick={onClick}
      type="button"
      variant="outline"
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
        className="flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-3xl min-w-0 flex-col overflow-hidden rounded-[28px] border border-border bg-card p-3 shadow-[var(--shadow-lg)] sm:max-w-3xl sm:p-4 lg:p-5"
        showCloseButton={false}
      >
            <div
              className="min-h-0 min-w-0 flex-1 touch-pan-y overflow-y-auto overflow-x-hidden overscroll-contain pr-1 [-webkit-overflow-scrolling:touch] [scrollbar-gutter:stable] sm:pr-2"
              onFocusCapture={resetHorizontalScroll}
              onInputCapture={resetHorizontalScroll}
              onScroll={(event) => {
                if (event.currentTarget.scrollLeft !== 0) {
                  event.currentTarget.scrollLeft = 0;
                }
              }}
              ref={scrollContainerRef}
            >
            <div className="mb-2 flex min-w-0 flex-col gap-4 border-b border-border pb-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <DialogTitle className="text-[1.55rem] font-bold tracking-[-0.05em] text-card-foreground sm:text-[1.9rem]">
                  {isEditing ? "Edit Tournament" : "New Tournament"}
                </DialogTitle>
                <DialogDescription className="sr-only">
                  {isEditing ? "Update tournament details, deck choices, and notes." : "Create a tournament with deck choices and notes."}
                </DialogDescription>
              </div>

              <ButtonGroup className="max-w-full flex-wrap sm:justify-end">
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
            </div>

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
              className="grid min-w-0 gap-5"
              ref={formRef}
            >
              {isEditing && tournament ? <input name="tournamentId" type="hidden" value={tournament.id} /> : null}
              <input name="redirectTo" type="hidden" value={pathname} />

              <div className="grid gap-2">
                <label className="text-sm font-semibold text-card-foreground" htmlFor="tournament-name">
                  Tournament information
                </label>
                <Input
                  className="rounded-xl border border-border bg-muted px-4 py-3 text-sm text-card-foreground outline-none transition focus:border-primary"
                  defaultValue={tournament?.name ?? ""}
                  id="tournament-name"
                  name="name"
                  placeholder="EUIC, local cup, online challenge..."
                />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-card-foreground">Category</span>
                  <AppSelect
                    className="min-h-[3rem] rounded-xl px-4 py-3"
                    id="tournament-category"
                    name="category"
                    onChange={setCategory}
                    options={TOURNAMENT_CATEGORY_OPTIONS}
                    placeholder="Select category"
                    value={category}
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-card-foreground">Placement</span>
                  <AppSelect
                    className="min-h-[3rem] rounded-xl px-4 py-3"
                    id="tournament-placement"
                    name="placement"
                    onChange={setPlacement}
                    options={placementOptions}
                    placeholder="Select placement"
                    value={placement}
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-card-foreground">Format</span>
                  <FormatSelect
                    id="tournament-format"
                    name="format"
                    onChange={setFormat}
                    options={formatOptions.map((option) => option.value)}
                    placeholder="Select format"
                    value={format}
                  />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <label className="text-sm font-semibold text-card-foreground" htmlFor="tournament-date-from">
                    Start date
                  </label>
                  <DatePicker
                    defaultValue={tournament?.dateFrom ?? ""}
                    id="tournament-date-from"
                    name="dateFrom"
                  />
                </div>

                <div className="grid gap-2">
                  <label className="text-sm font-semibold text-card-foreground" htmlFor="tournament-date-to">
                    End date
                  </label>
                  <DatePicker
                    defaultValue={tournament?.dateTo ?? ""}
                    id="tournament-date-to"
                    name="dateTo"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <label className="text-sm font-semibold text-card-foreground" htmlFor="tournament-linked-deck">
                    Link to deck strategy
                  </label>
                  <AppSelect
                    className="min-h-[3rem] rounded-xl px-4 py-3"
                    id="tournament-linked-deck"
                    name="linkedDeckId"
                    onChange={handleLinkedDeckChange}
                    options={[
                      { label: "No linked deck", value: "" },
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
                    Saved deck list
                  </label>
                  <AppSelect
                    className="min-h-[3rem] rounded-xl px-4 py-3"
                    disabled={availableDeckLists.length === 0}
                    id="tournament-linked-deck-list"
                    name="linkedDeckListId"
                    onChange={setLinkedDeckListId}
                    options={[
                      {
                        label:
                          availableDeckLists.length > 0
                            ? "No linked deck list"
                            : "Select a deck strategy first",
                        value: ""
                      },
                      ...availableDeckLists.map((deckList) => ({
                        label: deckList.name,
                        value: deckList.id
                      }))
                    ]}
                    value={linkedDeckListId}
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

              <div className="grid gap-2">
                <label className="text-sm font-semibold text-card-foreground" htmlFor="tournament-notes">
                  Notes
                </label>
                <Textarea
                  className="min-h-32 rounded-xl border border-border bg-muted px-4 py-3 text-sm text-card-foreground outline-none transition focus:border-primary"
                  defaultValue={tournament?.notes ?? ""}
                  id="tournament-notes"
                  name="notes"
                  placeholder="Takeaways, matchup notes, prep notes..."
                />
              </div>
            </form>
            </div>
      </DialogContent>
    </Dialog>
  );
}
