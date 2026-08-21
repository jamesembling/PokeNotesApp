import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("CI runs the repository design-system audit", () => {
  const workflow = source(".github/workflows/ci.yml");

  assert.match(workflow, /- name: Design system audit\s+run: npm run design:audit/);
});

test("GitHub workflows use pinned Node 24 action releases", () => {
  const ciWorkflow = source(".github/workflows/ci.yml");
  const databaseWorkflow = source(".github/workflows/deploy-production-database.yml");
  const checkoutV7 = /actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7\.0\.1/;
  const setupNodeV7 = /actions\/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7\.0\.0/;

  assert.match(ciWorkflow, checkoutV7);
  assert.match(ciWorkflow, setupNodeV7);
  assert.match(databaseWorkflow, checkoutV7);
  assert.doesNotMatch(`${ciWorkflow}\n${databaseWorkflow}`, /actions\/(?:checkout|setup-node)@v4|# v4/);
});

test("error boundaries describe the reporting capability truthfully", () => {
  const appError = source("app/error.tsx");
  const globalError = source("app/global-error.tsx");

  for (const errorBoundary of [appError, globalError]) {
    assert.match(errorBoundary, /report what you were doing/i);
    assert.match(errorBoundary, /error reference below if one is shown/i);
    assert.doesNotMatch(errorBoundary, /we(?:’|')ve logged|can trace it|track it down/i);
  }
});

test("the shared sprite picker exposes one named and described group", () => {
  const picker = source("components/ui/BattleLogSpritePicker.tsx");

  assert.match(picker, /const groupDescriptionId = useId\(\)/);
  assert.match(picker, /const groupLabelId = useId\(\)/);
  assert.match(picker, /aria-describedby=\{groupDescriptionId\}/);
  assert.match(picker, /aria-labelledby=\{groupLabelId\}/);
  assert.match(picker, /role="group"/);
  assert.match(picker, /id=\{groupLabelId\}/);
  assert.match(picker, /id=\{groupDescriptionId\}/);
});

test("reviewed detail and profile routes expose a logical heading outline", () => {
  const logDetailPage = source("app/(app)/logs/[id]/page.tsx");
  const matchSummary = source("components/ui/MatchSummary.tsx");
  const profilePage = source("app/(app)/profile/page.tsx");
  const sectionHeader = source("components/ui/SectionHeader.tsx");
  const deckDetailPage = source("app/(app)/decks/[id]/page.tsx");
  const deckStrategyEditor = source("components/ui/InlineDeckStrategyEditor.tsx");
  const relatedLogs = source("components/ui/DeckRelatedLogsSection.tsx");

  assert.match(logDetailPage, /<PageTitle className="sr-only">Battle Log versus \{opponentDeckName\}<\/PageTitle>/);
  assert.match(matchSummary, /<section aria-labelledby="match-summary-heading"/);
  assert.match(matchSummary, /<SectionTitle id="match-summary-heading" size="lg">/);
  assert.equal(profilePage.match(/<CardTitle as="h2">/g)?.length, 3);
  assert.match(sectionHeader, /eyebrowAs\?: "p" \| "h2" \| "h3"/);
  assert.equal(deckDetailPage.match(/eyebrowAs="h2"/g)?.length, 2);
  assert.match(deckStrategyEditor, /eyebrowAs="h2"/);
  assert.equal(relatedLogs.match(/eyebrowAs="h2"/g)?.length, 2);
});
