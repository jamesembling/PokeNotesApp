"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createDeckMatchupAction, updateDeckMatchupAction } from "@/app/(app)/decks/actions";
import { AppSelect } from "@/components/shadcn/app-select";
import { BattleLogSpritePicker } from "@/components/ui/BattleLogSpritePicker";
import { Button } from "@/components/shadcn/button";
import { ButtonGroup } from "@/components/shadcn/button-group";
import { AppDialogContent } from "@/components/ui/AppDialog";
import { ChoiceCard } from "@/components/ui/ChoiceCard";
import {
  Dialog,
  DialogDescription,
  DialogTitle
} from "@/components/shadcn/dialog";
import { Input } from "@/components/shadcn/input";
import { FormatSelect } from "@/components/ui/FormatSelect";
import { useSiteFormats } from "@/components/ui/SiteFormatsProvider";
import type { DeckMatchup, GoPreference, MatchupFavorability, PokemonOption } from "@/types/index";

type DeckMatchupEditorDialogProps = {
  children?: ReactNode;
  className?: string;
  deckId: string;
  initialOpen?: boolean;
  matchup?: DeckMatchup;
  pokemonOptions: PokemonOption[];
  triggerLabel: string;
  triggerVariant?: "default" | "outline" | "ghost";
  usePlainButton?: boolean;
};

type SaveState = "idle" | "saving" | "success";

const SUCCESS_CLOSE_DELAY_MS = 650;
const MATCHUP_FAVOR_OPTIONS: MatchupFavorability[] = [
  "Heavily Favoured",
  "Slightly Favoured",
  "Even",
  "Slightly Unfavoured",
  "Heavily Unfavoured"
];

function normalizeRedirectPath(value: string) {
  return value.split("?")[0] || value;
}

