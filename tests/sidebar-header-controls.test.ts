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

  const panelIconStart = sidebar.indexOf("function SidebarPanelIcon()");
  const triggerStart = sidebar.indexOf("function SidebarTrigger(", panelIconStart);
  const railStart = sidebar.indexOf("function SidebarRail(", triggerStart);
  assert.ok(panelIconStart >= 0 && triggerStart > panelIconStart && railStart > triggerStart);

  const panelIcon = sidebar.slice(panelIconStart, triggerStart);
  const trigger = sidebar.slice(triggerStart, railStart);

  assert.match(panelIcon, /className="size-5 overflow-visible"/);
  assert.match(panelIcon, /viewBox="0 0 24 24"/);
  assert.match(trigger, /size = "icon-sm"/);
  assert.match(trigger, /\{children \?\? <SidebarPanelIcon \/>\}/);
  assert.match(trigger, /<span className="sr-only">Toggle Sidebar<\/span>/);

  assert.match(themeToggle, /<SunIcon className="size-5 overflow-visible" \/>/);
  assert.match(themeToggle, /<MoonIcon className="size-5 overflow-visible" \/>/);
  assert.match(themeToggle, /aria-label=\{label\}/);
  assert.match(themeToggle, /size="icon-lg"/);
});
