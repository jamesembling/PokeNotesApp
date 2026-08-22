"use client";

import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  GripVertical,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type FormEvent
} from "react";
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
  moveStrategyNote,
  parseStrategyNoteText,
  serializeStrategyNotes
} from "@/lib/decks/strategy-workspace";
import type { DeckMatchup } from "@/types/index";

type InlineDeckMatchupEditorProps = {
  deckId: string;
  matchup: DeckMatchup;
};

type MatchupLane = "idealBench" | "techsNeeded" | "matchupPlan";
type MatchupWorkspaceState = Record<MatchupLane, string[]>;

const LANE_ORDER: MatchupLane[] = ["idealBench", "techsNeeded", "matchupPlan"];

const LANE_META: Record<
  MatchupLane,
  { dotClassName: string; label: string; description: string }
> = {
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
  matchupPlan: {
    dotClassName: "bg-[var(--strategy-game-plan)]",
    label: "Strategy Notes",
    description: "Capture your matchup plan, sequencing notes, and testing takeaways."
  }
};

function buildMatchupWorkspaceState(matchup: DeckMatchup): MatchupWorkspaceState {
  return {
    idealBench: parseStrategyNoteText(matchup.idealBench || ""),
    techsNeeded: parseStrategyNoteText(matchup.techsNeeded || ""),
    matchupPlan: parseStrategyNoteText(matchup.matchupPlan || "")
  };
}

export function InlineDeckMatchupEditor({
  deckId,
  matchup
}: InlineDeckMatchupEditorProps) {
  const initialState = buildMatchupWorkspaceState(matchup);
  const [workspace, setWorkspace] = useState(initialState);
  const workspaceRef = useRef(workspace);
  const recordKeyRef = useRef(`${deckId}:${matchup.id}`);
  const [dialogCategory, setDialogCategory] = useState<MatchupLane | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [editingNote, setEditingNote] = useState<{
    category: MatchupLane;
    index: number;
  } | null>(null);
  const [draggedNote, setDraggedNote] = useState<{
    category: MatchupLane;
    index: number;
  } | null>(null);
  const { errorMessage, queueSave, resetSavedValue, saveStatus } =
    useCoalescedAutosave({
      fallbackError: "Could not save matchup changes.",
      initialValue: initialState,
      async save(nextState) {
        const formData = new FormData();
        formData.set("deckId", deckId);
        formData.set("matchupId", matchup.id);
        formData.set("idealBench", serializeStrategyNotes(nextState.idealBench));
        formData.set("techsNeeded", serializeStrategyNotes(nextState.techsNeeded));
        formData.set("matchupPlan", serializeStrategyNotes(nextState.matchupPlan));

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

  function updateLane(category: MatchupLane, update: (notes: string[]) => string[]) {
    commitWorkspace({
      ...workspaceRef.current,
      [category]: update(workspaceRef.current[category])
    });
  }

  function openAddDialog(category: MatchupLane) {
    setEditingNote(null);
    setNoteDraft("");
    setDialogCategory(category);
  }

  function openEditDialog(category: MatchupLane, index: number, note: string) {
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
      updateLane(dialogCategory, (notes) =>
        notes.map((note, index) => (index === editingNote.index ? nextNote : note))
      );
    } else {
      updateLane(dialogCategory, (notes) => [...notes, nextNote]);
    }

    closeDialog();
  }

  function handleDrop(
    event: DragEvent<HTMLDivElement>,
    category: MatchupLane,
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
  const dialogMeta = dialogCategory ? LANE_META[dialogCategory] : null;
  const isEditing = Boolean(editingNote && editingNote.category === dialogCategory);

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

      <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
        {LANE_ORDER.map((category) => {
          const notes = workspace[category];
          const meta = LANE_META[category];

          return (
            <Card className="gap-0 overflow-hidden p-0 sm:gap-0 sm:p-0" key={category}>
              <div className="flex items-start gap-3 px-4 py-3">
                <span className={`mt-1.5 size-2.5 shrink-0 rounded-full ${meta.dotClassName}`} />
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-semibold text-card-foreground">{meta.label}</h3>
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

              <div className="space-y-1.5 px-3 pb-2">
                {notes.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border px-3 py-5 text-center text-sm text-muted-foreground">
                    No {meta.label.toLowerCase()} notes yet.
                  </div>
                ) : (
                  notes.map((note, index) => (
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
                          <DropdownMenuItem
                            onSelect={() => openEditDialog(category, index, note)}
                          >
                            <Pencil className="size-4" />
                            Edit Note
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={index === 0}
                            onSelect={() =>
                              updateLane(category, (laneNotes) =>
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
                              updateLane(category, (laneNotes) =>
                                moveStrategyNote(laneNotes, index, index + 1)
                              )
                            }
                          >
                            <ArrowDown className="size-4" />
                            Move Down
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onSelect={() =>
                              updateLane(category, (laneNotes) =>
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
                  ))
                )}
              </div>

              <div className="flex justify-end px-3 pb-3 pt-0.5">
                <Button
                  className="px-0 text-[var(--strategy-focus)]"
                  onClick={() => openAddDialog(category)}
                  variant="ghost"
                >
                  <Plus className="size-4" />
                  Add Another
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
