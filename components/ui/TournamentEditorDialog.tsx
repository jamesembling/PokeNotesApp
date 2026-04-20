"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import {
  createTournamentAction,
  deleteTournamentAction,
  updateTournamentAction
} from "@/app/(app)/tournaments/actions";
import { BattleLogSpritePicker } from "@/components/ui/BattleLogSpritePicker";
import { Button } from "@/components/ui/Button";
import { ChevronIcon } from "@/components/ui/icons";
import { useSiteFormats } from "@/components/ui/SiteFormatsProvider";
import { useBodyScrollLock } from "@/lib/client/use-body-scroll-lock";
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

function TournamentSelectField({
  id,
  label,
  name,
  onChange,
  options,
  placeholder,
  value
}: {
  id: string;
  label: string;
  name: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder: string;
  value: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const fieldRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);
  const selectedOption = options.find((option) => option.value === value);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function syncMenuPosition() {
      const button = buttonRef.current;
      if (!button) {
        return;
      }

      const rect = button.getBoundingClientRect();
      setMenuStyle({
        left: rect.left,
        maxHeight: Math.max(160, Math.min(288, window.innerHeight - rect.bottom - 16)),
        position: "fixed",
        top: rect.bottom,
        width: rect.width
      });
    }

    function handlePointerDown(event: PointerEvent) {
      if (fieldRef.current?.contains(event.target as Node)) {
        return;
      }

      if (menuRef.current?.contains(event.target as Node)) {
        return;
      }

      setIsOpen(false);
    }

    syncMenuPosition();
    window.addEventListener("resize", syncMenuPosition);
    window.addEventListener("scroll", syncMenuPosition, true);
    window.addEventListener("pointerdown", handlePointerDown);

    return () => {
      window.removeEventListener("resize", syncMenuPosition);
      window.removeEventListener("scroll", syncMenuPosition, true);
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isOpen]);

  const menu = isOpen && menuStyle
    ? createPortal(
        <div
          className="z-[60] overflow-y-auto rounded-b-xl border border-t-0 border-[var(--color-brand)] bg-[var(--bg-surface-alt)] shadow-[var(--shadow-sm)]"
          ref={menuRef}
          role="listbox"
          style={menuStyle}
        >
          {options.map((option) => (
            <button
              aria-selected={option.value === value}
              className="block w-full px-4 py-2.5 text-left text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--bg-surface)] aria-selected:bg-[var(--bg-surface)]"
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              role="option"
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>,
        document.body
      )
    : null;

  return (
    <div ref={fieldRef}>
      <input name={name} type="hidden" value={value} />
      <div
        className={[
          "rounded-xl border border-[var(--border)] bg-[var(--bg-surface-alt)] transition",
          isOpen ? "rounded-b-none border-[var(--color-brand)]" : ""
        ].join(" ")}
      >
        <label
          className="block px-4 pt-3 text-xs font-semibold uppercase leading-tight tracking-wide text-[var(--text-muted)]"
          htmlFor={id}
        >
          {label}
        </label>
        <button
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          className="flex w-full items-center justify-between gap-3 px-4 pb-3 pt-1 text-left text-sm font-semibold text-[var(--text-primary)] outline-none"
          id={id}
          onClick={() => setIsOpen((current) => !current)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setIsOpen(false);
            }
          }}
          ref={buttonRef}
          type="button"
        >
          <span>{selectedOption?.label ?? placeholder}</span>
          <ChevronIcon
            className={`h-4 w-4 shrink-0 text-[var(--text-muted)] transition ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </button>
      </div>
      {menu}
    </div>
  );
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
          ? "w-full pointer-events-none whitespace-nowrap bg-[var(--color-win-strong)] text-[var(--text-inverse)] opacity-100 hover:bg-[var(--color-win-strong)] sm:w-[9.5rem] sm:shrink-0"
          : "w-full whitespace-nowrap sm:w-[9.5rem] sm:shrink-0"
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
  const { defaultFormat, options: siteFormatOptions } = useSiteFormats();
  const formRef = useRef<HTMLFormElement | null>(null);
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

  useBodyScrollLock(isOpen);
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
            className="mx-auto flex max-h-[calc(100dvh-2rem)] w-full max-w-3xl min-w-0 flex-col overflow-hidden rounded-[28px] border border-[var(--border)] bg-[var(--bg-surface)] p-3 shadow-[var(--shadow-lg)] sm:p-4 lg:p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="min-h-0 min-w-0 flex-1 touch-pan-y overflow-y-auto overflow-x-hidden overscroll-contain pr-1 [-webkit-overflow-scrolling:touch] [scrollbar-gutter:stable] sm:pr-2">
            <div className="mb-2 flex min-w-0 flex-col gap-4 border-b border-[var(--border)] pb-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <h2 className="text-[1.55rem] font-bold tracking-[-0.05em] text-[var(--text-primary)] sm:text-[1.9rem]">
                  {isEditing ? "Edit Tournament" : "New Tournament"}
                </h2>
              </div>

              <div className="grid w-full gap-2.5 sm:flex sm:w-auto sm:flex-wrap sm:justify-end">
                <Button className="whitespace-nowrap" onClick={closeDialog} type="button" variant="secondary">
                  Close
                </Button>
                {isEditing ? (
                  <Button
                    className="whitespace-nowrap"
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
                  Tournament information
                </label>
                <input
                  className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface-alt)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--color-brand)]"
                  defaultValue={tournament?.name ?? ""}
                  id="tournament-name"
                  name="name"
                  placeholder="EUIC, local cup, online challenge..."
                />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <TournamentSelectField
                  id="tournament-category"
                  label="Category"
                  name="category"
                  onChange={setCategory}
                  options={TOURNAMENT_CATEGORY_OPTIONS}
                  placeholder="Select category"
                  value={category}
                />

                <TournamentSelectField
                  id="tournament-placement"
                  label="Placement"
                  name="placement"
                  onChange={setPlacement}
                  options={placementOptions}
                  placeholder="Select placement"
                  value={placement}
                />

                <TournamentSelectField
                  id="tournament-format"
                  label="Format"
                  name="format"
                  onChange={setFormat}
                  options={formatOptions}
                  placeholder="Select format"
                  value={format}
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
                  <label className="text-sm font-semibold text-[var(--text-primary)]" htmlFor="tournament-linked-deck-list">
                    Saved deck list
                  </label>
                  <select
                    className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface-alt)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--color-brand)] disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={availableDeckLists.length === 0}
                    id="tournament-linked-deck-list"
                    name="linkedDeckListId"
                    onChange={(event) => setLinkedDeckListId(event.target.value)}
                    value={linkedDeckListId}
                  >
                    <option value="">
                      {availableDeckLists.length > 0
                        ? "No linked deck list"
                        : "Select a deck strategy first"}
                    </option>
                    {availableDeckLists.map((deckList) => (
                      <option key={deckList.id} value={deckList.id}>
                        {deckList.name}
                      </option>
                    ))}
                  </select>
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
