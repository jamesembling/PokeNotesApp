import assert from "node:assert/strict";
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
import { sortDeckListCards } from "@/lib/deck-lists/sort";
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

test("local visual sort restores grouped deck ordering for stale stored arrays", async (context) => {
  const sorted = sortDeckListCardsLocally(cards);
  const trainers = [
    { name: "Iono", count: 1, set: "PAL", number: "185", type: "supporter" },
    { name: "Ultra Ball", count: 2, set: "SVI", number: "196", type: "item" },
    { name: "Air Balloon", count: 3, set: "SSH", number: "156", type: "tool" },
    { name: "Festival Grounds", count: 4, set: "TWM", number: "149", type: "stadium" }
  ];
  context.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const selected = trainers.find(
      (card) =>
        (url.searchParams.get("q") || "").startsWith(card.name) ||
        url.searchParams.get("id") === card.name
    );
    return new Response(
      JSON.stringify(
        !selected
          ? []
          : url.pathname.endsWith("/search")
            ? [{ ...selected, id: selected.name, card_type: "trainer" }]
            : [{ ...selected, data_id: selected.name, card_type: "trainer" }]
      )
    );
  });
  const providerSorted = await sortDeckListCards(
    [...trainers].reverse().map(({ type, ...card }) => ({ ...card, category: "Trainer" }))
  );
  assert.deepEqual(
    providerSorted.map((card) => [card.name, card.trainerType]),
    trainers.map((card) => [card.name, card.type]),
    "resolved subtype survives persistence across deliberately conflicting counts"
  );

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
