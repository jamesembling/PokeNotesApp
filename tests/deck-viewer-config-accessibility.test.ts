import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function readSource(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("all deck-list image qualities are allow-listed in Next.js configuration", () => {
  const config = readSource("next.config.js");
  const visualGrid = readSource("components/ui/DeckListVisualGrid.tsx");

  assert.match(config, /qualities:\s*\[75, 80, 95\]/);
  assert.match(visualGrid, /standard:\s*80/);
  assert.match(visualGrid, /featured:\s*95/);
});

test("deck-list viewer supplies a programmatic dialog description", () => {
  const dialog = readSource("components/ui/DeckListViewDialog.tsx");

  assert.match(dialog, /DialogDescription/);
  assert.match(dialog, /<DialogDescription className="sr-only">/);
  assert.match(dialog, /Each card image opens its card page in a new tab\./);
});
