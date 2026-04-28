import assert from "node:assert/strict";
import test from "node:test";
import {
  getArchetypeMatchupStats,
  getAllLogsByDeck,
  getDeckLogSnapshots,
  getDeckStatsForIndex,
  getLatestLogsForDeck,
  getLogById,
  getLogDetailSummaryById,
  getLogStatsOverview,
  getLogsWindow,
  logsDbTestHooks
} from "@/lib/db/logs";
import type { DeckSummary, Result } from "@/types/index";

type QueryOp = {
  method: string;
  args: unknown[];
};

type QueryContext = {
  table: string;
  operations: QueryOp[];
};

type QueryResult = {
  data: unknown;
  error: unknown;
};

type RpcResult = {
  data: unknown;
  error: unknown;
};

type QueryChain = {
  select(value: string): QueryChain;
  eq(...args: unknown[]): QueryChain;
  in(...args: unknown[]): QueryChain;
  is(...args: unknown[]): QueryChain;
  gte(...args: unknown[]): QueryChain;
  lte(...args: unknown[]): QueryChain;
  lt(...args: unknown[]): QueryChain;
  or(...args: unknown[]): QueryChain;
  order(...args: unknown[]): QueryChain;
  limit(...args: unknown[]): QueryChain;
  maybeSingle(): Promise<QueryResult>;
  then(
    onFulfilled?: ((value: QueryResult) => unknown) | null,
    onRejected?: ((reason: unknown) => unknown) | null
  ): Promise<unknown>;
};

function createFakeSupabaseClient(
  resolver: (ctx: QueryContext) => QueryResult,
  rpcResolver?: (fnName: string) => RpcResult
) {
  const queries: QueryContext[] = [];
  const rpcCalls: string[] = [];

  const makeChain = (ctx: QueryContext) => {
    const chain: QueryChain = {
      select(value: string) {
        ctx.operations.push({ method: "select", args: [value] });
        return chain;
      },
      eq(...args: unknown[]) {
        ctx.operations.push({ method: "eq", args });
        return chain;
      },
      in(...args: unknown[]) {
        ctx.operations.push({ method: "in", args });
        return chain;
      },
      is(...args: unknown[]) {
        ctx.operations.push({ method: "is", args });
        return chain;
      },
      gte(...args: unknown[]) {
        ctx.operations.push({ method: "gte", args });
        return chain;
      },
      lte(...args: unknown[]) {
        ctx.operations.push({ method: "lte", args });
        return chain;
      },
      lt(...args: unknown[]) {
        ctx.operations.push({ method: "lt", args });
        return chain;
      },
      or(...args: unknown[]) {
        ctx.operations.push({ method: "or", args });
        return chain;
      },
      order(...args: unknown[]) {
        ctx.operations.push({ method: "order", args });
        return chain;
      },
      limit(...args: unknown[]) {
        ctx.operations.push({ method: "limit", args });
        return chain;
      },
      maybeSingle() {
        return Promise.resolve(resolver(ctx));
      },
      then(onFulfilled, onRejected) {
        return Promise.resolve(resolver(ctx)).then(onFulfilled, onRejected);
      }
    };

    return chain;
  };

  return {
    client: {
      rpc(fnName: string) {
        rpcCalls.push(fnName);
        if (!rpcResolver) {
          return Promise.resolve({
            data: null,
            error: new Error(`Unexpected rpc call: ${fnName}`)
          });
        }
        return Promise.resolve(rpcResolver(fnName));
      },
      from(table: string) {
        const ctx: QueryContext = {
          table,
          operations: []
        };
        queries.push(ctx);
        return makeChain(ctx);
      }
    },
    queries,
    rpcCalls
  };
}

function buildDeckSummary(id: string): DeckSummary {
  return {
    id,
    userId: "user-1",
    deckName: `Deck ${id}`,
    archetypeId: `arch-${id}`,
    format: "SVI-TEF",
    goPreference: "",
    deckPokemon: ["dragapult"],
    deckLists: [],
    createdAt: "2026-04-15T10:00:00.000Z",
    updatedAt: "2026-04-15T10:00:00.000Z"
  };
}

function buildLogRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "log-1",
    user_id: "user-1",
    date: "2026-04-15",
    result: "Win" as Result,
    format: "SVI-TEF",
    go_order: "First" as const,
    self_player_name: "Self",
    self_deck_name: "Dragapult ex",
    self_deck_slug: "dragapult-ex",
    self_deck_sprites: "dragapult",
    opponent_player_name: "Opponent",
    opponent_deck_name: "Gardevoir ex",
    opponent_deck_slug: "gardevoir-ex",
    opponent_deck_sprites: "gardevoir",
    total_turns: 7,
    coin_toss_won: true,
    self_prizes_taken: 6,
    opponent_prizes_taken: 4,
    self_attack_damage: 240,
    opponent_attack_damage: 160,
    self_mulligans: 0,
    opponent_mulligans: 1,
    linked_deck_id: "deck-b",
    linked_deck_list_id: null,
    reason: "Prizes",
    sections: [],
    imported_at: "2026-04-15T10:00:00.000Z",
    created_at: "2026-04-15T10:00:00.000Z",
    updated_at: "2026-04-15T10:00:00.000Z",
    ...overrides
  };
}

test("getLogById falls back to an empty raw log when the stored value is missing", async (t) => {
  const originalCreateClient = logsDbTestHooks.createClient;
  const { client } = createFakeSupabaseClient(() => ({
    data: buildLogRow({ raw_log: undefined }),
    error: null
  }));

  logsDbTestHooks.createClient = async () => client as never;
  t.after(() => {
    logsDbTestHooks.createClient = originalCreateClient;
  });

  const log = await getLogById("user-1", "log-1");

  assert.equal(log?.rawLog, "");
});

test("getLogDetailSummaryById reads only summary columns for server-rendered detail", async (t) => {
  const originalCreateClient = logsDbTestHooks.createClient;
  const { client, queries } = createFakeSupabaseClient(() => ({
    data: buildLogRow({
      coin_toss_won: true,
      opponent_deck_slug: "gardevoir-ex",
      opponent_mulligans: 1,
      opponent_prizes_taken: 4,
      reason: "Prizes",
      self_deck_slug: "dragapult-ex",
      self_mulligans: 0,
      self_prizes_taken: 6
    }),
    error: null
  }));

  logsDbTestHooks.createClient = async () => client as never;
  t.after(() => {
    logsDbTestHooks.createClient = originalCreateClient;
  });

  const log = await getLogDetailSummaryById("user-1", "log-1");
  const select = String(queries[0]?.operations.find((op) => op.method === "select")?.args[0] ?? "");

  assert.equal(log?.id, "log-1");
  assert.equal(log?.rawLog, "");
  assert.deepEqual(log?.sections, []);
  assert.doesNotMatch(select, /\braw_log\b/);
  assert.doesNotMatch(select, /\bsections\b/);
});

test("getLogsWindow limits the initial window and orders by stable keyset columns", async (t) => {
  const originalCreateClient = logsDbTestHooks.createClient;
  const { client, queries } = createFakeSupabaseClient(() => ({
    data: [
      buildLogRow({ id: "log-c", date: "2026-04-26", imported_at: "2026-04-26T10:00:00.000Z" }),
      buildLogRow({ id: "log-b", date: "2026-04-26", imported_at: "2026-04-26T09:00:00.000Z" }),
      buildLogRow({ id: "log-a", date: "2026-04-25", imported_at: "2026-04-25T09:00:00.000Z" })
    ],
    error: null
  }));

  logsDbTestHooks.createClient = async () => client as never;
  t.after(() => {
    logsDbTestHooks.createClient = originalCreateClient;
  });

  const window = await getLogsWindow("user-1", { limit: 2 });

  assert.deepEqual(window.logs.map((log) => log.id), ["log-c", "log-b"]);
  assert.equal(window.hasMore, true);
  assert.ok(window.nextWindowEndDate);
  assert.deepEqual(
    queries[0]?.operations.filter((op) => op.method === "order").map((op) => op.args[0]),
    ["date", "imported_at", "id"]
  );
  assert.deepEqual(queries[0]?.operations.find((op) => op.method === "limit")?.args, [3]);
  assert.equal(queries[0]?.operations.some((op) => op.method === "gte" || op.method === "lte"), false);
});

