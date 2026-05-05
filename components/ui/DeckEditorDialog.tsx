"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  createDeckAction,
  deleteDeckAction,
  updateDeckAction
} from "@/app/(app)/decks/actions";
import { AppSelect } from "@/components/ui/AppSelect";
import { BattleLogSpritePicker } from "@/components/ui/BattleLogSpritePicker";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle
} from "@/components/shadcn/dialog";
import { Input } from "@/components/shadcn/input";
import { Textarea } from "@/components/shadcn/textarea";
import { FormatSelect } from "@/components/ui/FormatSelect";
import { useSiteFormats } from "@/components/ui/SiteFormatsProvider";
import type { Deck, PokemonOption } from "@/types/index";

export type DeckEditorDialogProps = {
  deck?: Deck;
  initialOpen?: boolean;
  pokemonOptions: PokemonOption[];
  triggerLabel: string;
  triggerVariant?: "primary" | "secondary" | "ghost";
};

type SaveState = "idle" | "saving" | "success";
type DeleteState = "idle" | "deleting";

const SUCCESS_CLOSE_DELAY_MS = 650;

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
          ? "w-full pointer-events-none bg-[var(--color-win-strong)] text-primary-foreground opacity-100 hover:bg-[var(--color-win-strong)] sm:w-[110px] sm:shrink-0"
          : isSaving
            ? "w-full pointer-events-none sm:w-[110px] sm:shrink-0"
            : "w-full sm:w-[110px] sm:shrink-0"
      }
      disabled={isSaving}
      onClick={onClick}
      type="button"
    >
      {isSaving ? "Saving..." : isSuccess ? "Saved" : isEditing ? "Save Deck" : "Create Deck"}
    </Button>
  );
}

function parseSetupGoals(value: string[]) {
  return value.join("\n");
}

function normalizeRedirectPath(value: string) {
  return value.split("?")[0] || value;
}

