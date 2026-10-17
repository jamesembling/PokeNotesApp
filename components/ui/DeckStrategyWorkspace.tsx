"use client";

import {
  AlertCircle,
  ArrowRight,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
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
import { SectionTitle } from "@/components/ui/Typography";
import styles from "@/components/ui/deck-strategy/strategy.module.css";
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
  | "updatedAt"
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
  { label: string; shortLabel: string }
> = {
  gamePlan: {
    label: "Game Plan",
    shortLabel: "Game Plan"
  },
  benchPlan: {
    label: "Bench Plan",
    shortLabel: "Bench"
  },
  tech: {
    label: "Tech & Changes",
    shortLabel: "Tech"
  },
  unsorted: {
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
  const viewedVersionRef = useRef(deck.updatedAt);
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
      formData.set("expectedUpdatedAt", viewedVersionRef.current);
      formData.set("goPreference", nextState.goPreference);
      formData.set("coreStrategy", serializeStrategyNotes(nextState.lanes.gamePlan));
      formData.set("setupGoals", serializeStrategyNotes(nextState.lanes.benchPlan));
      formData.set("resourcePlan", serializeStrategyNotes(nextState.lanes.tech));
      formData.set("generalNotes", serializeStrategyNotes(nextState.lanes.unsorted));
      const result = await updateDeckStrategyAction(formData);
      viewedVersionRef.current = result.updatedAt;
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
      className={styles.quickCapture}
      onSubmit={submitQuickNote}
    >
      <label className={styles.captureLabel} htmlFor="quick-strategy-note">Quick Capture</label>
      <div className={styles.captureInputRow}>
        <Input
          aria-label="Quick strategy note"
          className={styles.captureInput}
          id="quick-strategy-note"
          onChange={(event) => setQuickNote(event.target.value)}
          placeholder="Type a thought…"
          ref={quickCaptureRef}
          value={quickNote}
        />

        <Button
          aria-label="Add note"
          className={styles.captureSubmit}
          disabled={!quickNote.trim()}
          type="submit"
        >
          <ArrowRight className="size-5" />
        </Button>
      </div>

      <div className={styles.captureFooter}>
        <fieldset className={styles.captureCategories}>
          <legend className="sr-only">Save note to</legend>
          <span aria-hidden="true" className={styles.captureDestination}>Add to</span>
          {CATEGORY_ORDER.map((category) => (
            <button
              aria-pressed={quickCategory === category}
              className={styles.categoryChoice}
              key={category}
              onClick={() => setQuickCategory(category)}
              type="button"
            >
              {CATEGORY_META[category].shortLabel}
            </button>
          ))}
        </fieldset>
        <span className={styles.captureHint}>Enter to save</span>
      </div>
    </form>
  );

  return (
    <div className={styles.workspace}>
      <div className={styles.contextRow}>
        <div className={styles.turnPreference}>
          <span>Prefer to Go</span>
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
              size="sm"
              options={[
                { value: "First", label: "First" },
                { value: "Second", label: "Second" }
              ]}
            />
          </Tabs>
        </div>
        <span
          aria-live="polite"
          className={styles.saveStatus}
          data-state={saveStatus}
          role="status"
        >
          {saveStatus === "error" ? (
            <AlertCircle aria-hidden="true" className="size-3.5" />
          ) : saveStatus === "saving" ? null : (
            <CheckCircle2 aria-hidden="true" className="size-3.5" />
          )}
          {saveLabel}
        </span>
      </div>

      <div className={styles.captureDesktop}>{quickCapture}</div>

      <section aria-labelledby="strategy-workspace-heading" className={styles.notesSection}>
        <div className={styles.notesHeader}>
          <SectionTitle id="strategy-workspace-heading" size="lg">
            Strategy
          </SectionTitle>

          <div className={styles.noteTools}>
            <div className={styles.desktopSearch}>
              <Search aria-hidden="true" className="size-4" />
              <Input
                aria-label="Search strategy notes"
                className={styles.searchInput}
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
              variant="ghost"
            >
              <Search className="size-5" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button aria-label="Filter strategy notes" aria-pressed={filter !== "all"} className={styles.filterButton} size="icon-lg" variant="ghost">
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
          <div className={styles.searchSummary}>
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

        <div className={styles.lanes}>
          {visibleCategories.map((category) => {
            const allNotes = workspace.lanes[category];
            const visibleNotes = workspace.lanes[category]
              .map((note, index) => ({ note, index }))
              .filter(({ note }) => noteMatches(note));
            const expanded = expandedCategories.has(category);
            const revealed = revealedCategories.has(category);
            const isEditingCategory = editingNote?.category === category;

            return (
              <section aria-labelledby={`strategy-${category}-heading`} className={styles.lane} key={category}>
                <div className={styles.laneHeader}>
                  <div className={styles.categorySummary}>
                    <SectionTitle as="h3" className={styles.laneTitle} id={`strategy-${category}-heading`} size="sm">
                      <span className={styles.desktopCategoryLabel}>{CATEGORY_META[category].label}</span>
                      <button
                        aria-controls={`strategy-${category}-notes`}
                        aria-expanded={expanded}
                        className={styles.categoryToggle}
                        onClick={() => toggleCategory(category)}
                        type="button"
                      >
                        {CATEGORY_META[category].label}
                        <ChevronDown aria-hidden="true" className="size-4" />
                      </button>
                    </SectionTitle>
                    <span className={styles.noteCount}>
                      {allNotes.length} {allNotes.length === 1 ? "note" : "notes"}
                    </span>
                  </div>

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
                        variant="ghost"
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
                    variant="ghost"
                  >
                    <Plus className="size-4" />
                  </Button>
                </div>

                <div className={expanded ? styles.laneBody : `${styles.laneBody} ${styles.laneCollapsed}`} id={`strategy-${category}-notes`}>
                  <div className={styles.noteList} role="list">
                    {visibleNotes.length === 0 ? (
                      <p className={styles.emptyLane}>
                        {normalizedQuery ? "No matching notes." : `No ${CATEGORY_META[category].label.toLowerCase()} notes yet.`}
                      </p>
                    ) : (
                      visibleNotes.map(({ note, index }, visibleIndex) => (
                          <div
                            className={styles.noteRow}
                            data-concealed={visibleIndex >= 4 && !revealed}
                            data-dragging={draggedNote?.category === category && draggedNote.index === index}
                            draggable
                            key={`${category}-${index}-${note}`}
                            onDragEnd={() => setDraggedNote(null)}
                            onDragOver={(event) => event.preventDefault()}
                            onDragStart={() => setDraggedNote({ category, index })}
                            onDrop={(event) => handleDrop(event, category, index)}
                            role="listitem"
                          >
                            <GripVertical aria-hidden="true" className={styles.dragHandle} />
                            <span className={styles.noteText}>{note}</span>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button aria-label={`Actions for ${note}`} className={styles.noteActions} size="icon-xs" variant="ghost">
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

                    {visibleNotes.length > 4 && !revealed ? (
                      <Button
                        className={styles.revealNotes}
                        onClick={() =>
                          setRevealedCategories((current) => new Set(current).add(category))
                        }
                        variant="ghost"
                      >
                        View {visibleNotes.length - 4} more
                      </Button>
                    ) : null}
                </div>
              </section>
            );
          })}
        </div>
      </section>

    </div>
  );
}