test("getLogsWindow uses the full keyset cursor across same-date logs", async (t) => {
  const originalCreateClient = logsDbTestHooks.createClient;
  const { client, queries } = createFakeSupabaseClient((ctx) => {
    const hasCursor = ctx.operations.some((op) => op.method === "or");

    return {
      data: hasCursor
        ? [buildLogRow({ id: "log-a", date: "2026-04-26", imported_at: "2026-04-26T08:00:00.000Z" })]
        : [
            buildLogRow({ id: "log-c", date: "2026-04-26", imported_at: "2026-04-26T10:00:00.000Z" }),
            buildLogRow({ id: "log-b", date: "2026-04-26", imported_at: "2026-04-26T09:00:00.000Z" })
          ],
      error: null
    };
  });

  logsDbTestHooks.createClient = async () => client as never;
  t.after(() => {
    logsDbTestHooks.createClient = originalCreateClient;
  });

  const firstPage = await getLogsWindow("user-1", { limit: 1 });
  const secondPage = await getLogsWindow("user-1", {
    cursor: firstPage.nextWindowEndDate,
    limit: 1
  });
  const cursorFilter = String(queries[1]?.operations.find((op) => op.method === "or")?.args[0] ?? "");

  assert.deepEqual(firstPage.logs.map((log) => log.id), ["log-c"]);
  assert.deepEqual(secondPage.logs.map((log) => log.id), ["log-a"]);
  assert.match(cursorFilter, /date\.eq\.2026-04-26/);
  assert.match(cursorFilter, /imported_at\.eq\.2026-04-26T10:00:00\.000Z/);
  assert.match(cursorFilter, /id\.lt\.log-c/);
});

test("getLogStatsOverview prefers the RPC rollup path when it succeeds", async (t) => {
  const originalCreateClient = logsDbTestHooks.createClient;
  const { client, queries, rpcCalls } = createFakeSupabaseClient(
    () => {
      throw new Error("Fallback query should not run when RPC succeeds.");
    },
    (fnName) => {
      assert.equal(fnName, "get_log_stats_overview");
      return {
        data: [
          {
            games_played: 12,
            games_won: 7,
            games_lost: 5,
            attack_damage: 1820,
            opponent_attack_damage: 1660,
            coin_flips_won: 8,
            mulligans_taken: 3,
            prizes_taken: 29,
            tracked_damage: 3480,
            tracked_prizes: 54
          }
        ],
        error: null
      };
    }
  );

  logsDbTestHooks.createClient = async () => client as never;
  t.after(() => {
    logsDbTestHooks.createClient = originalCreateClient;
  });

  const overview = await getLogStatsOverview("user-1");

  assert.deepEqual(overview, {
    gamesPlayed: 12,
    gamesWon: 7,
    gamesLost: 5,
    attackDamage: 1820,
    opponentAttackDamage: 1660,
    coinFlipsWon: 8,
    mulligansTaken: 3,
    prizesTaken: 29,
    trackedDamage: 3480,
    trackedPrizes: 54
  });
  assert.deepEqual(rpcCalls, ["get_log_stats_overview"]);
  assert.equal(queries.length, 0);
});

test("getLogStatsOverview falls back to the user_log_stats read model if the RPC errors", async (t) => {
  const originalCreateClient = logsDbTestHooks.createClient;
  const { client, queries, rpcCalls } = createFakeSupabaseClient(
    () => ({
      data: {
        games_played: 12,
        games_won: 7,
        games_lost: 5,
        attack_damage: 1820,
        opponent_attack_damage: 1660,
        coin_flips_won: 8,
        mulligans_taken: 3,
        prizes_taken: 29,
        tracked_damage: 3480,
        tracked_prizes: 54
      },
      error: null
    }),
    () => ({
      data: null,
      error: new Error("rpc failed")
    })
  );

  logsDbTestHooks.createClient = async () => client as never;
  t.after(() => {
    logsDbTestHooks.createClient = originalCreateClient;
  });

  const overview = await getLogStatsOverview("user-1");

  assert.deepEqual(overview, {
    gamesPlayed: 12,
    gamesWon: 7,
    gamesLost: 5,
    attackDamage: 1820,
    opponentAttackDamage: 1660,
    coinFlipsWon: 8,
    mulligansTaken: 3,
    prizesTaken: 29,
    trackedDamage: 3480,
    trackedPrizes: 54
  });
  assert.deepEqual(rpcCalls, ["get_log_stats_overview"]);
  assert.equal(queries.length, 1);
  assert.deepEqual(queries[0]?.table, "user_log_stats");
});

