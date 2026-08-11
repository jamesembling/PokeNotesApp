import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const uiDirectory = join(process.cwd(), "components/ui");

test("dialog action separators are owned by full-width dialog footers", () => {
  const dialogFiles = readdirSync(uiDirectory)
    .filter((fileName) => fileName.endsWith(".tsx"))
    .map((fileName) => ({
      fileName,
      source: readFileSync(join(uiDirectory, fileName), "utf8")
    }))
    .filter(({ source }) => source.includes("<AppDialogContent"));

  for (const { fileName, source } of dialogFiles) {
    assert.doesNotMatch(
      source,
      /<ButtonGroup[^>]*className="[^"]*\bborder-t\b[^"]*"/,
      `${fileName} should not attach a footer separator to a button-width group`
    );
  }

  const sharedDialog = readFileSync(join(uiDirectory, "AppDialog.tsx"), "utf8");
  assert.match(sharedDialog, /AppDialogFooter[\s\S]*border-t border-border/);
  assert.match(sharedDialog, /AppDialogMobileFooter[\s\S]*border-t border-border/);
});

test("battle log edit actions use the full-width desktop footer", () => {
  const editor = readFileSync(join(uiDirectory, "EditLogDialog.tsx"), "utf8");
  const formEnd = editor.lastIndexOf("</form>");
  const footerStart = editor.indexOf("<AppDialogFooter>", formEnd);
  const mobileFooterStart = editor.indexOf("<AppDialogMobileFooter>", footerStart);
  const desktopFooter = editor.slice(footerStart, mobileFooterStart);

  assert.ok(formEnd >= 0, "the battle log edit form should remain present");
  assert.ok(footerStart > formEnd, "the desktop footer should sit outside the scrolling form");
  assert.ok(mobileFooterStart > footerStart, "the mobile footer should remain after the desktop footer");
  assert.match(desktopFooter, /<ButtonGroup className="w-auto">/);
  assert.match(desktopFooter, /<SaveButton/);
});
