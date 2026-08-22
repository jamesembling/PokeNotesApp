"use client";

import {
  AlertCircle,
  ArrowRight,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Filter,
  GripVertical,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2
} from "lucide-react";
import {
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type FormEvent
} from "react";
import { updateDeckStrategyAction } from "@/app/(app)/decks/actions";
import { useCoalescedAutosave } from "@/components/hooks/useCoalescedAutosave";
import { Alert, AlertDescription } from "@/components/shadcn/alert";
import { Button } from "@/components/shadcn/button";
import { Card } from "@/components/shadcn/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/shadcn/dropdown-menu";
import { Dialog, DialogTrigger } from "@/components/shadcn/dialog";
import { Input } from "@/components/shadcn/input";
import { Tabs } from "@/components/shadcn/tabs";
import { Textarea } from "@/components/shadcn/textarea";
import {
  AppDialogContent,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogMobileFooter
} from "@/components/ui/AppDialog";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import {
  buildStrategyWorkspaceState,
  moveStrategyNote,
  serializeStrategyNotes,
  type EditableStrategyLane,
  type StrategyWorkspaceState
} from "@/lib/decks/strategy-workspace";
import type { Deck } from "@/types/index";

type StrategyCategory = EditableStrategyLane;
type StrategyDeck = Pick<
  Deck,
  | "coreStrategy"
  | "generalNotes"
  | "goPreference"
  | "id"
  | "resourcePlan"
  | "setupGoals"
>;

type DeckStrategyWorkspaceProps = {
  deck: StrategyDeck;
};

const CATEGORY_ORDER: StrategyCategory[] = [
  "gamePlan",
  "benchPlan",
  "tech",
  "unsorted"
];

const CATEGORY_META: Record<
  StrategyCategory,
  { dotClassName: string; label: string; shortLabel: string }
> = {
  gamePlan: {
    dotClassName: "bg-[var(--strategy-game-plan)]",
    label: "Game Plan",
    shortLabel: "Game Plan"
  },
  benchPlan: {
    dotClassName: "bg-[var(--strategy-bench-plan)]",
    label: "Bench Plan",
    shortLabel: "Bench"
  },
  tech: {
    dotClassName: "bg-[var(--strategy-tech)]",
    label: "Tech & Changes",
    shortLabel: "Tech"
  },
  unsorted: {
    dotClassName: "bg-[var(--strategy-unsorted)]",
    label: "Unsorted",
    shortLabel: "Unsorted"
  }
};

function getInitialState(deck: StrategyDeck) {
  return buildStrategyWorkspaceState(deck);
}

