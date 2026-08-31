"use client";

import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  GripVertical,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2
} from "lucide-react";
import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { updateDeckMatchupPlanAction } from "@/app/(app)/decks/actions";
import { useCoalescedAutosave } from "@/components/hooks/useCoalescedAutosave";
import { Alert, AlertDescription } from "@/components/shadcn/alert";
import { Button } from "@/components/shadcn/button";
import { Dialog } from "@/components/shadcn/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/shadcn/dropdown-menu";
import { Textarea } from "@/components/shadcn/textarea";
import {
  AppDialogContent,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogMobileFooter
} from "@/components/ui/AppDialog";
import { SectionTitle } from "@/components/ui/Typography";
import styles from "@/components/ui/deck-strategy/strategy.module.css";
import {
  moveStrategyNoteBetweenLanes,
  moveStrategyNote,
  parseMatchupPlan,
  type MatchupPhase,
  serializeMatchupPlan,
  parseStrategyNoteText,
  serializeStrategyNotes
} from "@/lib/decks/strategy-workspace";
import type { DeckMatchup } from "@/types/index";

type InlineDeckMatchupEditorProps = {
  deckId: string;
  matchup: DeckMatchup;
};

type MatchupLane = "idealBench" | "techsNeeded" | "strategyNotes";
type NoteCollection = MatchupLane | MatchupPhase;
type MatchupWorkspaceState = {
  lanes: Record<MatchupLane, string[]>;
  phases: Record<MatchupPhase, string[]>;
};

const LANE_ORDER: MatchupLane[] = ["idealBench", "techsNeeded", "strategyNotes"];
const PHASE_ORDER: MatchupPhase[] = ["earlyGame", "midGame", "lateGame"];

const LANE_META: Record<MatchupLane, { label: string; description: string }> =
  {
    idealBench: {
      label: "Ideal Bench",
      description: "Capture your preferred bench state for this matchup."
    },
    techsNeeded: {
      label: "Techs Needed",
      description: "List the cards or tech pieces you need for this matchup."
    },
    strategyNotes: {
      label: "Strategy Notes",
      description: "Capture your matchup plan, sequencing notes, and testing takeaways."
    }
  };

const PHASE_META: Record<
  MatchupPhase,
  { label: string; description: string }
> = {
  earlyGame: {
    label: "Early Game",
    description: "Capture your opening setup, first turns, and early priorities."
  },
  midGame: {
    label: "Mid Game",
    description: "Capture the exchanges, sequencing, and resources that shape the middle game."
  },
  lateGame: {
    label: "Late Game",
    description: "Capture your closing routes, prize plan, and comeback considerations."
  }
};

function isMatchupPhase(category: NoteCollection): category is MatchupPhase {
  return PHASE_ORDER.includes(category as MatchupPhase);
}

function buildMatchupWorkspaceState(matchup: DeckMatchup): MatchupWorkspaceState {
  const matchupPlan = parseMatchupPlan(matchup.matchupPlan || "");

  return {
    lanes: {
      idealBench: parseStrategyNoteText(matchup.idealBench || ""),
      techsNeeded: parseStrategyNoteText(matchup.techsNeeded || ""),
      strategyNotes: matchupPlan.strategyNotes
    },
    phases: matchupPlan.phases
  };
}

