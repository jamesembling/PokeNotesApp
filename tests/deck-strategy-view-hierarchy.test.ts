import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("deck strategy list and tile views share the page hierarchy", () => {
  const collection = readFileSync(
    join(process.cwd(), "components/ui/DeckStrategyCollection.tsx"),
    "utf8"
  );
  const listBranchStart = collection.indexOf('{viewMode === "list" ? (');
  const tileBranchStart = collection.indexOf(
    '<div className="deck-strategy-ledger-grid grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4">'
  );

  assert.ok(listBranchStart >= 0, "the List view branch should remain explicit");
  assert.ok(tileBranchStart > listBranchStart, "the Tiles view branch should remain explicit");

  const listBranch = collection.slice(listBranchStart, tileBranchStart);
  const tileBranch = collection.slice(tileBranchStart);

  assert.doesNotMatch(collection, /Deck library|Sortable list|deck-strategy-list-heading/);
  assert.doesNotMatch(collection, /SectionHeader/);

  assert.match(
    listBranch,
    /<div className="overflow-hidden rounded-lg border border-border bg-background">/
  );
  assert.match(listBranch, /label="Deck"/);
  assert.match(listBranch, /label="Win rate"/);
  assert.match(listBranch, /label="Record"/);
  assert.match(listBranch, /label="Decklists"/);
  assert.match(listBranch, /label="Updated"/);
  assert.match(listBranch, /view="list"/);

  assert.match(tileBranch, /view="tile"/);
  assert.doesNotMatch(tileBranch, /SortHeaderButton|view="list"/);
});