export function DeckStrategyWorkspace({ deck }: DeckStrategyWorkspaceProps) {
  const initialState = useMemo(() => getInitialState(deck), [deck]);
  const [workspace, setWorkspace] = useState<StrategyWorkspaceState>(initialState);
  const workspaceRef = useRef(workspace);
  const quickCaptureRef = useRef<HTMLInputElement | null>(null);
  const [quickCategory, setQuickCategory] = useState<StrategyCategory>("unsorted");
  const [quickNote, setQuickNote] = useState("");
  const [noteDialogCategory, setNoteDialogCategory] = useState<EditableStrategyLane | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [query, setQuery] = useState("");
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | StrategyCategory>("all");
  const [expandedCategories, setExpandedCategories] = useState<Set<StrategyCategory>>(
    () => new Set(["gamePlan"])
  );
  const [revealedCategories, setRevealedCategories] = useState<Set<StrategyCategory>>(
    () => new Set()
  );
  const [editingNote, setEditingNote] = useState<{
    category: EditableStrategyLane;
    index: number;
  } | null>(null);
  const [draggedNote, setDraggedNote] = useState<{
    category: EditableStrategyLane;
    index: number;
  } | null>(null);
  const {
    errorMessage,
    queueSave,
    saveStatus
  } = useCoalescedAutosave({
    fallbackError: "Could not save strategy changes.",
    initialValue: initialState,
    async save(nextState) {
      const formData = new FormData();
      formData.set("deckId", deck.id);
      formData.set("goPreference", nextState.goPreference);
      formData.set("coreStrategy", serializeStrategyNotes(nextState.lanes.gamePlan));
      formData.set("setupGoals", serializeStrategyNotes(nextState.lanes.benchPlan));
      formData.set("resourcePlan", serializeStrategyNotes(nextState.lanes.tech));
      formData.set("generalNotes", serializeStrategyNotes(nextState.lanes.unsorted));
      await updateDeckStrategyAction(formData);
    }
  });

  const normalizedQuery = query.trim().toLocaleLowerCase();

  function commitWorkspace(nextState: StrategyWorkspaceState) {
    workspaceRef.current = nextState;
    setWorkspace(nextState);
    queueSave(nextState);
  }

  function updateLane(
    category: EditableStrategyLane,
    update: (notes: string[]) => string[]
  ) {
    const nextState = {
      ...workspaceRef.current,
      lanes: {
        ...workspaceRef.current.lanes,
        [category]: update(workspaceRef.current.lanes[category])
      }
    };
    commitWorkspace(nextState);
  }

  function addNote(category: EditableStrategyLane, note: string) {
    const trimmedNote = note.trim();
    if (!trimmedNote) {
      return;
    }

    updateLane(category, (notes) => [...notes, trimmedNote]);
  }

  function submitQuickNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    addNote(quickCategory, quickNote);
    setQuickNote("");
  }

  function focusQuickCapture(category: EditableStrategyLane) {
    setQuickCategory(category);
    window.requestAnimationFrame(() => {
      quickCaptureRef.current?.focus();
      quickCaptureRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  function submitNoteDialog(event: FormEvent<HTMLFormElement>, category: EditableStrategyLane) {
    event.preventDefault();
    const nextValue = noteDraft.trim();
    if (!nextValue) {
      return;
    }

    if (editingNote?.category === category) {
      updateLane(category, (notes) =>
        notes.map((note, index) => (index === editingNote.index ? nextValue : note))
      );
    } else {
      addNote(category, nextValue);
    }

    setNoteDialogCategory(null);
    setEditingNote(null);
    setNoteDraft("");
  }

  function toggleCategory(category: StrategyCategory) {
    setExpandedCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }

  function noteMatches(note: string) {
    return !normalizedQuery || note.toLocaleLowerCase().includes(normalizedQuery);
  }

  function handleDrop(
    event: DragEvent<HTMLDivElement>,
    category: EditableStrategyLane,
    index: number
  ) {
    event.preventDefault();
    if (!draggedNote || draggedNote.category !== category) {
      return;
    }

    updateLane(category, (notes) => moveStrategyNote(notes, draggedNote.index, index));
    setDraggedNote(null);
  }

  const saveLabel =
    saveStatus === "saving"
      ? "Saving…"
      : saveStatus === "error"
        ? "Save failed"
        : "Saved";

  const visibleCategories = CATEGORY_ORDER.filter(
    (category) => filter === "all" || filter === category
  );

  const quickCapture = (
    <form
      className="grid gap-3"
      onSubmit={submitQuickNote}
    >
      <p className="text-sm font-semibold text-card-foreground">Quick Capture</p>
      <div className="flex min-w-0 gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              className="h-12 min-w-[8.5rem] justify-between border-[var(--strategy-focus)] text-[var(--strategy-focus)] sm:hidden"
              type="button"
              variant="outline"
            >
              <span className="flex items-center gap-2">
                <span className={`size-2.5 rounded-full ${CATEGORY_META[quickCategory].dotClassName}`} />
                {CATEGORY_META[quickCategory].shortLabel}
              </span>
              <ChevronDown className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-52" side="top">
            <DropdownMenuRadioGroup
              onValueChange={(value) => setQuickCategory(value as StrategyCategory)}
              value={quickCategory}
            >
              {CATEGORY_ORDER.map((category) => (
                <DropdownMenuRadioItem key={category} value={category}>
                  <span className={`size-2 rounded-full ${CATEGORY_META[category].dotClassName}`} />
                  {CATEGORY_META[category].label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <Input
          aria-label="Quick strategy note"
          className="h-12 flex-1 px-4 text-base"
          onChange={(event) => setQuickNote(event.target.value)}
          placeholder="Type a thought…"
          ref={quickCaptureRef}
          value={quickNote}
        />

        <Button
          aria-label="Add note"
          className="size-12 p-0"
          disabled={!quickNote.trim()}
          type="submit"
        >
          <ArrowRight className="size-5" />
        </Button>
      </div>

      <div className="hidden flex-wrap items-center gap-2 sm:flex">
        {CATEGORY_ORDER.map((category) => (
          <Button
            className={
              quickCategory === category
                ? "border-[var(--strategy-focus)] bg-[var(--strategy-focus-soft)] text-[var(--strategy-focus)]"
                : ""
            }
            key={category}
            onClick={() => setQuickCategory(category)}
            size="sm"
            type="button"
            variant="outline"
          >
            <span className={`size-2 rounded-full ${CATEGORY_META[category].dotClassName}`} />
            {CATEGORY_META[category].shortLabel}
          </Button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">Press Enter to save</span>
      </div>
    </form>
  );

  return (
    <div className="flex flex-col gap-6 pb-4 sm:pb-0">
      <Card className="order-1 p-3 sm:order-2 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <span className="text-sm font-semibold text-muted-foreground">Prefer to Go</span>
          <Tabs
            onValueChange={(value) => {
              const nextState = {
                ...workspaceRef.current,
                goPreference: value as StrategyWorkspaceState["goPreference"]
              };
              commitWorkspace(nextState);
            }}
            value={workspace.goPreference}
          >
            <SegmentedControl
              ariaLabel="Turn preference"
              className="w-full sm:w-fit"
              options={[
                { value: "First", label: "First" },
                { value: "Second", label: "Second" }
              ]}
            />
          </Tabs>
        </div>
      </Card>

      <Card className="order-2 hidden p-4 sm:order-1 sm:block">{quickCapture}</Card>

      <section aria-labelledby="strategy-workspace-heading" className="order-3 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <h2
              className="font-display text-2xl font-semibold tracking-[-0.03em] text-card-foreground"
              id="strategy-workspace-heading"
            >
              <span className="hidden sm:inline">Strategy Workspace</span>
              <span className="sm:hidden">Strategy</span>
            </h2>
            <span
              aria-live="polite"
              className={
                saveStatus === "error"
                  ? "flex items-center gap-1.5 text-sm font-medium text-loss-strong"
                  : "flex items-center gap-1.5 text-sm font-medium text-win-strong"
              }
              role="status"
            >
              {saveStatus === "error" ? (
                <AlertCircle className="size-4" />
              ) : (
                <CheckCircle2 className="size-4" />
              )}
              {saveLabel}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative hidden sm:block">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Search strategy notes"
                className="h-10 w-64 pl-9"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search notes"
                value={query}
              />
            </div>
            <Button
              aria-label="Search strategy notes"
              className="sm:hidden"
              aria-expanded={mobileSearchOpen}
              onClick={() => setMobileSearchOpen((current) => !current)}
              size="icon-lg"
              variant="outline"
            >
              <Search className="size-5" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="gap-2" size="icon-lg" variant="outline">
                  <Filter className="size-5" />
                  <span className="sr-only">Filter strategy notes</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuRadioGroup
                  onValueChange={(value) => setFilter(value as typeof filter)}
                  value={filter}
                >
                  <DropdownMenuRadioItem value="all">All notes</DropdownMenuRadioItem>
                  {CATEGORY_ORDER.map((category) => (
                    <DropdownMenuRadioItem key={category} value={category}>
                      <span className={`size-2 rounded-full ${CATEGORY_META[category].dotClassName}`} />
                      {CATEGORY_META[category].label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {mobileSearchOpen ? (
          <div className="relative sm:hidden">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Search strategy notes"
              autoFocus
              className="h-11 pl-9"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search notes"
              value={query}
            />
          </div>
        ) : null}

        {query ? (
          <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-sm">
            <span className="truncate text-muted-foreground">Showing notes matching “{query}”</span>
            <Button onClick={() => setQuery("")} size="xs" variant="ghost">
              Clear
            </Button>
          </div>
        ) : null}

        {errorMessage ? (
          <Alert variant="loss">
            <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
              <span>{errorMessage}</span>
              <Button
                onClick={() => queueSave(workspaceRef.current)}
                size="sm"
                variant="outline"
              >
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleCategories.map((category) => {
            const allNotes = workspace.lanes[category];
            const visibleNotes = workspace.lanes[category]
              .map((note, index) => ({ note, index }))
              .filter(({ note }) => noteMatches(note));
            const expanded = expandedCategories.has(category);
            const revealed = revealedCategories.has(category);
            const isEditingCategory = editingNote?.category === category;

            return (
              <Card className="gap-0 overflow-hidden p-0 sm:gap-0 sm:p-0" key={category}>
                <div className="flex items-center gap-3 px-4 py-3">
                  <button
                    aria-expanded={expanded}
                    className="flex min-w-0 flex-1 items-start gap-3 text-left md:pointer-events-none"
                    onClick={() => toggleCategory(category)}
                    type="button"
                  >
                    <span className={`mt-1.5 size-2.5 shrink-0 rounded-full ${CATEGORY_META[category].dotClassName}`} />
                    <span className="min-w-0">
                      <span className="block truncate text-base font-semibold text-card-foreground">
                        {CATEGORY_META[category].label}
                      </span>
                      <span className="block text-sm text-muted-foreground">
                        {allNotes.length} {allNotes.length === 1 ? "note" : "notes"}
                      </span>
                    </span>
                    <ChevronRight
                      className={`ml-auto size-5 shrink-0 self-center text-muted-foreground transition-transform md:hidden ${expanded ? "rotate-90" : ""}`}
                    />
                  </button>

                  <Dialog
                    onOpenChange={(open) => {
                      if (open) {
                        setNoteDialogCategory(category);
                        setEditingNote(null);
                        setNoteDraft("");
                      } else if (noteDialogCategory === category) {
                        setNoteDialogCategory(null);
                        setEditingNote(null);
                        setNoteDraft("");
                      }
                    }}
                    open={noteDialogCategory === category}
                  >
                    <DialogTrigger asChild>
                      <Button
                        aria-label={`Add ${CATEGORY_META[category].label} note`}
                        className="sm:hidden"
                        size="icon-lg"
                        variant="outline"
                      >
                        <Plus className="size-4" />
                      </Button>
                    </DialogTrigger>
                    <AppDialogContent
                      showCloseButton={false}
                      showMobileCloseButton
                      size="compact"
                    >
                      <AppDialogHeader
                        description={
                          isEditingCategory
                            ? `Update this ${CATEGORY_META[category].label} strategy note.`
                            : `Capture a strategy thought for ${CATEGORY_META[category].label}.`
                        }
                        descriptionHidden={false}
                        title={
                          isEditingCategory
                            ? `Edit ${CATEGORY_META[category].label} Note`
                            : `Add to ${CATEGORY_META[category].label}`
                        }
                      />
                      <form
                        className="contents"
                        onSubmit={(event) => submitNoteDialog(event, category)}
                      >
                        <div className="min-h-0 overflow-y-auto px-4 py-5 sm:px-5">
                          <label
                            className="grid gap-2 text-sm font-semibold text-card-foreground"
                            htmlFor={`strategy-note-${category}`}
                          >
                            Note
                            <Textarea
                              autoFocus
                              className="min-h-44 resize-y text-base"
                            id={`strategy-note-${category}`}
                              onChange={(event) => setNoteDraft(event.target.value)}
                              placeholder="Type your strategy note…"
                              value={noteDraft}
                            />
                          </label>
                        </div>
                        <AppDialogFooter>
                          <Button disabled={!noteDraft.trim()} type="submit">
                            {isEditingCategory ? "Save Changes" : "Save Note"}
                          </Button>
                        </AppDialogFooter>
                        <AppDialogMobileFooter>
                          <Button
                            className="min-h-11 w-full"
                            disabled={!noteDraft.trim()}
                            type="submit"
                          >
                            {isEditingCategory ? "Save Changes" : "Save Note"}
                          </Button>
                        </AppDialogMobileFooter>
                      </form>
                    </AppDialogContent>
                  </Dialog>
                  <Button
                    aria-label={`Add ${CATEGORY_META[category].label} note`}
                    className="hidden sm:inline-flex"
                    onClick={() => focusQuickCapture(category)}
                    size="icon-lg"
                    variant="outline"
                  >
                    <Plus className="size-4" />
                  </Button>
                </div>

                <div className={expanded ? "block" : "hidden md:block"}>
                  <div className="space-y-1.5 px-3 pb-2">
                    {visibleNotes.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-border px-3 py-5 text-center text-sm text-muted-foreground">
                        {normalizedQuery ? "No matching notes." : `No ${CATEGORY_META[category].label.toLowerCase()} notes yet.`}
                      </div>
                    ) : (
                      visibleNotes.map(({ note, index }, visibleIndex) => (
                          <div
                            className={`${visibleIndex >= 4 && !revealed ? "hidden md:flex" : "flex"} min-h-11 items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-sm transition hover:bg-muted`}
                            draggable
                            key={`${category}-${index}-${note}`}
                            onDragEnd={() => setDraggedNote(null)}
                            onDragOver={(event) => event.preventDefault()}
                            onDragStart={() => setDraggedNote({ category, index })}
                            onDrop={(event) => handleDrop(event, category, index)}
                          >
                            <GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground" />
                            <span className="min-w-0 flex-1 text-card-foreground">{note}</span>
                            <span className={`size-2 shrink-0 rounded-full ${CATEGORY_META[category].dotClassName}`} />
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button aria-label={`Actions for ${note}`} size="icon-xs" variant="ghost">
                                  <MoreHorizontal className="size-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onSelect={() => {
                                    setEditingNote({ category, index });
                                    setNoteDialogCategory(category);
                                    setNoteDraft(note);
                                  }}
                                >
                                  <Pencil className="size-4" />
                                  Edit note
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={index === 0}
                                  onSelect={() =>
                                    updateLane(category, (notes) =>
                                      moveStrategyNote(notes, index, index - 1)
                                    )
                                  }
                                >
                                  <ArrowUp className="size-4" />
                                  Move up
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={index === workspace.lanes[category].length - 1}
                                  onSelect={() =>
                                    updateLane(category, (notes) =>
                                      moveStrategyNote(notes, index, index + 1)
                                    )
                                  }
                                >
                                  <ArrowDown className="size-4" />
                                  Move down
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onSelect={() =>
                                    updateLane(category, (notes) =>
                                      notes.filter((_, noteIndex) => noteIndex !== index)
                                    )
                                  }
                                  variant="destructive"
                                >
                                  <Trash2 className="size-4" />
                                  Delete note
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                      ))
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-3 px-3 pb-3 pt-0.5 text-sm">
                    {visibleNotes.length > 4 && !revealed ? (
                      <Button
                        className="px-0 text-[var(--strategy-focus)]"
                        onClick={() =>
                          setRevealedCategories((current) => new Set(current).add(category))
                        }
                        variant="ghost"
                      >
                        View {visibleNotes.length - 4} more
                      </Button>
                    ) : (
                      <span />
                    )}
                    <Button
                      className="hidden px-0 text-[var(--strategy-focus)] sm:inline-flex"
                      onClick={() => focusQuickCapture(category)}
                      variant="ghost"
                    >
                      <Plus className="size-4" />
                      Add another
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </section>

    </div>
  );
}
