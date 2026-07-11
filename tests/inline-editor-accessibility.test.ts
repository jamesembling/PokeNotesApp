import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function readSource(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function assertLabeledTextareas(source: string, fieldIds: string[]) {
  const fieldBlocks = source.match(/<Field(?:\s[^>]*)?>[\s\S]*?<\/Field>/g) ?? [];

  assert.equal((source.match(/<Textarea\b/g) ?? []).length, fieldIds.length);
  assert.equal(fieldBlocks.length, fieldIds.length);

  for (const fieldId of fieldIds) {
    assert.ok(source.includes(`const ${fieldId} = useId();`));
    assert.ok(
      fieldBlocks.some(
        (fieldBlock) =>
          fieldBlock.includes(`htmlFor={${fieldId}}`) &&
          fieldBlock.includes(`id={${fieldId}}`)
      )
    );
  }
}

test("inline deck strategy fields have stable programmatic labels", () => {
  const source = readSource("components/ui/InlineDeckStrategyEditor.tsx");

  assertLabeledTextareas(source, [
    "coreStrategyId",
    "setupGoalsId",
    "resourcePlanId",
    "generalNotesId"
  ]);
});

test("inline deck matchup fields have stable programmatic labels", () => {
  const source = readSource("components/ui/InlineDeckMatchupEditor.tsx");

  assertLabeledTextareas(source, [
    "idealBenchId",
    "techsNeededId",
    "matchupPlanId"
  ]);
});

test("inline editor save feedback uses polite status and assertive error regions", () => {
  const editorSources = [
    readSource("components/ui/InlineDeckStrategyEditor.tsx"),
    readSource("components/ui/InlineDeckMatchupEditor.tsx")
  ];

  for (const source of editorSources) {
    assert.ok(source.includes('aria-live={saveStatus === "error" ? undefined : "polite"}'));
    assert.ok(source.includes('role={saveStatus === "error" ? undefined : "status"}'));
    assert.ok(source.includes('aria-hidden={saveStatus === "error" ? true : undefined}'));
    assert.match(source, /<Alert variant="loss">/);
  }
});

test("admin role updates announce routine progress and errors without visual churn", () => {
  const source = readSource("components/ui/AdminRoleControls.tsx");
  const usersTable = readSource("components/ui/AdminUsersTable.tsx");

  assert.ok(source.includes('aria-live="polite"'));
  assert.ok(source.includes('role="status"'));
  assert.ok(source.includes("Updating admin role..."));
  assert.ok(source.includes('aria-live="assertive"'));
  assert.ok(source.includes('role="alert"'));
  assert.ok(source.includes("aria-describedby={feedback ? feedbackId : undefined}"));
  assert.ok(source.includes('aria-label={`Admin role for ${userLabel}`}'));
  assert.equal(
    usersTable.match(/userLabel=\{user\.displayName \|\| user\.email\}/g)?.length,
    2
  );
});