test("getArchetypeMatchupStats reads the opponent archetype read model", async (t) => {
  const originalCreateClient = logsDbTestHooks.createClient;
  const { client, queries } = createFakeSupabaseClient(() => ({
    data: [
      {
        matchup_key: "gardevoir",
        opponent_deck_name: "Gardevoir ex",
        opponent_deck_sprites: "gardevoir",
        source_deck_slugs: "gardevoir-ex,gardevoir",
        games_played: 4,
        games_won: 3,
        games_lost: 1,
        last_played_date: "2026-04-28"
      }
    ],
    error: null
  }));

  logsDbTestHooks.createClient = async () => client as never;
  t.after(() => {
    logsDbTestHooks.createClient = originalCreateClient;
  });

  const stats = await getArchetypeMatchupStats("user-1");

  assert.deepEqual(stats, [
    {
      matchupKey: "gardevoir",
      opponentDeckName: "Gardevoir ex",
      opponentDeckSprites: ["gardevoir"],
      sourceDeckSlugs: ["gardevoir-ex", "gardevoir"],
      gamesPlayed: 4,
      gamesWon: 3,
      gamesLost: 1,
      lastPlayedDate: "2026-04-28",
      winRate: 75
    }
  ]);
  assert.equal(queries.length, 1);
  assert.equal(queries[0]?.table, "user_archetype_matchup_stats");
  assert.deepEqual(
    queries[0]?.operations.filter((op) => op.method === "order").map((op) => op.args[0]),
    ["games_played", "games_won", "opponent_deck_name"]
  );
  assert.equal(
    queries[0]?.operations.some((op) => op.method === "select" && String(op.args[0]).includes("raw_log")),
    false
  );
});

test("getAllLogsByDeck keeps the overview query grouped into one explicit and one unlinked fetch", async (t) => {
  const originalCreateClient = logsDbTestHooks.createClient;
  const decks = [buildDeckSummary("deck-a"), buildDeckSummary("deck-b"), buildDeckSummary("deck-c")];
  const { client, queries } = createFakeSupabaseClient((ctx) => {
    const hasExplicitDeckFilter = ctx.operations.some(
      (op) => op.method === "in" && op.args[0] === "linked_deck_id"
    );
    const hasUnlinkedFilter = ctx.operations.some(
      (op) => op.method === "is" && op.args[0] === "linked_deck_id"
    );

    if (hasExplicitDeckFilter) {
      return {
        data: [buildLogRow({ id: "deck-b-log", linked_deck_id: "deck-b" })],
        error: null
      };
    }

    if (hasUnlinkedFilter) {
      return {
        data: [],
        error: null
      };
    }

    throw new Error(`Unexpected query: ${JSON.stringify(ctx.operations)}`);
  });

  logsDbTestHooks.createClient = async () => client as never;
  t.after(() => {
    logsDbTestHooks.createClient = originalCreateClient;
  });

  const logsByDeck = await getAllLogsByDeck("user-1", decks);

  assert.equal(queries.length, 2);
  assert.deepEqual(
    queries.map((query) => query.table),
    ["logs", "logs"]
  );
  assert.deepEqual(
    queries
      .find((query) => query.operations.some((op) => op.method === "in"))
      ?.operations.find((op) => op.method === "in")?.args,
    ["linked_deck_id", ["deck-a", "deck-b", "deck-c"]]
  );
  assert.deepEqual(
    queries
      .find((query) => query.operations.some((op) => op.method === "is"))
      ?.operations.find((op) => op.method === "is")?.args,
    ["linked_deck_id", null]
  );
  assert.deepEqual(
    (logsByDeck.get("deck-b") ?? []).map((log) => log.id),
    ["deck-b-log"]
  );
});

test("getDeckLogSnapshots preserves grouped stats parity without extra unresolved fetches", async (t) => {
  const originalCreateClient = logsDbTestHooks.createClient;
  const decks = [buildDeckSummary("deck-a"), buildDeckSummary("deck-b"), buildDeckSummary("deck-c")];
  const { client, queries } = createFakeSupabaseClient((ctx) => {
    const hasExplicitDeckFilter = ctx.operations.some(
      (op) => op.method === "in" && op.args[0] === "linked_deck_id"
    );
    const hasUnlinkedFilter = ctx.operations.some(
      (op) => op.method === "is" && op.args[0] === "linked_deck_id"
    );

    if (hasExplicitDeckFilter) {
      return {
        data: [
          buildLogRow({
            id: "deck-b-explicit",
            imported_at: "2026-04-15T11:00:00.000Z",
            linked_deck_id: "deck-b",
            result: "Win"
          })
        ],
        error: null
      };
    }

    if (hasUnlinkedFilter) {
      return {
        data: [
          buildLogRow({
            id: "deck-b-legacy",
            linked_deck_id: null,
            self_deck_name: "Deck deck-b",
            self_deck_sprites: "",
            result: "Loss"
          })
        ],
        error: null
      };
    }

    throw new Error(`Unexpected query: ${JSON.stringify(ctx.operations)}`);
  });

  logsDbTestHooks.createClient = async () => client as never;
  t.after(() => {
    logsDbTestHooks.createClient = originalCreateClient;
  });

  const snapshots = await getDeckLogSnapshots("user-1", decks);
  const deckBSnapshot = snapshots.get("deck-b");

  assert.equal(queries.length, 2);
  assert.equal(deckBSnapshot?.stats.total, 2);
  assert.equal(deckBSnapshot?.stats.wins, 1);
  assert.equal(deckBSnapshot?.stats.losses, 1);
  assert.deepEqual(
    deckBSnapshot?.logs.map((log) => log.id),
    ["deck-b-explicit", "deck-b-legacy"]
  );
});