export function InlineDeckMatchupEditor({ deckId, matchup }: InlineDeckMatchupEditorProps) {
  const initialState = buildMatchupWorkspaceState(matchup);
  const [workspace, setWorkspace] = useState(initialState);
  const workspaceRef = useRef(workspace);
  const recordKeyRef = useRef(`${deckId}:${matchup.id}`);
  const [dialogCategory, setDialogCategory] = useState<NoteCollection | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [editingNote, setEditingNote] = useState<{
    category: NoteCollection;
    index: number;
  } | null>(null);
  const [draggedNote, setDraggedNote] = useState<{
    category: NoteCollection;
    index: number;
  } | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<NoteCollection>>(
    () => new Set(["earlyGame", "strategyNotes"])
  );
  const { errorMessage, queueSave, resetSavedValue, saveStatus } = useCoalescedAutosave({
    fallbackError: "Could not save matchup changes.",
    initialValue: initialState,
    async save(nextState) {
      const formData = new FormData();
      formData.set("deckId", deckId);
      formData.set("matchupId", matchup.id);
      formData.set("idealBench", serializeStrategyNotes(nextState.lanes.idealBench));
      formData.set("techsNeeded", serializeStrategyNotes(nextState.lanes.techsNeeded));
      formData.set(
        "matchupPlan",
        serializeMatchupPlan({
          phases: nextState.phases,
          strategyNotes: nextState.lanes.strategyNotes
        })
      );

      await updateDeckMatchupPlanAction(formData);
    }
  });

  useEffect(() => {
    const nextRecordKey = `${deckId}:${matchup.id}`;
    if (recordKeyRef.current === nextRecordKey) {
      return;
    }

    recordKeyRef.current = nextRecordKey;
    const nextState = buildMatchupWorkspaceState(matchup);
    workspaceRef.current = nextState;
    setWorkspace(nextState);
    resetSavedValue(nextState);
    setExpandedCategories(new Set(["earlyGame", "strategyNotes"]));
  }, [deckId, matchup, resetSavedValue]);

  function commitWorkspace(nextState: MatchupWorkspaceState) {
    workspaceRef.current = nextState;
    setWorkspace(nextState);
    queueSave(nextState);
  }

  function updateCollection(category: NoteCollection, update: (notes: string[]) => string[]) {
    const current = workspaceRef.current;

    if (isMatchupPhase(category)) {
      commitWorkspace({
        ...current,
        phases: {
          ...current.phases,
          [category]: update(current.phases[category])
        }
      });
      return;
    }

    commitWorkspace({
      ...current,
      lanes: {
        ...current.lanes,
        [category]: update(current.lanes[category])
      }
    });
  }

  function openAddDialog(category: NoteCollection) {
    setEditingNote(null);
    setNoteDraft("");
    setDialogCategory(category);
    setExpandedCategories((current) => new Set(current).add(category));
  }

  function openEditDialog(category: NoteCollection, index: number, note: string) {
    setEditingNote({ category, index });
    setNoteDraft(note);
    setDialogCategory(category);
  }

  function closeDialog() {
    setDialogCategory(null);
    setEditingNote(null);
    setNoteDraft("");
  }

  function toggleCategory(category: NoteCollection) {
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

  function submitNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dialogCategory) {
      return;
    }

    const nextNote = noteDraft.trim();
    if (!nextNote) {
      return;
    }

    if (editingNote?.category === dialogCategory) {
      updateCollection(dialogCategory, (notes) =>
        notes.map((note, index) => (index === editingNote.index ? nextNote : note))
      );
    } else {
      updateCollection(dialogCategory, (notes) => [...notes, nextNote]);
    }

    closeDialog();
  }

  function handleDrop(event: DragEvent<HTMLElement>, category: NoteCollection, index: number) {
    event.preventDefault();
    event.stopPropagation();
    if (!draggedNote) {
      return;
    }

    if (isMatchupPhase(draggedNote.category) && isMatchupPhase(category)) {
      const sourceCategory = draggedNote.category;
      const targetCategory = category;
      commitWorkspace({
        ...workspaceRef.current,
        phases: moveStrategyNoteBetweenLanes(
          workspaceRef.current.phases,
          sourceCategory,
          draggedNote.index,
          targetCategory,
          index
        )
      });
    } else if (draggedNote.category === category) {
      updateCollection(category, (notes) =>
        moveStrategyNote(notes, draggedNote.index, Math.min(index, notes.length - 1))
      );
    }

    setDraggedNote(null);
  }

  function moveNoteToAdjacentPhase(category: MatchupPhase, index: number, direction: -1 | 1) {
    const currentPhaseIndex = PHASE_ORDER.indexOf(category);
    const nextCategory = PHASE_ORDER[currentPhaseIndex + direction];

    if (!nextCategory) {
      return;
    }

    setExpandedCategories((current) => new Set(current).add(nextCategory));

    commitWorkspace({
      ...workspaceRef.current,
      phases: moveStrategyNoteBetweenLanes(
        workspaceRef.current.phases,
        category,
        index,
        nextCategory,
        workspaceRef.current.phases[nextCategory].length
      )
    });
  }

  const saveLabel =
    saveStatus === "saving" ? "Saving…" : saveStatus === "error" ? "Save failed" : "Saved";
  const dialogMeta = dialogCategory
    ? isMatchupPhase(dialogCategory)
      ? PHASE_META[dialogCategory]
      : LANE_META[dialogCategory]
    : null;
  const isEditing = Boolean(editingNote && editingNote.category === dialogCategory);

  function renderNotes(
    category: NoteCollection,
    notes: string[],
    meta: { label: string }
  ) {
    if (notes.length === 0) {
      return (
        <p className={styles.emptyLane}>
          No {meta.label.toLowerCase()} notes yet.
        </p>
      );
    }

    return notes.map((note, index) => (
      <div
        className={styles.noteRow}
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
            <DropdownMenuItem onSelect={() => openEditDialog(category, index, note)}>
              <Pencil className="size-4" />
              Edit Note
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={index === 0}
              onSelect={() =>
                updateCollection(category, (laneNotes) =>
                  moveStrategyNote(laneNotes, index, index - 1)
                )
              }
            >
              <ArrowUp className="size-4" />
              Move Up
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={index === notes.length - 1}
              onSelect={() =>
                updateCollection(category, (laneNotes) =>
                  moveStrategyNote(laneNotes, index, index + 1)
                )
              }
            >
              <ArrowDown className="size-4" />
              Move Down
            </DropdownMenuItem>
            {isMatchupPhase(category) ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={category === PHASE_ORDER[0]}
                  onSelect={() => moveNoteToAdjacentPhase(category, index, -1)}
                >
                  <ArrowLeft className="size-4" />
                  Move to Previous Phase
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={category === PHASE_ORDER[PHASE_ORDER.length - 1]}
                  onSelect={() => moveNoteToAdjacentPhase(category, index, 1)}
                >
                  <ArrowRight className="size-4" />
                  Move to Next Phase
                </DropdownMenuItem>
              </>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() =>
                updateCollection(category, (laneNotes) =>
                  laneNotes.filter((_, noteIndex) => noteIndex !== index)
                )
              }
              variant="destructive"
            >
              <Trash2 className="size-4" />
              Delete Note
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    ));
  }

  return (
    <section aria-labelledby="matchup-strategy-workspace-heading" className={`${styles.workspace} ${styles.matchupWorkspace}`}>
      <div className={styles.notesHeader}>
        <SectionTitle id="matchup-strategy-workspace-heading" size="lg">
          Matchup Notes
        </SectionTitle>
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
          <span className="sr-only">Notes: </span>
          {saveLabel}
        </span>
      </div>

      {errorMessage ? (
        <Alert variant="loss">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>{errorMessage}</span>
            <Button onClick={() => queueSave(workspaceRef.current)} size="sm" variant="outline">
              Try Again
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className={`${styles.lanes} ${styles.matchupLanes}`}>
        {[...PHASE_ORDER, ...LANE_ORDER].map((category) => {
          const notes = isMatchupPhase(category)
            ? workspace.phases[category]
            : workspace.lanes[category];
          const meta = isMatchupPhase(category) ? PHASE_META[category] : LANE_META[category];
          const expanded = expandedCategories.has(category);

          return (
            <section
              aria-labelledby={`matchup-${category}-heading`}
              className={styles.lane}
              key={category}
              onDragOver={isMatchupPhase(category) ? (event) => event.preventDefault() : undefined}
              onDrop={isMatchupPhase(category) ? (event) => handleDrop(event, category, notes.length) : undefined}
            >
              <div className={styles.laneHeader}>
                <div className={styles.categorySummary}>
                  <SectionTitle as="h3" className={styles.laneTitle} id={`matchup-${category}-heading`} size="sm">
                    <span className={styles.desktopCategoryLabel}>{meta.label}</span>
                    <button
                      aria-controls={`matchup-${category}-notes`}
                      aria-expanded={expanded}
                      className={styles.categoryToggle}
                      onClick={() => toggleCategory(category)}
                      type="button"
                    >
                      <span>{meta.label}</span>
                      <ChevronDown aria-hidden="true" className="size-4" />
                    </button>
                  </SectionTitle>
                  <span className={styles.noteCount}>
                    {notes.length} {notes.length === 1 ? "note" : "notes"}
                  </span>
                </div>
                <Button
                  aria-label={`Add ${meta.label} note`}
                  onClick={() => openAddDialog(category)}
                  size="icon-lg"
                  variant="ghost"
                >
                  <Plus className="size-4" />
                </Button>
              </div>
              <div
                className={`${styles.laneBody} ${styles.matchupLaneBody} ${expanded ? "" : styles.laneCollapsed}`}
                id={`matchup-${category}-notes`}
              >
                <div className={styles.noteList} role={notes.length > 0 ? "list" : undefined}>
                  {renderNotes(category, notes, meta)}
                </div>
              </div>
            </section>
          );
        })}
      </div>

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            closeDialog();
          }
        }}
        open={Boolean(dialogCategory)}
      >
        <AppDialogContent showCloseButton={false} showMobileCloseButton size="compact">
          <AppDialogHeader
            description={
              dialogMeta
                ? isEditing
                  ? `Update this ${dialogMeta.label} strategy note.`
                  : dialogMeta.description
                : "Add or update a matchup strategy note."
            }
            descriptionHidden={false}
            title={
              dialogMeta
                ? isEditing
                  ? `Edit ${dialogMeta.label} Note`
                  : `Add to ${dialogMeta.label}`
                : "Matchup Note"
            }
          />
          <form className="contents" onSubmit={submitNote}>
            <div className="min-h-0 overflow-y-auto px-4 py-5 sm:px-5">
              <label
                className="grid gap-2 text-sm font-semibold text-card-foreground"
                htmlFor="matchup-strategy-note"
              >
                Note
                <Textarea
                  autoFocus
                  className="min-h-44 resize-y text-base"
                  id="matchup-strategy-note"
                  onChange={(event) => setNoteDraft(event.target.value)}
                  placeholder="Type your strategy note…"
                  value={noteDraft}
                />
              </label>
            </div>
            <AppDialogFooter>
              <Button disabled={!noteDraft.trim()} type="submit">
                {isEditing ? "Save Changes" : "Save Note"}
              </Button>
            </AppDialogFooter>
            <AppDialogMobileFooter>
              <Button className="min-h-11 w-full" disabled={!noteDraft.trim()} type="submit">
                {isEditing ? "Save Changes" : "Save Note"}
              </Button>
            </AppDialogMobileFooter>
          </form>
        </AppDialogContent>
      </Dialog>
    </section>
  );
}
