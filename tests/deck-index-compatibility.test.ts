import assert from "node:assert/strict";
import test from "node:test";
import {
  decksDbTestHooks,
  getDeckIndexSummaries
} from "../lib/db/decks";

test("new deck index RPC retains legacy deck-list sprite derivation fallback", async (t) => {
  const originalCreateClient = decksDbTestHooks.createClient;
  const originalGetDecks = decksDbTestHooks.getDecks;
  const originalGetDeckLogStatsForIndex = decksDbTestHooks.getDeckLogStatsForIndex;
  const rpcCalls: string[] = [];
  let compatibilityLoads = 0;

  decksDbTestHooks.createClient = async () =>
    ({
      async rpc(functionName: string) {
        rpcCalls.push(functionName);
        assert.equal(functionName, "get_deck_index_page_data");

        return {
          data: [
            {
              id: "legacy-deck",
              user_id: "compatibility-user",
              deck_name: "Legacy Charizard",
              archetype_id: "",
              format: "Standard",
              go_preference: "",
              deck_pokemon: [],
              deck_list_count: 1,
              games_played: 3,
              games_won: 2,
              games_lost: 1,
              created_at: "2026-07-01T10:00:00.000Z",
              updated_at: "2026-07-24T10:00:00.000Z"
            }
          ],
          error: null
        };
      }
    }) as never;
  decksDbTestHooks.getDecks = async () => {
    compatibilityLoads += 1;

    return [
      {
        id: "legacy-deck",
        userId: "compatibility-user",
        deckName: "Legacy Charizard",
        archetypeId: "charizard-pidgeot",
        format: "Standard",
        goPreference: "",
        deckPokemon: ["charizard", "pidgeot"],
        deckLists: [
          {
            id: "legacy-list",
            name: "Regional list",
            format: "Standard",
            date: "2026-07-01",
            createdBy: "Trainer",
            notes: "",
            rawList: "",
            parsedCards: [],
            sortedCards: [],
            createdAt: "2026-07-01T10:00:00.000Z",
            updatedAt: "2026-07-01T10:00:00.000Z"
          }
        ],
        createdAt: "2026-07-01T10:00:00.000Z",
        updatedAt: "2026-07-24T10:00:00.000Z"
      }
    ];
  };
  decksDbTestHooks.getDeckLogStatsForIndex = async () => [
    {
      deck_id: "legacy-deck",
      games_played: 3,
      games_won: 2,
      games_lost: 1
    }
  ];

  t.after(() => {
    decksDbTestHooks.createClient = originalCreateClient;
    decksDbTestHooks.getDecks = originalGetDecks;
    decksDbTestHooks.getDeckLogStatsForIndex = originalGetDeckLogStatsForIndex;
  });

  const decks = await getDeckIndexSummaries("compatibility-user");

  assert.deepEqual(rpcCalls, ["get_deck_index_page_data"]);
  assert.equal(compatibilityLoads, 1);
  assert.deepEqual(decks, [
    {
      id: "legacy-deck",
      userId: "compatibility-user",
      deckName: "Legacy Charizard",
      archetypeId: "charizard-pidgeot",
      format: "Standard",
      goPreference: "",
      deckPokemon: ["charizard", "pidgeot"],
      createdAt: "2026-07-01T10:00:00.000Z",
      updatedAt: "2026-07-24T10:00:00.000Z",
      deckListCount: 1,
      gamesPlayed: 3,
      losses: 1,
      winRate: 67,
      wins: 2
    }
  ]);
});
