import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { normalizeMatchNotes } from "@/lib/battle-log/match-notes";
import {
  MatchNotesWriteConflictError,
  persistOwnerMatchNotes
} from "@/lib/db/log-match-notes";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

type MatchNotesQueryOp = {
  args: unknown[];
  method: string;
};

function createMatchNotesClient({
  error = null,
  initialValue = null,
  logId = "log-1",
  ownerUserId = "owner-1"
}: {
  error?: unknown;
  initialValue?: string | null;
  logId?: string;
  ownerUserId?: string;
} = {}) {
  const operations: MatchNotesQueryOp[] = [];
  let updatedValue: string | null | undefined;

  const chain = {
    eq(...args: unknown[]) {
      operations.push({ args, method: "eq" });
      return chain;
    },
    is(...args: unknown[]) {
      operations.push({ args, method: "is" });
      return chain;
    },
    select(...args: unknown[]) {
      operations.push({ args, method: "select" });
      const hasOwner = operations.some(
        (operation) =>
          operation.method === "eq" &&
          operation.args[0] === "user_id" &&
          operation.args[1] === ownerUserId
      );
      const hasLog = operations.some(
        (operation) =>
          operation.method === "eq" &&
          operation.args[0] === "id" &&
          operation.args[1] === logId
      );
      const requiresEmptyNote = operations.some(
        (operation) =>
          operation.method === "is" &&
          operation.args[0] === "match_notes" &&
          operation.args[1] === null
      );

      return Promise.resolve({
        data:
          !error && hasOwner && hasLog && (!requiresEmptyNote || initialValue === null)
            ? [{ id: logId, match_notes: updatedValue ?? null }]
            : [],
        error
      });
    },
    update(value: { match_notes: string | null }) {
      operations.push({ args: [value], method: "update" });
      updatedValue = value.match_notes;
      return chain;
    }
  };

  return {
    client: {
      from(table: string) {
        assert.equal(table, "logs");
        operations.push({ args: [table], method: "from" });
        return chain;
      }
    },
    operations,
    get updatedValue() {
      return updatedValue;
    }
  };
}

test("match notes trim outer whitespace, preserve line breaks, and normalize empty input", () => {
  assert.equal(
    normalizeMatchNotes(" \n  Kept the active safe.\nReview turn four. \n "),
    "Kept the active safe.\nReview turn four."
  );
  assert.equal(normalizeMatchNotes(" \n\t\r "), null);
  assert.equal(normalizeMatchNotes(null), null);
});

test("battle-log import persists only normalized nullable match notes", () => {
  const action = source("app/(app)/logs/actions.ts");
  const recordBlock = action.slice(
    action.indexOf("const record: ImportLogRecord"),
    action.indexOf('supabase.from("logs").insert')
  );

  assert.match(recordBlock, /match_notes: normalizeMatchNotes\(formData\.get\("matchNotes"\)\)/);
  assert.match(source("lib/log-import/types.ts"), /match_notes: string \| null/);
  assert.match(source("types/supabase.ts"), /match_notes: string \| null/);
});

test("import review exposes an accessible private optional notes field", () => {
  const dialog = source("components/ui/ImportLogDialog.tsx");

  assert.match(dialog, /<FieldLabel htmlFor="import-match-notes">Match notes<\/FieldLabel>/);
  assert.match(dialog, /id="import-match-notes"/);
  assert.match(dialog, /name="matchNotes"/);
  assert.match(dialog, /Optional and private to you\. Match notes are not included in shared links\./);
  assert.doesNotMatch(dialog, /name="matchNotes"[\s\S]{0,300}maxLength=/);
});

