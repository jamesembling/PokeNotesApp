import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("deck editor desktop actions use the full-width dialog footer", () => {
  const editor = readFileSync(
    join(process.cwd(), "components/ui/DeckEditorDialog.tsx"),
    "utf8"
  );
  const formEnd = editor.lastIndexOf("</form>");
  const footerStart = editor.indexOf("<AppDialogFooter>", formEnd);
  const mobileFooterStart = editor.indexOf("<AppDialogMobileFooter>", footerStart);
  const desktopFooter = editor.slice(footerStart, mobileFooterStart);

  assert.ok(formEnd >= 0, "the editor form should remain present");
  assert.ok(footerStart > formEnd, "the desktop footer should sit outside the scrolling form");
  assert.ok(mobileFooterStart > footerStart, "the mobile footer should remain after the desktop footer");
  assert.match(desktopFooter, /<ButtonGroup className="w-auto flex-row justify-end gap-0">/);
  assert.match(
    desktopFooter,
    /className="whitespace-nowrap text-loss-strong hover:bg-destructive\/10 hover:text-loss-strong"[\s\S]*variant="outline"/
  );
  assert.match(desktopFooter, /Delete Deck/);
  assert.match(desktopFooter, /<SaveButton/);
  assert.doesNotMatch(editor.slice(0, formEnd), /hidden border-t border-border pt-4 sm:ml-auto/);
});
