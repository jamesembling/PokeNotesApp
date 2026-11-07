import "./support/dom";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test, { afterEach } from "node:test";
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { MatchNotesDialogProps } from "@/components/ui/MatchNotesDialog";

const require = createRequire(import.meta.url);
let saveNotes = async (_formData: FormData): Promise<void> => {};
let refreshCount = 0;
const actionsPath = require.resolve("../app/(app)/logs/actions.ts");
require.cache[actionsPath] = {
  id: actionsPath,
  filename: actionsPath,
  loaded: true,
  exports: { saveMatchNotesAction: (formData: FormData) => saveNotes(formData) }
} as NodeJS.Module;
const navigationPath = require.resolve("next/navigation");
require.cache[navigationPath] = {
  id: navigationPath,
  filename: navigationPath,
  loaded: true,
  exports: { useRouter: () => ({ refresh: () => refreshCount++ }) }
} as NodeJS.Module;
const { MatchNotesDialog } =
  require("../components/ui/MatchNotesDialog.tsx") as typeof import("@/components/ui/MatchNotesDialog");

const noteProps: MatchNotesDialogProps = {
  logId: "log-a",
  notes: "Saved note A",
  onOpenChange: () => {},
  open: true,
  returnFocusRef: { current: null }
};

afterEach(() => {
  cleanup();
  refreshCount = 0;
  saveNotes = async () => {};
});

test("Match notes reopen from saved data and keep active edits across same-record refreshes", async () => {
  const changes: boolean[] = [];
  const props = { ...noteProps, onOpenChange: (open: boolean) => changes.push(open) };
  const view = render(createElement(MatchNotesDialog, props));
  const note = screen.getByRole("textbox", { name: "Match notes" }) as HTMLTextAreaElement;
  fireEvent.change(note, { target: { value: "Abandoned draft" } });
  view.rerender(createElement(MatchNotesDialog, { ...props, notes: "Refreshed saved note" }));
  assert.equal(note.value, "Abandoned draft", "a refresh must not overwrite an active draft");
  view.rerender(createElement(MatchNotesDialog, { ...props, open: false }));
  view.rerender(createElement(MatchNotesDialog, { ...props, notes: "Refreshed saved note" }));
  assert.equal(
    (screen.getByRole("textbox", { name: "Match notes" }) as HTMLTextAreaElement).value,
    "Refreshed saved note"
  );
  view.rerender(
    createElement(MatchNotesDialog, { ...props, logId: "log-b", notes: "Saved note B" })
  );
  assert.equal(
    (screen.getByRole("textbox", { name: "Match notes" }) as HTMLTextAreaElement).value,
    "Saved note B"
  );

  let resolveSave!: () => void;
  saveNotes = () =>
    new Promise((resolve) => {
      resolveSave = resolve;
    });
  fireEvent.submit(screen.getByRole("textbox", { name: "Match notes" }).closest("form")!);
  view.rerender(
    createElement(MatchNotesDialog, { ...props, logId: "log-c", notes: "Saved note C" })
  );
  await act(async () => resolveSave());
  assert.deepEqual(changes, [], "a previous record's save must not close the current editor");
  assert.equal(
    (screen.getByRole("textbox", { name: "Match notes" }) as HTMLTextAreaElement).value,
    "Saved note C"
  );
  assert.equal(
    refreshCount,
    1,
    "the previous record's successful save still refreshes server data"
  );
});

test("Match notes keep a pending save in its editor and allow retry after failure", async () => {
  let rejectSave!: (error: Error) => void;
  const submissions: FormData[] = [];
  saveNotes = (data) => {
    submissions.push(data);
    return new Promise((_, reject) => {
      rejectSave = reject;
    });
  };
  const changes: boolean[] = [];
  render(
    createElement(MatchNotesDialog, { ...noteProps, onOpenChange: (open) => changes.push(open) })
  );
  const note = screen.getByRole("textbox", { name: "Match notes" }) as HTMLTextAreaElement;
  fireEvent.change(note, { target: { value: "Retry this note" } });
  const form = note.closest("form")!;
  fireEvent.submit(form);
  fireEvent.submit(form);
  assert.equal(submissions.length, 1, "a repeated submit must not start another write");
  assert.equal(note.disabled, true, "edits during a save would be discarded on success");
  fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  assert.deepEqual(changes, [], "pending saves cannot dismiss their editor");
  await act(async () => rejectSave(new Error("Network unavailable")));
  assert.match(screen.getByRole("alert").textContent ?? "", /Network unavailable/);
  assert.equal(note.value, "Retry this note");
  assert.equal(note.disabled, false);
  saveNotes = async (data) => {
    submissions.push(data);
  };
  fireEvent.submit(form);
  await waitFor(() => assert.deepEqual(changes, [false]));
  assert.equal(submissions[1].get("logId"), "log-a");
  assert.equal(submissions[1].get("matchNotes"), "Retry this note");
  assert.equal(refreshCount, 1);
});