test("owner match summary switches between exact add and edit notes actions", () => {
  const shell = source("components/ui/BattleLogDetailShell.tsx");
  const button = source("components/ui/LazyMatchNotesButton.tsx");

  assert.match(shell, /<LazyMatchNotesButton/);
  assert.match(shell, /logId=\{log\.id\}/);
  assert.match(shell, /notes=\{log\.matchNotes\}/);
  assert.match(button, /const label = notes \? "Edit match notes" : "Add match notes"/);
  assert.equal(button.match(/Edit match notes/g)?.length, 1);
  assert.equal(button.match(/Add match notes/g)?.length, 1);
  assert.match(button, /aria-haspopup="dialog"/);
  assert.match(button, /min-h-11/);
});

test("mobile Match Summary actions are icon-only with exact accessible names and touch targets", () => {
  const shell = source("components/ui/BattleLogDetailShell.tsx");
  const notesButton = source("components/ui/LazyMatchNotesButton.tsx");

  assert.match(shell, /<PageActions className="sm:hidden">/);
  assert.match(shell, /aria-label="Edit Log"/);
  assert.match(shell, /<span className="sr-only">Edit Log<\/span>/);
  assert.match(shell, /<LazyMatchNotesButton[\s\S]{0,180}iconOnly/);
  assert.match(shell, /ariaLabel="Share Log"/);
  assert.match(shell, /<span className="sr-only">Share Log<\/span>/);
  assert.equal(shell.match(/size-11 min-h-11 min-w-11 p-0/g)?.length, 3);
  assert.match(notesButton, /MessageSquareTextIcon/);
  assert.match(notesButton, /aria-label=\{iconOnly \? label : undefined\}/);
  assert.match(notesButton, /<span className="sr-only">\{label\}<\/span>/);
  assert.match(shell, /<PageActions className="hidden sm:flex">[\s\S]*?<LazyEditLogButton log=\{log\}/);
  assert.match(
    shell,
    /<PageActions className="hidden sm:flex">[\s\S]*?<LazyMatchNotesButton logId=\{log\.id\} notes=\{log\.matchNotes\}/
  );
});

test("existing match notes open in the shared editable notes field", () => {
  const dialog = source("components/ui/MatchNotesDialog.tsx");

  assert.match(dialog, /<AppDialogContent/);
  assert.match(dialog, /<AppDialogHeader/);
  assert.match(dialog, /<AppDialogFooter>/);
  assert.match(dialog, /<AppDialogMobileFooter>/);
  assert.match(dialog, /useState\(notes \?\? ""\)/);
  assert.match(dialog, /<FieldLabel htmlFor=\{fieldId\}>Match notes<\/FieldLabel>/);
  assert.match(dialog, /aria-describedby=\{descriptionId\}/);
  assert.match(dialog, /name="matchNotes"/);
  assert.equal(
    dialog.match(/\{isSaving \? "Saving\.\.\." : notes \? "Save changes" : "Save"\}/g)?.length,
    2
  );
  assert.doesNotMatch(dialog, /dangerouslySetInnerHTML|ReactMarkdown|markdown/i);
});

