"use client";

import {
  cloneElement,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { updateLogAction } from "@/app/(app)/logs/actions";
import { Alert, AlertDescription } from "@/components/shadcn/alert";
import { AppSelect } from "@/components/shadcn/app-select";
import { BattleLogSpritePicker } from "@/components/ui/BattleLogSpritePicker";
import { Button } from "@/components/shadcn/button";
import { ButtonGroup } from "@/components/shadcn/button-group";
import { DatePicker } from "@/components/ui/DatePicker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle
} from "@/components/shadcn/dialog";
import { FormatSelect } from "@/components/ui/FormatSelect";
import { useSiteFormats } from "@/components/ui/SiteFormatsProvider";
import type { BattleLog, DeckListOption, DeckSelectionOption, PokemonOption } from "@/types/index";

export type EditLogDialogProps = {
  hideTrigger?: boolean;
  initialOpen?: boolean;
  log: BattleLog;
  pokemonOptions: PokemonOption[];
  trigger?: ReactElement<{
    onClick?: () => void;
    onSelect?: (event: Event) => void;
  }>;
  userDecks: DeckSelectionOption[];
};

type SaveState = "idle" | "saving" | "success";

const SUCCESS_CLOSE_DELAY_MS = 250;

function SaveButton({
  onClick,
  saveState
}: {
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
          ? "w-full whitespace-normal pointer-events-none bg-[var(--color-win-strong)] text-primary-foreground opacity-100 hover:bg-[var(--color-win-strong)] sm:w-[148px] sm:shrink-0 sm:whitespace-nowrap"
          : isSaving
            ? "w-full whitespace-normal pointer-events-none sm:w-[148px] sm:shrink-0 sm:whitespace-nowrap"
            : "w-full whitespace-normal sm:w-[148px] sm:shrink-0 sm:whitespace-nowrap"
      }
      disabled={isSaving}
      onClick={onClick}
      type="button"
    >
      {isSaving ? "Saving..." : isSuccess ? "Saved" : "Save Changes"}
    </Button>
  );
}

function normalizeRedirectPath(value: string) {
  return value.split("?")[0] || value;
}