export function DeckEditorDialog({
  deck,
  initialOpen = false,
  pokemonOptions,
  triggerLabel,
  triggerVariant = "primary"
}: DeckEditorDialogProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { defaultFormat, options: siteFormatOptions } = useSiteFormats();
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [selectedSprites, setSelectedSprites] = useState<string[]>(deck?.deckPokemon ?? []);
  const [selectedFormat, setSelectedFormat] = useState(deck?.format || defaultFormat);
  const [selectedGoPreference, setSelectedGoPreference] = useState<string>(deck?.goPreference ?? "");
  const [actionError, setActionError] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [deleteState, setDeleteState] = useState<DeleteState>("idle");
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const closeTimerRef = useRef<number | null>(null);
  const navigationTimerRef = useRef<number | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const isEditing = Boolean(deck?.id);
  const formatOptions = selectedFormat && !siteFormatOptions.includes(selectedFormat)
    ? [selectedFormat, ...siteFormatOptions]
    : siteFormatOptions;

  useEffect(() => {
    if (deck?.format) {
      return;
    }

    setSelectedFormat((current) => current || defaultFormat);
  }, [deck?.format, defaultFormat]);

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

  function openDialog() {
    clearCloseTimer();
    clearNavigationTimer();
    setActionError("");
    setSaveState("idle");
    setDeleteState("idle");
    setShowDeleteConfirmation(false);
    setSelectedSprites(deck?.deckPokemon ?? []);
    setSelectedFormat(deck?.format || defaultFormat);
    setSelectedGoPreference(deck?.goPreference ?? "");
    setIsOpen(true);
  }

  function closeDialog() {
    clearCloseTimer();
    clearNavigationTimer();
    setIsOpen(false);
    setActionError("");
    setSaveState("idle");
    setDeleteState("idle");
    setShowDeleteConfirmation(false);
    setSelectedSprites(deck?.deckPokemon ?? []);
    setSelectedFormat(deck?.format || defaultFormat);
    setSelectedGoPreference(deck?.goPreference ?? "");
  }

  async function handleSubmit(formData: FormData) {
    setActionError("");
    setShowDeleteConfirmation(false);
    setSaveState("saving");

    try {
      const result = await (isEditing ? updateDeckAction(formData) : createDeckAction(formData));
      setSaveState("success");

      clearCloseTimer();
      closeTimerRef.current = window.setTimeout(() => {
        setIsOpen(false);
        clearNavigationTimer();
        navigationTimerRef.current = window.setTimeout(() => {
          setActionError("");
          setSaveState("idle");
          setDeleteState("idle");
          setShowDeleteConfirmation(false);
          setSelectedSprites(deck?.deckPokemon ?? []);

          if (normalizeRedirectPath(result.redirectTo) === pathname) {
            router.refresh();
            return;
          }

          router.push(result.redirectTo);
        }, 50);
      }, SUCCESS_CLOSE_DELAY_MS);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not save this deck.");
      setSaveState("idle");
    }
  }

  async function handleDelete() {
    if (!deck?.id) {
      return;
    }

    setActionError("");
    setDeleteState("deleting");

    try {
      const formData = new FormData();
      formData.set("deckId", deck.id);
      const result = await deleteDeckAction(formData);
      closeDialog();
      router.push(result.redirectTo);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not delete this deck.");
      setDeleteState("idle");
    }
  }

  const isDeleting = deleteState === "deleting";
  const isBusy = saveState === "saving" || isDeleting;

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          closeDialog();
        }
      }}
      open={isOpen}
    >
      <Button disabled={isDeleting} onClick={openDialog} variant={triggerVariant}>
        {triggerLabel}
      </Button>

      <DialogContent
        className="flex max-h-[calc(100dvh-2rem)] max-w-3xl min-w-0 flex-col overflow-hidden rounded-[28px] border border-border bg-card p-3 shadow-[var(--shadow-lg)] sm:max-w-3xl sm:p-4 lg:p-5"
        showCloseButton={false}
      >
            <div className="min-h-0 min-w-0 flex-1 touch-pan-y overflow-y-auto overflow-x-hidden overscroll-contain pr-1 [-webkit-overflow-scrolling:touch] [scrollbar-gutter:stable] sm:pr-2">
            <div className="mb-2 flex min-w-0 flex-col gap-4 border-b border-border pb-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <DialogTitle className="text-[1.55rem] font-bold tracking-[-0.05em] text-card-foreground sm:text-[1.9rem]">
                  {isEditing ? "Edit Deck" : "New Deck"}
                </DialogTitle>
                <DialogDescription className="sr-only">
                  {isEditing ? "Update this deck's details, Pokemon, and strategy notes." : "Create a deck with Pokemon, format, and strategy notes."}
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
                      setShowDeleteConfirmation((currentValue) => !currentValue);
                    }}
                    type="button"
                    variant="danger"
                  >
                    Delete Deck
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
              <section className="mb-5 rounded-2xl border border-[var(--color-loss-border)] bg-[var(--color-loss-bg)] p-4">
                <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-semibold text-[var(--color-loss)]">
                      Delete this deck strategy?
                    </p>
                    <p className="text-sm text-foreground">
                      Saved deck lists will be removed, and linked battle logs will stay in your
                      account as unlinked records.
                    </p>
                  </div>
                  <div className="grid w-full gap-2 sm:flex sm:w-auto sm:shrink-0 sm:flex-nowrap">
                    <Button
                      disabled={isBusy}
                      onClick={() => setShowDeleteConfirmation(false)}
                      type="button"
                      variant="secondary"
                    >
                      Cancel
                    </Button>
                    <Button
                      className="whitespace-normal sm:whitespace-nowrap"
                      disabled={isBusy}
                      onClick={() => void handleDelete()}
                      type="button"
                      variant="danger"
                    >
                      {isDeleting ? "Deleting..." : "Confirm Delete"}
                    </Button>
                  </div>
                </div>
              </section>
            ) : null}
            <form
              className="flex min-w-0 flex-col gap-6"
              onSubmit={(event) => {
                event.preventDefault();
                void handleSubmit(new FormData(event.currentTarget));
              }}
              ref={formRef}
            >
              {isEditing ? <input name="deckId" type="hidden" value={deck?.id ?? ""} /> : null}
              <input
                name="redirectTo"
                type="hidden"
                value={isEditing && deck?.id ? `/decks/${deck.id}` : "/decks"}
              />
              <input
                name="deckPokemonJson"
                readOnly
                type="hidden"
                value={JSON.stringify(selectedSprites)}
              />
              {selectedSprites.map((slug, index) => (
                <input key={`${slug}-${index}`} name="deckPokemon" type="hidden" value={slug} />
              ))}

              {actionError ? (
                <p className="rounded-xl border border-[var(--color-loss-border)] bg-[var(--color-loss-bg)] px-4 py-3 text-sm text-[var(--color-loss)]">
                  {actionError}
                </p>
              ) : null}

              <section className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-muted-foreground">Deck name</span>
                  <Input
                    className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-card-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                    defaultValue={deck?.deckName ?? ""}
                    name="deckName"
                    required
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-muted-foreground">Format</span>
                  <FormatSelect
                    name="format"
                    onChange={setSelectedFormat}
                    options={formatOptions}
                    value={selectedFormat}
                  />
                </label>

                <label className="grid gap-2 md:col-span-2">
                  <span className="text-sm font-semibold text-muted-foreground">
                    Turn preference
                  </span>
                  <AppSelect
                    name="goPreference"
                    onChange={setSelectedGoPreference}
                    options={[
                      { label: "No preference", value: "" },
                      { label: "Prefers First", value: "First" },
                      { label: "Prefers Second", value: "Second" }
                    ]}
                    value={selectedGoPreference}
                  />
                </label>
              </section>

              <BattleLogSpritePicker
                onChange={setSelectedSprites}
                pokemonOptions={pokemonOptions}
                sprites={selectedSprites}
                title="Featured Pokemon"
              />

              <section className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2 md:col-span-2">
                  <span className="text-sm font-semibold text-muted-foreground">
                    Core strategy
                  </span>
                  <Textarea
                    className="min-h-[140px] w-full rounded-xl border border-border bg-muted px-4 py-3 text-sm text-card-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                    defaultValue={deck?.coreStrategy ?? ""}
                    name="coreStrategy"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-muted-foreground">
                    Ideal bench
                  </span>
                  <Textarea
                    className="min-h-[140px] w-full rounded-xl border border-border bg-muted px-4 py-3 text-sm text-card-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                    defaultValue={parseSetupGoals(deck?.setupGoals ?? [])}
                    name="setupGoals"
                    placeholder="One ideal bench note per line"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-muted-foreground">
                    Potential cuts / techs / inclusions
                  </span>
                  <Textarea
                    className="min-h-[140px] w-full rounded-xl border border-border bg-muted px-4 py-3 text-sm text-card-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                    defaultValue={deck?.resourcePlan ?? ""}
                    name="resourcePlan"
                  />
                </label>

                <label className="grid gap-2 md:col-span-2">
                  <span className="text-sm font-semibold text-muted-foreground">
                    General notes
                  </span>
                  <Textarea
                    className="min-h-[160px] w-full rounded-xl border border-border bg-muted px-4 py-3 text-sm text-card-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                    defaultValue={deck?.generalNotes ?? ""}
                    name="generalNotes"
                  />
                </label>
              </section>
            </form>
            </div>
      </DialogContent>
    </Dialog>
  );
}