test("saving notes is authenticated, owner-scoped, and refreshes the log route", () => {
  const action = source("app/(app)/logs/actions.ts");
  const start = action.indexOf("export async function saveMatchNotesAction");
  const end = action.indexOf("export async function updateLogAction", start);
  const addAction = action.slice(start, end);

  assert.match(addAction, /requireAuth\(\)/);
  assert.match(addAction, /persistOwnerMatchNotes\(supabase/);
  assert.match(addAction, /userId: user\.id/);
  assert.match(addAction, /value: formData\.get\("matchNotes"\)/);
  assert.match(addAction, /revalidatePath\(`\/logs\/\$\{logId\}`\)/);
  assert.doesNotMatch(addAction, /already has match notes/);
});

test("owner-scoped persistence trims notes and updates the exact owned log", async () => {
  const harness = createMatchNotesClient();

  const saved = await persistOwnerMatchNotes(harness.client as never, {
    logId: "log-1",
    userId: "owner-1",
    value: "  Lead with Spiritomb.\nReview turn four.  "
  });

  assert.equal(saved, "Lead with Spiritomb.\nReview turn four.");
  assert.equal(harness.updatedValue, "Lead with Spiritomb.\nReview turn four.");
  assert.deepEqual(harness.operations, [
    { args: ["logs"], method: "from" },
    {
      args: [{ match_notes: "Lead with Spiritomb.\nReview turn four." }],
      method: "update"
    },
    { args: ["user_id", "owner-1"], method: "eq" },
    { args: ["id", "log-1"], method: "eq" },
    { args: ["id,match_notes"], method: "select" }
  ]);
});

test("owner-scoped persistence normalizes empty input to null", async () => {
  const harness = createMatchNotesClient();

  const saved = await persistOwnerMatchNotes(harness.client as never, {
    logId: "log-1",
    userId: "owner-1",
    value: " \n\t "
  });

  assert.equal(saved, null);
  assert.equal(harness.updatedValue, null);
});

test("owner-scoped persistence replaces an existing match note", async () => {
  const harness = createMatchNotesClient({ initialValue: "Original note" });

  const saved = await persistOwnerMatchNotes(harness.client as never, {
    logId: "log-1",
    userId: "owner-1",
    value: "  Updated note after reviewing the match.  "
  });

  assert.equal(saved, "Updated note after reviewing the match.");
  assert.equal(harness.updatedValue, "Updated note after reviewing the match.");
});

test("owner-scoped persistence rejects another owner", async () => {
  const harness = createMatchNotesClient();

  await assert.rejects(
    persistOwnerMatchNotes(harness.client as never, {
      logId: "log-1",
      userId: "owner-2",
      value: "Private note"
    }),
    MatchNotesWriteConflictError
  );
});

test("owner-scoped persistence propagates database failures for action feedback", async () => {
  const databaseError = new Error("database unavailable");
  const harness = createMatchNotesClient({ error: databaseError });

  await assert.rejects(
    persistOwnerMatchNotes(harness.client as never, {
      logId: "log-1",
      userId: "owner-1",
      value: "Private note"
    }),
    databaseError
  );
});

test("the notes dialog refreshes into the saved state and reports failures inline", () => {
  const dialog = source("components/ui/MatchNotesDialog.tsx");

  assert.match(dialog, /await saveMatchNotesAction\(formData\)/);
  assert.match(dialog, /onOpenChange\(false\)/);
  assert.match(dialog, /router\.refresh\(\)/);
  assert.match(dialog, /setSaveError\(error instanceof Error \? error\.message/);
  assert.match(dialog, /<Alert className="mb-4" variant="loss">/);
  assert.match(dialog, /<AlertDescription>\{saveError\}<\/AlertDescription>/);
});

test("the notes dialog explicitly restores focus to its external trigger", () => {
  const button = source("components/ui/LazyMatchNotesButton.tsx");
  const dialog = source("components/ui/MatchNotesDialog.tsx");

  assert.match(button, /const triggerRef = useRef<HTMLButtonElement>\(null\)/);
  assert.match(button, /ref=\{triggerRef\}/);
  assert.match(button, /returnFocusRef=\{triggerRef\}/);
  assert.match(dialog, /onCloseAutoFocus=\{\(event\) =>/);
  assert.match(dialog, /event\.preventDefault\(\)/);
  assert.match(dialog, /returnFocusRef\.current\?\.focus\(\)/);
});

test("the database migration keeps owner RLS intact and enforces normalized nullable notes", () => {
  const migration = source(
    "supabase/migrations/20260724221046_add_owner_match_notes.sql"
  );

  assert.match(migration, /add column if not exists match_notes text/);
  assert.match(migration, /match_notes is null/);
  assert.match(migration, /match_notes = btrim\(match_notes, E' \\t\\n\\r'\)/);
  assert.match(migration, /length\(match_notes\) > 0/);
  assert.doesNotMatch(migration, /policy|grant|revoke|security definer/i);
});
