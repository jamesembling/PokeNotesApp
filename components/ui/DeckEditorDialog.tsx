"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  createDeckAction,
  deleteDeckAction,
  updateDeckAction
} from "@/app/(app)/decks/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/shadcn/alert";
import { AppSelect } from "@/components/shadcn/app-select";
import { BattleLogSpritePicker } from "@/components/ui/BattleLogSpritePicker";
import { Button } from "@/components/shadcn/button";
import { ButtonGroup } from "@/components/shadcn/button-group";
import { AppDialogContent, AppDialogHeader, AppDialogMobileFooter } from "@/components/ui/AppDialog";
import { Dialog } from "@/components/shadcn/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/shadcn/field";
import { Input } from "@/components/shadcn/input";
import { Textarea } from "@/components/shadcn/textarea";
import { FormatSelect } from "@/components/ui/FormatSelect";
import { useSiteFormats } from "@/components/ui/SiteFormatsProvider";
import type { Deck, PokemonOption } from "@/types/index";

export type DeckEditorDeck = Omit<Deck, "deckLists" | "matchups">;

export type DeckEditorDialogProps = {
  deck?: DeckEditorDeck;
  initialOpen?: boolean;
  pokemonOptions: PokemonOption[];
  triggerLabel: string;
  triggerVariant?: "default" | "outline" | "ghost";
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
          ? "w-full pointer-events-none bg-win-strong text-primary-foreground opacity-100 hover:bg-win-strong sm:w-[110px] sm:shrink-0"
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
  triggerVariant = "default"
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

      <AppDialogContent
        showMobileCloseButton
        showCloseButton={false}
      >
            <AppDialogHeader
              description={isEditing ? "Update this deck's details, Pokemon, and strategy notes." : "Create a deck with Pokemon, format, and strategy notes."}
              title={isEditing ? "Edit Deck" : "New Deck"}
            />
            <div className="min-h-0 min-w-0 flex-1 touch-pan-y overflow-y-auto overflow-x-hidden overscroll-contain p-3 pr-1 [-webkit-overflow-scrolling:touch] [scrollbar-gutter:stable] sm:p-4 sm:pr-2 lg:p-5">
            {isEditing && showDeleteConfirmation ? (
              <Alert
                className="mb-5 border-loss-border bg-loss-bg"
                variant="destructive"
              >
                <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <AlertTitle className="text-loss-strong">
                      Delete this deck strategy?
                    </AlertTitle>
                    <AlertDescription className="text-foreground">
                      Saved deck lists will be removed, and linked battle logs will stay in your
                      account as unlinked records.
                    </AlertDescription>
                  </div>
                  <ButtonGroup className="w-full sm:w-auto sm:shrink-0">
                    <Button
                      disabled={isBusy}
                      onClick={() => setShowDeleteConfirmation(false)}
                      type="button"
                      variant="outline"
                    >
                      Cancel
                    </Button>
                    <Button
                      className="whitespace-normal sm:whitespace-nowrap"
                      disabled={isBusy}
                      onClick={() => void handleDelete()}
                      type="button"
                      variant="destructive"
                    >
                      {isDeleting ? "Deleting..." : "Confirm Delete"}
                    </Button>
                  </ButtonGroup>
                </div>
              </Alert>
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
                <Alert variant="loss">
                  <AlertDescription>{actionError}</AlertDescription>
                </Alert>
              ) : null}

              <FieldGroup className="grid gap-4 md:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="deck-name">Deck name</FieldLabel>
                  <Input
                    defaultValue={deck?.deckName ?? ""}
                    id="deck-name"
                    name="deckName"
                    required
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="deck-format">Format</FieldLabel>
                  <FormatSelect
                    id="deck-format"
                    name="format"
                    onChange={setSelectedFormat}
                    options={formatOptions}
                    value={selectedFormat}
                  />
                </Field>

                <Field className="md:col-span-2">
                  <FieldLabel htmlFor="deck-go-preference">Turn preference</FieldLabel>
                  <AppSelect
                    id="deck-go-preference"
                    name="goPreference"
                    onChange={setSelectedGoPreference}
                    options={[
                      { label: "No preference", value: "" },
                      { label: "Prefers First", value: "First" },
                      { label: "Prefers Second", value: "Second" }
                    ]}
                    value={selectedGoPreference}
                  />
                </Field>
              </FieldGroup>

              <BattleLogSpritePicker
                onChange={setSelectedSprites}
                pokemonOptions={pokemonOptions}
                sprites={selectedSprites}
                title="Featured Pokemon"
              />

              <FieldGroup className="grid gap-4 md:grid-cols-2">
                <Field className="md:col-span-2">
                  <FieldLabel htmlFor="deck-core-strategy">Core strategy</FieldLabel>
                  <Textarea
                    className="min-h-[140px]"
                    defaultValue={deck?.coreStrategy ?? ""}
                    id="deck-core-strategy"
                    name="coreStrategy"
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="deck-setup-goals">Ideal bench</FieldLabel>
                  <Textarea
                    className="min-h-[140px]"
                    defaultValue={parseSetupGoals(deck?.setupGoals ?? [])}
                    id="deck-setup-goals"
                    name="setupGoals"
                    placeholder="One ideal bench note per line"
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="deck-resource-plan">
                    Potential cuts / techs / inclusions
                  </FieldLabel>
                  <Textarea
                    className="min-h-[140px]"
                    defaultValue={deck?.resourcePlan ?? ""}
                    id="deck-resource-plan"
                    name="resourcePlan"
                  />
                </Field>

                <Field className="md:col-span-2">
                  <FieldLabel htmlFor="deck-general-notes">General notes</FieldLabel>
                  <Textarea
                    className="min-h-[160px]"
                    defaultValue={deck?.generalNotes ?? ""}
                    id="deck-general-notes"
                    name="generalNotes"
                  />
                </Field>
              </FieldGroup>

              {isEditing ? (
                <div className="border-t border-border pt-4 sm:hidden">
                  <Button
                    className="w-full"
                    disabled={isBusy}
                    onClick={() => {
                      setActionError("");
                      setShowDeleteConfirmation((currentValue) => !currentValue);
                    }}
                    type="button"
                    variant="destructive"
                  >
                    Delete Deck
                  </Button>
                </div>
              ) : null}

              <ButtonGroup className="hidden border-t border-border pt-4 sm:ml-auto sm:flex sm:w-auto sm:flex-row sm:justify-end sm:gap-0">
                {isEditing ? (
                  <Button
                    disabled={isBusy}
                    onClick={() => {
                      setActionError("");
                      setShowDeleteConfirmation((currentValue) => !currentValue);
                    }}
                    type="button"
                    variant="destructive"
                  >
                    Delete Deck
                  </Button>
                ) : null}
                <SaveButton
                  isEditing={isEditing}
                  onClick={() => formRef.current?.requestSubmit()}
                  saveState={saveState}
                />
              </ButtonGroup>
            </form>
            </div>
            <AppDialogMobileFooter>
              <SaveButton
                isEditing={isEditing}
                onClick={() => formRef.current?.requestSubmit()}
                saveState={saveState}
              />
            </AppDialogMobileFooter>
      </AppDialogContent>
    </Dialog>
  );
}