export function EditLogDialog({
  hideTrigger = false,
  initialOpen = false,
  log,
  pokemonOptions,
  trigger,
  userDecks
}: EditLogDialogProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { options: siteFormatOptions } = useSiteFormats();
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [selectedSelfSprites, setSelectedSelfSprites] = useState(log.selfDeckSprites.slice(0, 2));
  const [selectedOpponentSprites, setSelectedOpponentSprites] = useState(
    log.opponentDeckSprites.slice(0, 2)
  );
  const [selectedDeckId, setSelectedDeckId] = useState(log.linkedDeckId ?? "");
  const [selectedDeckListId, setSelectedDeckListId] = useState(log.linkedDeckListId ?? "");
  const [selectedDate, setSelectedDate] = useState(log.date);
  const [selectedFormat, setSelectedFormat] = useState(log.format);
  const [saveError, setSaveError] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const closeTimerRef = useRef<number | null>(null);
  const navigationTimerRef = useRef<number | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  const selectedDeck = useMemo(
    () => userDecks.find((deck) => deck.id === selectedDeckId) ?? null,
    [selectedDeckId, userDecks]
  );
  const formatOptions = useMemo(() => {
    const normalizedSelectedFormat = String(selectedFormat || "").trim();
    if (!normalizedSelectedFormat) {
      return [...siteFormatOptions];
    }

    return siteFormatOptions.includes(normalizedSelectedFormat)
      ? [...siteFormatOptions]
      : [normalizedSelectedFormat, ...siteFormatOptions];
  }, [selectedFormat, siteFormatOptions]);

  const availableDeckLists = selectedDeck?.deckLists ?? [];

  function resetEditorState() {
    setSelectedSelfSprites(log.selfDeckSprites.slice(0, 2));
    setSelectedOpponentSprites(log.opponentDeckSprites.slice(0, 2));
    setSelectedDeckId(log.linkedDeckId ?? "");
    setSelectedDeckListId(log.linkedDeckListId ?? "");
    setSelectedDate(log.date);
    setSelectedFormat(log.format);
    setSaveError("");
    setSaveState("idle");
  }

  function openDialog() {
    resetEditorState();
    setIsOpen(true);
  }

  useEffect(() => {
    if (!selectedDeckId) {
      setSelectedDeckListId("");
      return;
    }

    const stillValid = availableDeckLists.some((deckList) => deckList.id === selectedDeckListId);
    if (!stillValid) {
      setSelectedDeckListId("");
    }
  }, [availableDeckLists, selectedDeckId, selectedDeckListId]);

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

  function closeDialog() {
    clearCloseTimer();
    clearNavigationTimer();
    setIsOpen(false);
    resetEditorState();
  }

  async function handleSubmit(formData: FormData) {
    setSaveError("");
    setSaveState("saving");

    try {
      const result = await updateLogAction(formData);
      setSaveState("success");

      clearCloseTimer();
      closeTimerRef.current = window.setTimeout(() => {
        setIsOpen(false);
        clearNavigationTimer();
        navigationTimerRef.current = window.setTimeout(() => {
          resetEditorState();

          if (normalizeRedirectPath(result.redirectTo) === pathname) {
            router.refresh();
            return;
          }

          router.push(result.redirectTo);
        }, 50);
      }, SUCCESS_CLOSE_DELAY_MS);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save this battle log.");
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
      {hideTrigger ? null : isValidElement(trigger) ? (
        cloneElement(trigger, {
          ...trigger.props,
          onClick: () => {
            trigger.props.onClick?.();
            openDialog();
          },
          onSelect: (event: Event) => {
            trigger.props.onSelect?.(event);
            event.preventDefault();
            openDialog();
          }
        })
      ) : (
        <Button
          onClick={openDialog}
          variant="outline"
        >
          Edit Log
        </Button>
      )}

      <DialogContent
        className="flex max-h-[calc(100dvh-2rem)] max-w-3xl min-w-0 flex-col overflow-hidden rounded-[28px] border border-border bg-card p-3 shadow-[var(--shadow-lg)] sm:max-w-3xl sm:p-4 lg:p-5"
        showMobileCloseButton
        showCloseButton={false}
      >
            <div className="min-h-0 min-w-0 flex-1 touch-pan-y overflow-y-auto overflow-x-hidden overscroll-contain pr-1 [-webkit-overflow-scrolling:touch] [scrollbar-gutter:stable] sm:pr-2">
            <div className="mb-6 flex min-w-0 flex-col gap-4 border-b border-border pb-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <DialogTitle className="text-[1.55rem] font-bold tracking-[-0.05em] text-card-foreground sm:text-[1.9rem]">
                  Edit Battle Log
                </DialogTitle>
                <DialogDescription className="sr-only">
                  Update the battle log date, format, linked deck, deck list, and Pokemon.
                </DialogDescription>
              </div>
            </div>
            <form
              className="flex min-w-0 flex-col gap-6"
              onSubmit={(event) => {
                event.preventDefault();
                void handleSubmit(new FormData(event.currentTarget));
              }}
              ref={formRef}
            >
              <input name="logId" type="hidden" value={log.id} />
              <input name="date" type="hidden" value={selectedDate} />
              <input name="format" type="hidden" value={selectedFormat} />
              <input name="linkedDeckId" type="hidden" value={selectedDeckId} />
              <input name="linkedDeckListId" type="hidden" value={selectedDeckListId} />
              <input name="redirectTo" type="hidden" value={pathname} />

              {selectedSelfSprites.map((slug, index) => (
                <input key={`self-sprite-${slug}-${index}`} name="selfSprites" type="hidden" value={slug} />
              ))}
              {selectedOpponentSprites.map((slug, index) => (
                <input
                  key={`opponent-sprite-${slug}-${index}`}
                  name="opponentSprites"
                  type="hidden"
                  value={slug}
                />
              ))}

              {saveError ? (
                <Alert
                  className="border-[var(--color-loss-border)] bg-[var(--color-loss-bg)] text-[var(--color-loss)]"
                  variant="destructive"
                >
                  <AlertDescription>{saveError}</AlertDescription>
                </Alert>
              ) : null}

              <BattleLogSpritePicker
                onChange={setSelectedSelfSprites}
                pokemonOptions={pokemonOptions}
                sprites={selectedSelfSprites}
                title={`${log.selfPlayerName}'s deck`}
              />

              <BattleLogSpritePicker
                onChange={setSelectedOpponentSprites}
                pokemonOptions={pokemonOptions}
                sprites={selectedOpponentSprites}
                title={"Opponent's deck"}
              />

              <section className="grid gap-4 xl:grid-cols-2">
                <label className="grid min-w-0 gap-2">
                  <span className="text-sm font-semibold text-muted-foreground">Date</span>
                  <DatePicker onChange={setSelectedDate} value={selectedDate} />
                  <span aria-hidden="true" className="min-h-[20px] text-xs opacity-0">
                    Placeholder
                  </span>
                </label>

                <label className="grid min-w-0 gap-2">
                  <span className="text-sm font-semibold text-muted-foreground">Format</span>
                  <FormatSelect
                    onChange={setSelectedFormat}
                    options={formatOptions}
                    value={selectedFormat}
                  />
                  <span aria-hidden="true" className="min-h-[20px] text-xs opacity-0">
                    Placeholder
                  </span>
                </label>

                <label className="grid min-w-0 gap-2">
                  <span className="text-sm font-semibold text-muted-foreground">
                    Deck Strategy
                  </span>
                  <AppSelect
                    onChange={setSelectedDeckId}
                    options={[
                      { label: "No linked deck", value: "" },
                      ...userDecks.map((deck) => ({
                        label: deck.deckName,
                        value: deck.id
                      }))
                    ]}
                    value={selectedDeckId}
                  />
                </label>

                <label className="grid min-w-0 gap-2">
                  <span className="text-sm font-semibold text-muted-foreground">Deck List</span>
                  <AppSelect
                    disabled={availableDeckLists.length === 0}
                    onChange={setSelectedDeckListId}
                    options={[
                      {
                        label:
                          availableDeckLists.length > 0
                            ? "No linked deck list"
                            : "Select a deck strategy first",
                        value: ""
                      },
                      ...availableDeckLists.map((deckList: DeckListOption) => ({
                        label: deckList.name,
                        value: deckList.id
                      }))
                    ]}
                    value={selectedDeckListId}
                  />
                </label>
              </section>

              <ButtonGroup className="w-full flex-col gap-2 border-t border-border pt-4 max-sm:[&>*]:!rounded-lg max-sm:[&>*]:!border max-sm:[&>*]:!border-border sm:ml-auto sm:w-auto sm:flex-row sm:justify-end sm:gap-0">
                <Button className="w-full sm:w-auto" onClick={closeDialog} type="button" variant="outline">
                  Close
                </Button>
                <SaveButton onClick={() => formRef.current?.requestSubmit()} saveState={saveState} />
              </ButtonGroup>
            </form>
            </div>
      </DialogContent>
    </Dialog>
  );
}
