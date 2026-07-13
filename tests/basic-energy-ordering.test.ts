import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeDeckListCardNameForLookup,
  prepareDeckListVisualCards
} from "@/lib/deck-lists/basic-energy";
import { sortDeckListCards } from "@/lib/deck-lists/sort";
import type { DeckCard } from "@/types/index";

const ENERGY_CARDS: DeckCard[] = [
  { count: 3, name: "Basic {D} Energy", set: "BUS", number: "168", category: "Energy" },
  { count: 4, name: "Basic {D} Energy", set: "SFA", number: "98", category: "Energy" },
  { count: 2, name: "Basic {D} Energy", set: "MEE", number: "7", category: "Energy" },
  { count: 3, name: "Spiky Energy", set: "JTG", number: "159", category: "Energy" }
];

test("normalizes exported basic Energy names only for metadata lookup", () => {
  assert.equal(normalizeDeckListCardNameForLookup("Basic {D} Energy"), "Darkness Energy");
  assert.equal(normalizeDeckListCardNameForLookup("Basic {L} Energy"), "Lightning Energy");
  assert.equal(normalizeDeckListCardNameForLookup("Basic Metal Energy"), "Metal Energy");
  assert.equal(normalizeDeckListCardNameForLookup("Spiky Energy"), "Spiky Energy");
});

test("existing visuals consolidate alternate basic Energy prints and re-order Energy by count", () => {
  assert.deepEqual(
    prepareDeckListVisualCards(ENERGY_CARDS).map((card) => ({
      count: card.count,
      name: card.name,
      set: card.set
    })),
    [
      { count: 9, name: "Basic {D} Energy", set: "BUS" },
      { count: 3, name: "Spiky Energy", set: "JTG" }
    ]
  );
});

test("the canonical sorter resolves and combines alternate basic Energy prints", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));

    if (url.pathname === "/api/dm/pokedex") {
      return Response.json([]);
    }

    if (url.pathname === "/api/dm/search") {
      const query = url.searchParams.get("q") ?? "";
      const set = query.match(/set:(BUS|SFA|MEE|JTG)/)?.[1] ?? "";

      if (query.startsWith("Darkness Energy")) {
        const numberBySet: Record<string, string> = { BUS: "168", SFA: "98", MEE: "7" };
        return Response.json([
          {
            id: 7,
            set,
            number: numberBySet[set],
            name: "Darkness Energy",
            card_type: "energy"
          }
        ]);
      }

      if (query.startsWith("Spiky Energy")) {
        return Response.json([
          {
            id: 15568,
            set: "JTG",
            number: "159",
            name: "Spiky Energy",
            card_type: "energy"
          }
        ]);
      }

      return Response.json([]);
    }

    if (url.pathname === "/api/dm/versions" && url.searchParams.get("id") === "7") {
      return Response.json([
        { data_id: 7, set: "BUS", number: "168", card_type: "energy", type: "basic" },
        { data_id: 7, set: "SFA", number: "98", card_type: "energy", type: "basic" },
        { data_id: 7, set: "MEE", number: "7", card_type: "energy", type: "basic" }
      ]);
    }

    if (url.pathname === "/api/dm/versions") {
      return Response.json([
        {
          data_id: 15568,
          set: "JTG",
          number: "159",
          card_type: "energy",
          type: "special"
        }
      ]);
    }

    return Response.json([], { status: 404 });
  };

  try {
    assert.deepEqual(
      (await sortDeckListCards(ENERGY_CARDS)).map((card) => ({
        count: card.count,
        name: card.name,
        set: card.set
      })),
      [
        { count: 9, name: "Basic {D} Energy", set: "BUS" },
        { count: 3, name: "Spiky Energy", set: "JTG" }
      ]
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
