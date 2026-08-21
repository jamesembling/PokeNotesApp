import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  hasCanonicalDeckListVisualGrouping,
  sortDeckListCardsLocally
} from "@/lib/deck-lists/local-sort";
import { getReadSortedDeckCards } from "@/lib/deck-lists/read-sort";
import {
  CANONICAL_DECK_LIST_SORT_VERSION,
  shouldRebuildDeckListVisualSort
} from "@/lib/deck-lists/version";
import type { DeckCard } from "@/types/index";

const cards: DeckCard[] = [
  {
    count: 4,
    name: "Psychic Energy",
    set: "SVI",
    number: "5",
    category: "energy"
  },
  {
    count: 4,
    name: "Dreepy",
    set: "TWM",
    number: "128",
    category: "pokemon"
  },
  {
    count: 4,
    name: "Lillie's Determination",
    set: "JTG",
    number: "155",
    category: "trainer",
    trainerType: "supporter"
  },
  {
    count: 3,
    name: "Buddy-Buddy Poffin",
    set: "TEF",
    number: "144",
    category: "trainer",
    trainerType: "item"
  },
  {
    count: 3,
    name: "Dragapult ex",
    set: "TWM",
    number: "130",
    category: "pokemon",
    stage: "Stage 2"
  }
];

test("legacy mixed-category stored deck visuals are detected as non-canonical", () => {
  assert.equal(hasCanonicalDeckListVisualGrouping(cards), false);
});

test("local visual sort restores grouped deck ordering for stale stored arrays", () => {
  const sorted = sortDeckListCardsLocally(cards);

  assert.deepEqual(
    sorted.map((card) => `${card.category}:${card.name}`),
    [
      "pokemon:Dreepy",
      "pokemon:Dragapult ex",
      "trainer:Lillie's Determination",
      "trainer:Buddy-Buddy Poffin",
      "energy:Psychic Energy"
    ]
  );
});

test("legacy grouped deck visuals still rebuild when they predate the canonical sort version", () => {
  const groupedButLegacy: DeckCard[] = [
    {
      count: 3,
      name: "Dragapult ex",
      set: "TWM",
      number: "130",
      category: "pokemon",
      stage: "Stage 2"
    },
    {
      count: 4,
      name: "Dreepy",
      set: "TWM",
      number: "128",
      category: "pokemon"
    },
    {
      count: 3,
      name: "Buddy-Buddy Poffin",
      set: "TEF",
      number: "144",
      category: "trainer",
      trainerType: "item"
    },
    {
      count: 4,
      name: "Lillie's Determination",
      set: "JTG",
      number: "155",
      category: "trainer",
      trainerType: "supporter"
    },
    {
      count: 4,
      name: "Psychic Energy",
      set: "SVI",
      number: "5",
      category: "energy"
    }
  ];

  assert.equal(hasCanonicalDeckListVisualGrouping(groupedButLegacy), false);
  assert.equal(
    shouldRebuildDeckListVisualSort({
      parsedCards: groupedButLegacy
    }),
    true
  );
  assert.equal(
    shouldRebuildDeckListVisualSort({
      parsedCards: groupedButLegacy,
      sortedCardsVersion: CANONICAL_DECK_LIST_SORT_VERSION
    }),
    false
  );
});

test("current stored deck visuals are returned without local re-sorting", () => {
  const currentStoredOrder: DeckCard[] = [
    {
      count: 2,
      name: "Rare Candy",
      set: "PAF",
      number: "89",
      category: "trainer",
      trainerType: "item"
    },
    {
      count: 4,
      name: "Buddy-Buddy Poffin",
      set: "TEF",
      number: "144",
      category: "trainer",
      trainerType: "item"
    },
    {
      count: 1,
      name: "Counter Catcher",
      set: "PAR",
      number: "160",
      category: "trainer",
      trainerType: "item"
    }
  ];

  const resolved = getReadSortedDeckCards({
    parsedCards: [...currentStoredOrder].reverse(),
    sortedCards: currentStoredOrder,
    sortedCardsVersion: CANONICAL_DECK_LIST_SORT_VERSION
  });

  assert.deepEqual(
    resolved.map((card) => `${card.count} ${card.name}`),
    ["2 Rare Candy", "4 Buddy-Buddy Poffin", "1 Counter Catcher"]
  );
});

test("legacy missing deck visuals use the deterministic local fallback", () => {
  const resolved = getReadSortedDeckCards({
    parsedCards: cards,
    sortedCards: [],
    sortedCardsVersion: undefined
  });

  assert.deepEqual(
    resolved.map((card) => `${card.category}:${card.name}`),
    [
      "pokemon:Dreepy",
      "pokemon:Dragapult ex",
      "trainer:Lillie's Determination",
      "trainer:Buddy-Buddy Poffin",
      "energy:Psychic Energy"
    ]
  );
});

test("deck list read paths do not call the external canonical sorter during render", () => {
  const readPathFiles = [
    "lib/db/decks.ts",
    "app/(app)/tournaments/[id]/page.tsx",
    "components/ui/SharedLogPage.tsx",
    "app/shared/[token]/page.tsx",
    "app/s/[token]/page.tsx"
  ];

  for (const filePath of readPathFiles) {
    const source = readFileSync(join(process.cwd(), filePath), "utf8");

    assert.equal(
      source.includes("@/lib/deck-lists/sort"),
      false,
      `${filePath} must not import the external deck-list sorter`
    );
    assert.equal(
      /\bsortDeckListCards\s*\(/.test(source),
      false,
      `${filePath} must not call sortDeckListCards during reads`
    );
  }
});

test("tournament detail deck visuals use the hydrated deck-list read path", () => {
  const source = readFileSync(
    join(process.cwd(), "app/(app)/tournaments/[id]/page.tsx"),
    "utf8"
  );

  assert.equal(source.includes("getDeckListById"), true);
  assert.equal(source.includes("sortedCards={resolvedTournamentDeckList?.sortedCards ?? []}"), true);
});

test("deck and logs pages do not use client hydration stat patches", () => {
  const files = [
    "app/(app)/decks/page.tsx",
    "components/ui/DeckStrategyCollection.tsx",
    "app/(app)/logs/page.tsx",
    "components/ui/LogsWorkspaceClient.tsx"
  ];

  for (const filePath of files) {
    const source = readFileSync(join(process.cwd(), filePath), "utf8");

    assert.equal(source.includes("/api/deck-index-stats"), false, `${filePath} must not fetch deck stats after hydration`);
    assert.equal(source.includes("/api/logs-page-data"), false, `${filePath} must not fetch log page data after hydration`);
    assert.equal(source.includes("/api/log-summary-stats"), false, `${filePath} must not fetch log summary stats after hydration`);
  }
});

test("shared log page does not call live Limitless action tag resolution during render", () => {
  const source = readFileSync(join(process.cwd(), "components/ui/SharedLogPage.tsx"), "utf8");
  const actionTagsSource = readFileSync(join(process.cwd(), "lib/battle-log/action-tags.ts"), "utf8");

  assert.equal(
    source.includes("limitlesstcg.com") || actionTagsSource.includes("limitlesstcg.com"),
    false,
    "shared rendering must not rely on live Limitless-backed action tag resolution"
  );
});
