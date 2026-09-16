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
import type { SaveActionResult } from "@/app/(app)/logs/actions";
import { Alert, AlertDescription } from "@/components/shadcn/alert";
import { AppSelect } from "@/components/shadcn/app-select";
import { BattleLogSpritePicker } from "@/components/ui/BattleLogSpritePicker";
import { Button } from "@/components/shadcn/button";
import { ButtonGroup } from "@/components/shadcn/button-group";
import {
  AppDialogContent,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogMobileFooter
} from "@/components/ui/AppDialog";
import { DatePicker } from "@/components/ui/DatePicker";
import { Dialog } from "@/components/shadcn/dialog";
import { FormatSelect } from "@/components/ui/FormatSelect";
import {
  makeDeckListSelectionKey,
  parseDeckListSelectionKey,
  selectDeck,
  selectDeckList,
  type DeckListSelectionState
} from "@/lib/log-import/deck-list-selection";
import { useSiteFormats } from "@/components/ui/SiteFormatsProvider";
import type {
  BattleLog,
  DeckListSelectionOption,
  DeckSelectionOption,
  PokemonOption
} from "@/types/index";

export type EditLogDialogProps = {
  hideTrigger?: boolean;
  initialOpen?: boolean;
  log: BattleLog;
  pokemonOptions: PokemonOption[];
  trigger?: ReactElement<{
    onClick?: () => void;
    onSelect?: (event: Event) => void;
  }>;
  userDeckLists: DeckListSelectionOption[];
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
          ? "w-full whitespace-normal pointer-events-none bg-win-strong text-primary-foreground opacity-100 hover:bg-win-strong sm:w-[148px] sm:shrink-0 sm:whitespace-nowrap"
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
  userDeckLists,
  userDecks
}: EditLogDialogProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { options: siteFormatOptions } = useSiteFormats();
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [selectedSelfSprites, setSelectedSelfSprites] = useState(() =>
    log.selfDeckSprites.slice(0, 2)
  );
  const [selectedOpponentSprites, setSelectedOpponentSprites] = useState(
    () => log.opponentDeckSprites.slice(0, 2)
  );
  const [selectedDeckId, setSelectedDeckId] = useState(log.linkedDeckId ?? "");
  const [selectedDeckListSelectionKey, setSelectedDeckListSelectionKey] = useState(() =>
    log.linkedDeckListId
      ? makeDeckListSelectionKey({
          deckId: log.linkedDeckId ?? null,
          deckListId: log.linkedDeckListId
        })
      : ""
  );
  const [selectedDate, setSelectedDate] = useState(log.date);
  const [selectedFormat, setSelectedFormat] = useState(log.format);
  const [saveError, setSaveError] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const closeTimerRef = useRef<number | null>(null);
  const navigationTimerRef = useRef<number | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  const availableDeckLists = userDeckLists;
  const selectedDeckListId =
    parseDeckListSelectionKey(selectedDeckListSelectionKey)?.deckListId ?? "";

  function applyDeckListSelection(next: DeckListSelectionState) {
    setSelectedDeckId(next.deckId);
    setSelectedDeckListSelectionKey(next.selectionKey);
  }

  function handleDeckChange(nextDeckId: string) {
    applyDeckListSelection(
      selectDeck(
        {
          deckId: selectedDeckId,
          deckListId: selectedDeckListId,
          selectionKey: selectedDeckListSelectionKey
        },
        nextDeckId,
        availableDeckLists
      )
    );
  }

  function handleDeckListChange(nextSelectionKey: string) {
    applyDeckListSelection(
      selectDeckList(
        {
          deckId: selectedDeckId,
          deckListId: selectedDeckListId,
          selectionKey: selectedDeckListSelectionKey
        },
        nextSelectionKey,
        availableDeckLists
      )
    );
  }
  const formatOptions = useMemo(() => {
    const normalizedSelectedFormat = String(selectedFormat || "").trim();
    if (!normalizedSelectedFormat) {
      return [...siteFormatOptions];
    }

    return siteFormatOptions.includes(normalizedSelectedFormat)
      ? [...siteFormatOptions]
      : [normalizedSelectedFormat, ...siteFormatOptions];
  }, [selectedFormat, siteFormatOptions]);

  function resetEditorState() {
    setSelectedSelfSprites(log.selfDeckSprites.slice(0, 2));
    setSelectedOpponentSprites(log.opponentDeckSprites.slice(0, 2));
    setSelectedDeckId(log.linkedDeckId ?? "");
    setSelectedDeckListSelectionKey(
      log.linkedDeckListId
        ? makeDeckListSelectionKey({
            deckId: log.linkedDeckId ?? null,
            deckListId: log.linkedDeckListId
          })
        : ""
    );
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
    if (userDeckLists.length === 0 || !selectedDeckListSelectionKey) {
      return;
    }

    const deckList = userDeckLists.find(
      (option) =>
        (option.selectionKey ??
          makeDeckListSelectionKey({ deckId: option.deckId, deckListId: option.id })) ===
        selectedDeckListSelectionKey
    );
    if (!deckList) {
      setSelectedDeckListSelectionKey("");
    } else if (selectedDeckId && deckList.deckId !== selectedDeckId) {
      setSelectedDeckListSelectionKey("");
    }
  }, [selectedDeckId, selectedDeckListSelectionKey, userDeckLists]);

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
      const response = await fetch("/api/logs/update", {
        body: formData,
        cache: "no-store",
        credentials: "same-origin",
        method: "POST"
      });
      const result = (await response.json()) as SaveActionResult | { error?: string };

      if (!response.ok || !("ok" in result)) {
        const message = "error" in result ? result.error : undefined;
        throw new Error(message || "Could not save this battle log.");
      }

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

      <AppDialogContent
        showMobileCloseButton
        showCloseButton={false}
      >
            <AppDialogHeader
              description="Update the battle log date, format, linked deck, deck list, and Pokemon."
              title="Edit Battle Log"
            />
            <div className="min-h-0 min-w-0 flex-1 touch-pan-y overflow-y-auto overflow-x-hidden overscroll-contain p-3 pr-1 [-webkit-overflow-scrolling:touch] [scrollbar-gutter:stable] sm:p-4 sm:pr-2 lg:p-5">
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
                  className="border-loss-border bg-loss-bg text-loss-strong"
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
                <label className="grid min-w-0 gap-2" htmlFor="edit-log-date">
                  <span className="text-sm font-semibold text-muted-foreground">Date</span>
                  <DatePicker id="edit-log-date" onChange={setSelectedDate} value={selectedDate} />
                  <span aria-hidden="true" className="hidden min-h-[20px] text-xs opacity-0 xl:block">
                    Placeholder
                  </span>
                </label>

                <label className="grid min-w-0 gap-2" htmlFor="edit-log-format">
                  <span className="text-sm font-semibold text-muted-foreground">Format</span>
                  <FormatSelect
                    aria-label="Format"
                    id="edit-log-format"
                    onChange={setSelectedFormat}
                    options={formatOptions}
                    value={selectedFormat}
                  />
                  <span aria-hidden="true" className="hidden min-h-[20px] text-xs opacity-0 xl:block">
                    Placeholder
                  </span>
                </label>

                <label className="grid min-w-0 gap-2" htmlFor="edit-log-deck-strategy">
                  <span className="text-sm font-semibold text-muted-foreground">
                    Deck Strategy
                  </span>
                  <AppSelect
                    aria-label="Deck strategy"
                    id="edit-log-deck-strategy"
                    onChange={handleDeckChange}
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

                <label className="grid min-w-0 gap-2" htmlFor="edit-log-deck-list">
                  <span className="text-sm font-semibold text-muted-foreground">Deck List</span>
                  <AppSelect
                    aria-label="Deck list"
                    disabled={availableDeckLists.length === 0}
                    id="edit-log-deck-list"
                    onChange={handleDeckListChange}
                    options={[
                      {
                        label:
                          availableDeckLists.length > 0
                            ? "No linked deck list"
                            : "Select a deck strategy first",
                        value: ""
                      },
                      ...availableDeckLists.map((deckList: DeckListSelectionOption) => ({
                        label: deckList.name,
                        value:
                          deckList.selectionKey ??
                          makeDeckListSelectionKey({
                            deckId: deckList.deckId,
                            deckListId: deckList.id
                          })
                      }))
                    ]}
                    value={selectedDeckListSelectionKey}
                  />
                </label>
              </section>
            </form>
          </div>
          <AppDialogFooter>
            <ButtonGroup className="w-auto">
              <SaveButton onClick={() => formRef.current?.requestSubmit()} saveState={saveState} />
            </ButtonGroup>
          </AppDialogFooter>
          <AppDialogMobileFooter>
            <SaveButton onClick={() => formRef.current?.requestSubmit()} saveState={saveState} />
          </AppDialogMobileFooter>
      </AppDialogContent>
    </Dialog>
  );
}
