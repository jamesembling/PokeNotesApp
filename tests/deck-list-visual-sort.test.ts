import assert from "node:assert/strict";
import test from "node:test";
import {
  hasCanonicalDeckListVisualGrouping,
  sortDeckListCardsLocally
} from "@/lib/deck-lists/local-sort";
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
