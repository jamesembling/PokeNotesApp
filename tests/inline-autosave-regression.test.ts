import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function readSource(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("inline editors route blur and bounded change saves through the coalescing queue", () => {
  const strategy = readSource("components/ui/InlineDeckStrategyEditor.tsx");
  const plan = readSource("components/ui/InlineDeckMatchupEditor.tsx");
  const header = readSource("components/ui/InlineDeckMatchupHeaderControls.tsx");

  for (const source of [strategy, plan, header]) {
    assert.match(source, /useCoalescedAutosave\(/);
    assert.doesNotMatch(source, /startTransition\(async/);
  }
  assert.equal(
    strategy.match(/onBlur=\{\(\) => saveStrategy\(strategyRef\.current\)\}/g)?.length,
    4
  );
  assert.equal(
    plan.match(/onBlur=\{\(\) => saveMatchup\(matchupStateRef\.current\)\}/g)?.length,
    3
  );
  assert.match(strategy, /scheduleSave\(nextState\)/);
  assert.equal(plan.match(/scheduleSave\(nextState\)/g)?.length, 3);
});

test("the autosave hook flushes focused text when its route unmounts", () => {
  const hook = readSource("components/hooks/useCoalescedAutosave.ts");

  assert.match(hook, /debounceMs = 500/);
  assert.match(hook, /maxWaitMs = 2000/);
  assert.match(
    hook,
    /return \(\) => \{[\s\S]*?mountedRef\.current = false;[\s\S]*?schedulerRef\.current\?\.flush\(\)/
  );
});

test("inline matchup surfaces submit only the fields they own", () => {
  const plan = readSource("components/ui/InlineDeckMatchupEditor.tsx");
  const header = readSource("components/ui/InlineDeckMatchupHeaderControls.tsx");

  assert.match(plan, /updateDeckMatchupPlanAction/);
  assert.doesNotMatch(plan, /formData\.set\("format"/);
  assert.doesNotMatch(plan, /formData\.set\("goPreference"/);
  assert.match(header, /updateDeckMatchupHeaderAction/);
  assert.doesNotMatch(header, /formData\.set\("idealBench"/);
  assert.doesNotMatch(header, /formData\.set\("matchupPlan"/);
});

test("same-record server refreshes do not replace newer local editor text", () => {
  const strategy = readSource("components/ui/InlineDeckStrategyEditor.tsx");
  const plan = readSource("components/ui/InlineDeckMatchupEditor.tsx");

  assert.match(strategy, /if \(deckIdRef\.current === deck\.id\) \{[\s\S]*?return;/);
  assert.match(plan, /if \(recordKeyRef\.current === nextRecordKey\) \{[\s\S]*?return;/);
});
