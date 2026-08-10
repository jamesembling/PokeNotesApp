import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function readDialogSource() {
  return readFileSync(
    join(process.cwd(), "components/ui/DeckLinkedLogsDialog.tsx"),
    "utf8"
  );
}

test("linked-log loading does not cancel itself when loading state starts", () => {
  const source = readDialogSource();
  const effectStart = source.indexOf("  useEffect(() => {");
  const componentReturn = source.indexOf("\n  return (", effectStart);

  assert.notEqual(effectStart, -1);
  assert.notEqual(componentReturn, -1);

  const loadingEffect = source.slice(effectStart, componentReturn);

  assert.match(loadingEffect, /setIsLoading\(true\)/);
  assert.doesNotMatch(loadingEffect, /!isOpen \|\| logs\.length > 0 \|\| isLoading/);
  assert.match(loadingEffect, /\}, \[deckId, isOpen, logs\.length\]\);/);
});