export function DeckMatchupEditorDialog({
  children,
  className,
  deckId,
  initialOpen = false,
  matchup,
  pokemonOptions,
  triggerLabel,
  triggerVariant = "outline",
  usePlainButton = false
}: DeckMatchupEditorDialogProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { defaultFormat, options: siteFormatOptions } = useSiteFormats();
  const isEditing = Boolean(matchup?.id);
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [selectedSprites, setSelectedSprites] = useState<string[]>(matchup?.deckPokemon ?? []);
  const [deckName, setDeckName] = useState(matchup?.deckName ?? "");
  const [selectedFormat, setSelectedFormat] = useState(matchup?.format || defaultFormat);
  const [goPreference, setGoPreference] = useState<GoPreference>(matchup?.goPreference ?? "");
  const [matchupFavor, setMatchupFavor] = useState<MatchupFavorability>(matchup?.matchupFavor ?? "");
  const [actionError, setActionError] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const closeTimerRef = useRef<number | null>(null);
  const navigationTimerRef = useRef<number | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    setSelectedFormat((current) => current || matchup?.format || defaultFormat);
  }, [defaultFormat, matchup?.format]);

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

  function resetFormState() {
    setSelectedSprites(matchup?.deckPokemon ?? []);
    setDeckName(matchup?.deckName ?? "");
    setSelectedFormat(matchup?.format || defaultFormat);
    setGoPreference(matchup?.goPreference ?? "");
    setMatchupFavor(matchup?.matchupFavor ?? "");
    setActionError("");
    setSaveState("idle");
  }

  function openDialog() {
    clearCloseTimer();
    clearNavigationTimer();
    resetFormState();
    setIsOpen(true);
  }

  function closeDialog() {
    clearCloseTimer();
    clearNavigationTimer();
    setIsOpen(false);
    resetFormState();
  }

  async function handleSubmit(formData: FormData) {
    setActionError("");
    setSaveState("saving");

    try {
      const result = await (isEditing
        ? updateDeckMatchupAction(formData)
        : createDeckMatchupAction(formData));
      setSaveState("success");

      clearCloseTimer();
      closeTimerRef.current = window.setTimeout(() => {
        setIsOpen(false);
        clearNavigationTimer();
        navigationTimerRef.current = window.setTimeout(() => {
          resetFormState();

          if (normalizeRedirectPath(result.redirectTo) === pathname) {
            router.refresh();
            return;
          }

          router.push(result.redirectTo);
        }, 50);
      }, SUCCESS_CLOSE_DELAY_MS);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : isEditing
            ? "Could not update this matchup."
            : "Could not create this matchup."
      );
      setSaveState("idle");
    }
  }

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          closeDialog();
        }
      }}
      open={isOpen}
    >
      {usePlainButton ? (
        <Button className={className} onClick={openDialog} type="button" variant="ghost">
          {children ?? triggerLabel}
        </Button>
      ) : (
        <Button className={className} onClick={openDialog} variant={triggerVariant}>
          {children ?? triggerLabel}
        </Button>
      )}

      <AppDialogContent
        showMobileCloseButton
        showCloseButton={false}
      >
              <div className="flex min-w-0 flex-col gap-4 border-b border-border bg-card px-3 py-4 pr-14 sm:px-4 sm:pr-14 lg:flex-row lg:items-start lg:justify-between lg:px-5">
                <div className="min-w-0">
                  <DialogTitle className="text-[1.55rem] font-bold tracking-[-0.05em] text-card-foreground sm:text-[1.9rem]">
                    {isEditing ? "Edit Matchup" : "New Matchup"}
                  </DialogTitle>
                  <DialogDescription className="sr-only">
                    {isEditing ? "Update this matchup's Pokemon, favorability, and notes." : "Create matchup notes for this deck."}
                  </DialogDescription>
                </div>
                <ButtonGroup className="w-full sm:w-auto sm:justify-end">
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
                          ? "Save Matchup"
                          : "Create Matchup"}
                  </Button>
                </ButtonGroup>
              </div>
            <div className="min-h-0 min-w-0 flex-1 touch-pan-y overflow-y-auto overflow-x-hidden overscroll-contain p-3 pr-1 [-webkit-overflow-scrolling:touch] [scrollbar-gutter:stable] sm:p-4 sm:pr-2 lg:p-5">

              <form
                action={handleSubmit}
                className="grid gap-6 pb-2"
                ref={formRef}
              >
                <input name="deckId" type="hidden" value={deckId} />
                {isEditing ? <input name="matchupId" type="hidden" value={matchup?.id ?? ""} /> : null}
                <input name="format" type="hidden" value={selectedFormat} />
                <input name="goPreference" type="hidden" value={goPreference} />
                <input name="matchupFavor" type="hidden" value={matchupFavor} />
                {isEditing ? (
                  <>
                    <input name="idealBench" type="hidden" value={matchup?.idealBench ?? ""} />
                    <input name="techsNeeded" type="hidden" value={matchup?.techsNeeded ?? ""} />
                    <input name="matchupPlan" type="hidden" value={matchup?.matchupPlan ?? ""} />
                  </>
                ) : null}
                {selectedSprites.map((slug, index) => (
                  <input key={`${slug}-${index}`} name="matchupSprites" type="hidden" value={slug} />
                ))}

                <section className="grid gap-4 md:grid-cols-2">
                  <label className="grid gap-2" htmlFor="matchup-deck-name">
                    <span className="text-sm font-semibold text-muted-foreground">Deck Name</span>
                    <Input
                      id="matchup-deck-name"
                      className="w-full rounded-xl border border-border bg-muted px-4 py-3 text-sm text-card-foreground outline-none transition placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/50"
                      name="deckName"
                      onChange={(event) => setDeckName(event.target.value)}
                      placeholder="Dragapult / Dusknoir, Gardevoir ex, Miraidon..."
                      value={deckName}
                    />
                  </label>

                  <label className="grid gap-2" htmlFor="matchup-format">
                    <span className="text-sm font-semibold text-muted-foreground">Format</span>
                    <FormatSelect
                      aria-label="Format"
                      className="rounded-xl px-4 py-3"
                      id="matchup-format"
                      onChange={setSelectedFormat}
                      options={
                        selectedFormat && !siteFormatOptions.includes(selectedFormat)
                          ? [selectedFormat, ...siteFormatOptions]
                          : siteFormatOptions
                      }
                      value={selectedFormat}
                    />
                  </label>

                  <section className="grid gap-2 md:col-span-2">
                    <span className="text-sm font-semibold text-muted-foreground">
                      Turn Preference
                    </span>
                    <div
                      aria-label="Turn preference"
                      className="grid gap-3 sm:grid-cols-2"
                      role="radiogroup"
                    >
                      <ChoiceCard
                        checked={goPreference === "First"}
                        label="Go First"
                        onClick={() => setGoPreference("First")}
                      />

                      <ChoiceCard
                        checked={goPreference === "Second"}
                        label="Go Second"
                        onClick={() => setGoPreference("Second")}
                      />
                    </div>
                  </section>

                  <label className="grid gap-2 md:col-span-2" htmlFor="matchup-favor">
                    <span className="text-sm font-semibold text-muted-foreground">Matchup Favour</span>
                    <AppSelect
                      aria-label="Matchup favour"
                      className="min-h-[3rem] rounded-xl px-4 py-3"
                      id="matchup-favor"
                      onChange={(value) => setMatchupFavor(value as MatchupFavorability)}
                      options={[
                        { label: "Select favour", value: "" },
                        ...MATCHUP_FAVOR_OPTIONS.map((option) => ({
                          label: option,
                          value: option
                        }))
                      ]}
                      placeholder="Select favour"
                      value={matchupFavor}
                    />
                  </label>
                </section>

                <BattleLogSpritePicker
                  onChange={setSelectedSprites}
                  pokemonOptions={pokemonOptions}
                  sprites={selectedSprites}
                  title="Featured Pokemon"
                />

                {actionError ? (
                  <p className="text-sm text-loss" role="status">
                    {actionError}
                  </p>
                ) : null}
              </form>
            </div>
      </AppDialogContent>
    </Dialog>
  );
}
