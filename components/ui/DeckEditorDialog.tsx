"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createDeckAction, updateDeckAction } from "@/app/(app)/decks/actions";
import { BattleLogSpritePicker } from "@/components/ui/BattleLogSpritePicker";
import { Button } from "@/components/ui/Button";
import { DECK_FORMAT_OPTIONS, getDefaultDeckFormat } from "@/lib/decks/formats";
import type { Deck, PokemonOption } from "@/types/index";

type DeckEditorDialogProps = {
  deck?: Deck;
  pokemonOptions: PokemonOption[];
  triggerLabel: string;
  triggerVariant?: "primary" | "secondary" | "ghost";
};

type SaveState = "idle" | "saving" | "success";

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
          ? "w-[110px] shrink-0 pointer-events-none bg-[var(--color-win-strong)] text-[var(--text-inverse)] opacity-100 hover:bg-[var(--color-win-strong)]"
          : isSaving
            ? "w-[110px] shrink-0 pointer-events-none"
            : "w-[110px] shrink-0"
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
  pokemonOptions,
  triggerLabel,
  triggerVariant = "primary"
}: DeckEditorDialogProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedSprites, setSelectedSprites] = useState<string[]>(deck?.deckPokemon ?? []);
  const [saveError, setSaveError] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const closeTimerRef = useRef<number | null>(null);
  const navigationTimerRef = useRef<number | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const isEditing = Boolean(deck?.id);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

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
    setSaveError("");
    setSaveState("idle");
    setSelectedSprites(deck?.deckPokemon ?? []);
    setIsOpen(true);
  }

  function closeDialog() {
    clearCloseTimer();
    clearNavigationTimer();
    setIsOpen(false);
    setSaveError("");
    setSaveState("idle");
    setSelectedSprites(deck?.deckPokemon ?? []);
  }

  async function handleSubmit(formData: FormData) {
    setSaveError("");
    setSaveState("saving");

    try {
      const result = await (isEditing ? updateDeckAction(formData) : createDeckAction(formData));
      setSaveState("success");

      clearCloseTimer();
      closeTimerRef.current = window.setTimeout(() => {
        setIsOpen(false);
        clearNavigationTimer();
        navigationTimerRef.current = window.setTimeout(() => {
          setSaveError("");
          setSaveState("idle");
          setSelectedSprites(deck?.deckPokemon ?? []);

          if (normalizeRedirectPath(result.redirectTo) === pathname) {
            router.refresh();
            return;
          }

          router.push(result.redirectTo);
        }, 50);
      }, SUCCESS_CLOSE_DELAY_MS);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save this deck.");
      setSaveState("idle");
    }
  }

  return (
    <>
      <Button onClick={openDialog} variant={triggerVariant}>
        {triggerLabel}
      </Button>

      {isOpen ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 bg-[var(--bg-overlay)] p-4"
          onClick={closeDialog}
          role="dialog"
        >
          <div
            className="mx-auto flex max-h-[calc(100vh-2rem)] w-full max-w-3xl flex-col overflow-y-auto rounded-[28px] border border-[var(--border)] bg-[var(--bg-surface)] p-6 shadow-[var(--shadow-lg)] lg:p-8"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-2 flex flex-col gap-4 border-b border-[var(--border)] pb-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-[1.55rem] font-bold tracking-[-0.05em] text-[var(--text-primary)] sm:text-[1.9rem]">
                  {isEditing ? "Edit Deck" : "New Deck"}
                </h2>
              </div>
              <div className="flex flex-wrap gap-2.5">
                <Button onClick={closeDialog} type="button" variant="secondary">
                  Close
                </Button>
                <SaveButton
                  isEditing={isEditing}
                  onClick={() => formRef.current?.requestSubmit()}
                  saveState={saveState}
                />
              </div>
            </div>
            <form
              className="flex flex-col gap-6"
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

              {saveError ? (
                <p className="rounded-xl border border-[var(--color-loss-border)] bg-[var(--color-loss-bg)] px-4 py-3 text-sm text-[var(--color-loss)]">
                  {saveError}
                </p>
              ) : null}

              <section className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[var(--text-muted)]">Deck name</span>
                  <input
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface-alt)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/20"
                    defaultValue={deck?.deckName ?? ""}
                    name="deckName"
                    required
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[var(--text-muted)]">Format</span>
                  <select
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface-alt)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/20"
                    defaultValue={deck?.format || getDefaultDeckFormat()}
                    name="format"
                  >
                    {DECK_FORMAT_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-2 md:col-span-2">
                  <span className="text-sm font-semibold text-[var(--text-muted)]">
                    Turn preference
                  </span>
                  <select
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface-alt)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/20"
                    defaultValue={deck?.goPreference ?? ""}
                    name="goPreference"
                  >
                    <option value="">No preference</option>
                    <option value="First">Prefers First</option>
                    <option value="Second">Prefers Second</option>
                  </select>
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
                  <span className="text-sm font-semibold text-[var(--text-muted)]">
                    Core strategy
                  </span>
                  <textarea
                    className="min-h-[140px] w-full rounded-xl border border-[var(--border)] bg-[var(--bg-surface-alt)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/20"
                    defaultValue={deck?.coreStrategy ?? ""}
                    name="coreStrategy"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[var(--text-muted)]">
                    Setup goals
                  </span>
                  <textarea
                    className="min-h-[140px] w-full rounded-xl border border-[var(--border)] bg-[var(--bg-surface-alt)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/20"
                    defaultValue={parseSetupGoals(deck?.setupGoals ?? [])}
                    name="setupGoals"
                    placeholder="One setup goal per line"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[var(--text-muted)]">
                    Resource plan
                  </span>
                  <textarea
                    className="min-h-[140px] w-full rounded-xl border border-[var(--border)] bg-[var(--bg-surface-alt)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/20"
                    defaultValue={deck?.resourcePlan ?? ""}
                    name="resourcePlan"
                  />
                </label>

                <label className="grid gap-2 md:col-span-2">
                  <span className="text-sm font-semibold text-[var(--text-muted)]">
                    General notes
                  </span>
                  <textarea
                    className="min-h-[160px] w-full rounded-xl border border-[var(--border)] bg-[var(--bg-surface-alt)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/20"
                    defaultValue={deck?.generalNotes ?? ""}
                    name="generalNotes"
                  />
                </label>
              </section>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
