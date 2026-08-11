import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("the battle-log importer opens without blocking on option data", () => {
  const lazyButton = source("components/ui/LazyImportLogButton.tsx");

  assert.match(lazyButton, /setDialogOpen\(true\);/);
  assert.match(lazyButton, /<DynamicImportLogDialog/);
  assert.doesNotMatch(lazyButton, /\/api\/import-dialog-data/);
  assert.doesNotMatch(lazyButton, /disabled=\{isLoading\}/);
  assert.equal(existsSync(join(process.cwd(), "app/api/import-dialog-data/route.ts")), false);
});

test("importer option data is shared and loaded only when its review controls need it", () => {
  const lazyButton = source("components/ui/LazyImportLogButton.tsx");
  const provider = source("components/ui/ImportDialogDataProvider.tsx");
  const dialog = source("components/ui/ImportLogDialog.tsx");
  const picker = source("components/ui/BattleLogSpritePicker.tsx");
  const sidebar = source("components/ui/Sidebar.tsx");

  assert.match(provider, /pendingUserDecksRef/);
  assert.match(provider, /if \(pendingUserDecksRef\.current\)/);
  assert.match(provider, /\/api\/deck-selection-options/);
  assert.match(dialog, /if \(stage === "review" && sharedUserDecks === null\)/);
  assert.match(dialog, /loadPokemonOptions\(\)/);
  assert.match(dialog, /onSearchIntent=\{loadSpritePickerOptions\}/);
  assert.match(picker, /void onSearchIntent\?\.\(\);/);
  assert.match(lazyButton, /if \(initialUserDecks\?\.length\)/);
  assert.doesNotMatch(lazyButton, /initialUserDecks !== undefined/);
  assert.match(sidebar, /export function Sidebar\(\{ profile, userDecks \}: SidebarProps\)/);
  assert.doesNotMatch(sidebar, /userDecks = \[\]/);
});

test("parse authentication and import reads are deduplicated and parallelized", () => {
  const actions = source("app/(app)/logs/actions.ts");
  const parseAction = actions.slice(
    actions.indexOf("export async function parseLogAction"),
    actions.indexOf("export async function importLogAction")
  );
  const importAction = actions.slice(
    actions.indexOf("export async function importLogAction"),
    actions.indexOf("export async function addMatchNotesAction")
  );

  assert.equal(parseAction.match(/requireAuth\(\)/g)?.length, 1);
  assert.match(parseAction, /buildParsedLogReview\(rawLog, getImportContext\(user, supabase\)\)/);
  assert.match(actions, /const \[catalog, profileResult\] = await Promise\.all/);
  assert.match(importAction, /const \[catalog, deckLinkCandidates\] = await Promise\.all/);
  assert.match(importAction, /getDeckLinkCandidates\(user\.id, supabase\)/);
  assert.match(importAction, /after\(\(\) => \{\s*revalidateDeckAndLogWorkspace\(\);\s*\}\);/);
});

test("successful imports prefetch their detail route before navigation", () => {
  const dialog = source("components/ui/ImportLogDialog.tsx");
  const saveBlock = dialog.slice(
    dialog.indexOf("async function handleSubmit"),
    dialog.indexOf("useEffect(() => {", dialog.indexOf("async function handleSubmit"))
  );

  assert.match(saveBlock, /router\.prefetch\(result\.redirectTo\);/);
  assert.match(saveBlock, /router\.push\(result\.redirectTo\);/);
});
