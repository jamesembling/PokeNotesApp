"use client";

import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
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
import { Card } from "@/components/shadcn/card";
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

const LANE_META: Record<MatchupLane, { dotClassName: string; label: string; description: string }> =
  {
    idealBench: {
      dotClassName: "bg-[var(--strategy-bench-plan)]",
      label: "Ideal Bench",
      description: "Capture your preferred bench state for this matchup."
    },
    techsNeeded: {
      dotClassName: "bg-[var(--strategy-tech)]",
      label: "Techs Needed",
      description: "List the cards or tech pieces you need for this matchup."
    },
    strategyNotes: {
      dotClassName: "bg-[var(--strategy-game-plan)]",
      label: "Strategy Notes",
      description: "Capture your matchup plan, sequencing notes, and testing takeaways."
    }
  };

const PHASE_META: Record<
  MatchupPhase,
  { dotClassName: string; label: string; description: string }
> = {
  earlyGame: {
    dotClassName: "bg-[var(--strategy-game-plan)]",
    label: "Early Game",
    description: "Capture your opening setup, first turns, and early priorities."
  },
  midGame: {
    dotClassName: "bg-[var(--strategy-bench-plan)]",
    label: "Mid Game",
    description: "Capture the exchanges, sequencing, and resources that shape the middle game."
  },
  lateGame: {
    dotClassName: "bg-[var(--strategy-tech)]",
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
    meta: { dotClassName: string; label: string }
  ) {
    if (notes.length === 0) {
      return (
        <div className="flex min-h-16 items-center justify-center rounded-lg border border-dashed border-border px-3 text-center text-sm text-muted-foreground">
          No {meta.label.toLowerCase()} notes yet.
        </div>
      );
    }

    return notes.map((note, index) => (
      <div
        className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-sm transition hover:bg-muted"
        draggable
        key={`${category}-${index}-${note}`}
        onDragEnd={() => setDraggedNote(null)}
        onDragOver={(event) => event.preventDefault()}
        onDragStart={() => setDraggedNote({ category, index })}
        onDrop={(event) => handleDrop(event, category, index)}
      >
        <GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground" />
        <span className="min-w-0 flex-1 text-card-foreground">{note}</span>
        <span className={`size-2 shrink-0 rounded-full ${meta.dotClassName}`} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button aria-label={`Actions for ${note}`} size="icon-xs" variant="ghost">
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
    <section aria-labelledby="matchup-strategy-workspace-heading" className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2
          className="font-display text-2xl font-semibold tracking-[-0.03em] text-card-foreground"
          id="matchup-strategy-workspace-heading"
        >
          Strategy Workspace
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

      <Card className="gap-0 overflow-hidden p-0 sm:gap-0 sm:p-0">
        <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-5">
          <div>
            <h3 className="font-display text-lg font-semibold tracking-[-0.025em] text-card-foreground">
              Matchup Notes
            </h3>
            <p className="text-sm text-muted-foreground">
              {PHASE_ORDER.reduce(
                (total, category) => total + workspace.phases[category].length,
                0
              )}{" "}
              notes across the game
            </p>
          </div>
        </div>

        <div className="grid md:grid-cols-3">
          {PHASE_ORDER.map((category) => {
            const notes = workspace.phases[category];
            const meta = PHASE_META[category];

            return (
              <section
                aria-labelledby={`matchup-phase-${category}`}
                className="flex min-h-64 flex-col border-t border-border first:border-t-0 md:border-l md:border-t-0 md:first:border-l-0"
                key={category}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => handleDrop(event, category, notes.length)}
              >
                <div className="flex items-start gap-3 px-4 py-3">
                  <span className={`mt-1.5 size-2.5 shrink-0 rounded-full ${meta.dotClassName}`} />
                  <div className="min-w-0 flex-1">
                    <h4
                      className="font-display text-base font-semibold text-card-foreground"
                      id={`matchup-phase-${category}`}
                    >
                      {meta.label}
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      {notes.length} {notes.length === 1 ? "note" : "notes"}
                    </p>
                  </div>
                  <Button
                    aria-label={`Add ${meta.label} note`}
                    onClick={() => openAddDialog(category)}
                    size="icon-lg"
                    variant="outline"
                  >
                    <Plus className="size-4" />
                  </Button>
                </div>

                <div className="flex-1 space-y-1.5 px-3 pb-2">
                  {renderNotes(category, notes, meta)}
                </div>

                <div className="flex justify-end px-3 pb-3 pt-0.5">
                  <Button
                    className="px-0 text-[var(--strategy-focus)]"
                    onClick={() => openAddDialog(category)}
                    variant="ghost"
                  >
                    <Plus className="size-4" />
                    Add Note
                  </Button>
                </div>
              </section>
            );
          })}
        </div>
      </Card>

      <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
        {LANE_ORDER.map((category) => {
          const notes = workspace.lanes[category];
          const meta = LANE_META[category];

          return (
            <Card className="gap-0 overflow-hidden p-0 sm:gap-0 sm:p-0" key={category}>
              <div className="flex items-start gap-3 px-4 py-3">
                <span className={`mt-1.5 size-2.5 shrink-0 rounded-full ${meta.dotClassName}`} />
                <div className="min-w-0 flex-1">
                  <h3 className="font-display text-base font-semibold text-card-foreground">
                    {meta.label}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {notes.length} {notes.length === 1 ? "note" : "notes"}
                  </p>
                </div>
                <Button
                  aria-label={`Add ${meta.label} note`}
                  onClick={() => openAddDialog(category)}
                  size="icon-lg"
                  variant="outline"
                >
                  <Plus className="size-4" />
                </Button>
              </div>

              <div className="min-h-20 space-y-1.5 px-3 pb-2">
                {renderNotes(category, notes, meta)}
              </div>

              <div className="flex justify-end px-3 pb-3 pt-0.5">
                <Button
                  className="px-0 text-[var(--strategy-focus)]"
                  onClick={() => openAddDialog(category)}
                  variant="ghost"
                >
                  <Plus className="size-4" />
                  Add Note
                </Button>
              </div>
            </Card>
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