test("getDeckStatsForIndex reads the deck_log_stats read model", async (t) => {
  const originalCreateClient = logsDbTestHooks.createClient;
  const decks = [buildDeckSummary("deck-a"), buildDeckSummary("deck-b"), buildDeckSummary("deck-c")];
  const { client, queries } = createFakeSupabaseClient((ctx) => {
    const hasDeckStatsFilter = ctx.operations.some(
      (op) => op.method === "in" && op.args[0] === "deck_id"
    );

    if (hasDeckStatsFilter) {
      return {
        data: [{ deck_id: "deck-b", games_played: 3, games_won: 2, games_lost: 1 }],
        error: null
      };
    }

    throw new Error(`Unexpected query: ${JSON.stringify(ctx.operations)}`);
  });

  logsDbTestHooks.createClient = async () => client as never;
  t.after(() => {
    logsDbTestHooks.createClient = originalCreateClient;
  });

  const statsByDeck = await getDeckStatsForIndex("user-1", decks);
  const deckBStats = statsByDeck.get("deck-b");

  assert.equal(queries.length, 1);
  assert.deepEqual(
    queries.map((query) => query.operations.find((op) => op.method === "select")?.args[0]),
    ["deck_id,games_played,games_won,games_lost"]
  );
  assert.deepEqual(deckBStats, {
    total: 3,
    wins: 2,
    losses: 1
  });
});

test("getDeckStatsForIndex returns zeroes for decks missing read-model rows", async (t) => {
  const originalCreateClient = logsDbTestHooks.createClient;
  const decks = [buildDeckSummary("deck-a"), buildDeckSummary("deck-b"), buildDeckSummary("deck-c")];
  const { client } = createFakeSupabaseClient((ctx) => {
    const hasDeckStatsFilter = ctx.operations.some(
      (op) => op.method === "in" && op.args[0] === "deck_id"
    );

    if (hasDeckStatsFilter) {
      return {
        data: [
          { deck_id: "deck-a", games_played: 1, games_won: 1, games_lost: 0 },
          { deck_id: "deck-b", games_played: 1, games_won: 0, games_lost: 1 }
        ],
        error: null
      };
    }

    throw new Error(`Unexpected query: ${JSON.stringify(ctx.operations)}`);
  });

  logsDbTestHooks.createClient = async () => client as never;
  t.after(() => {
    logsDbTestHooks.createClient = originalCreateClient;
  });

  const statsByDeck = await getDeckStatsForIndex("user-1", decks);

  assert.deepEqual(statsByDeck.get("deck-a"), {
    total: 1,
    wins: 1,
    losses: 0
  });
  assert.deepEqual(statsByDeck.get("deck-b"), {
    total: 1,
    wins: 0,
    losses: 1
  });
  assert.deepEqual(statsByDeck.get("deck-c"), {
    total: 0,
    wins: 0,
    losses: 0
  });
});

test("getLatestLogsForDeck fetches only a bounded latest linked-log preview", async (t) => {
  const originalCreateClient = logsDbTestHooks.createClient;
  const { client, queries } = createFakeSupabaseClient((ctx) => {
    const hasLinkedDeckFilter = ctx.operations.some(
      (op) => op.method === "eq" && op.args[0] === "linked_deck_id"
    );

    if (hasLinkedDeckFilter) {
      return {
        data: [buildLogRow({ id: "deck-b-latest", linked_deck_id: "deck-b" })],
        error: null
      };
    }

    throw new Error(`Unexpected query: ${JSON.stringify(ctx.operations)}`);
  });

  logsDbTestHooks.createClient = async () => client as never;
  t.after(() => {
    logsDbTestHooks.createClient = originalCreateClient;
  });

  const logs = await getLatestLogsForDeck("user-1", "deck-b", 5);

  assert.deepEqual(logs.map((log) => log.id), ["deck-b-latest"]);
  assert.deepEqual(
    queries[0]?.operations.filter((op) => op.method === "order").map((op) => op.args[0]),
    ["date", "imported_at", "id"]
  );
  assert.deepEqual(queries[0]?.operations.find((op) => op.method === "limit")?.args, [5]);
  assert.equal(queries[0]?.operations.some((op) => op.method === "in"), false);
});
