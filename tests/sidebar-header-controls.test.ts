import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("desktop sidebar controls keep full-size unclipped icons", () => {
  const appShell = source("components/ui/AppShell.tsx");
  const sidebar = source("components/shadcn/sidebar.tsx");
  const themeToggle = source("components/ui/SidebarThemeToggle.tsx");
  const button = source("components/shadcn/button.tsx");

  assert.match(appShell, /<SidebarTrigger size="icon-lg" \/>/);
  assert.match(appShell, /<SidebarThemeToggle tone="page" \/>/);
  assert.match(button, /"icon-lg": "size-9"/);

  assert.match(sidebar, /function SidebarPanelIcon\(\)/);
  assert.match(sidebar, /className="size-5 overflow-visible"/);
  assert.match(sidebar, /viewBox="0 0 24 24"/);
  assert.match(sidebar, /size = "icon-sm"/);
  assert.match(sidebar, /<span className="sr-only">Toggle Sidebar<\/span>/);

  assert.equal(
    themeToggle.match(/className="size-5 overflow-visible"/g)?.length,
    2
  );
  assert.match(themeToggle, /aria-label=\{label\}/);
  assert.match(themeToggle, /size="icon-lg"/);
});
