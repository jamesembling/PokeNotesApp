import assert from "node:assert/strict";
import test from "node:test";
import {
  getArchetypeMatchupStats,
  getAllLogsByDeck,
  getDeckLogSnapshots,
  getDeckStatsForIndex,
  getLatestLogsForDeck,
  getLogById,
  getLogDamageTimeline,
  getInitialLogsPageData,
  getLogStatsOverview,
  getLogsWindow,
  logsDbTestHooks,
  mapBattleLog
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
  count?: number | null;
  data: unknown;
  error: unknown;
};

type RpcResult = {
  data: unknown;
  error: unknown;
};

type QueryChain = {
  select(value: string, options?: unknown): QueryChain;
  eq(...args: unknown[]): QueryChain;
  in(...args: unknown[]): QueryChain;
  is(...args: unknown[]): QueryChain;
  gte(...args: unknown[]): QueryChain;
  lte(...args: unknown[]): QueryChain;
  lt(...args: unknown[]): QueryChain;
  or(...args: unknown[]): QueryChain;
  order(...args: unknown[]): QueryChain;
  range(...args: unknown[]): QueryChain;
  limit(...args: unknown[]): QueryChain;
  maybeSingle(): Promise<QueryResult>;
  then(
    onFulfilled?: ((value: QueryResult) => unknown) | null,
    onRejected?: ((reason: unknown) => unknown) | null
  ): Promise<unknown>;
};

function createFakeSupabaseClient(
  resolver: (ctx: QueryContext) => QueryResult,
  rpcResolver?: (fnName: string, args?: unknown) => RpcResult
) {
  const makeChain = (ctx: QueryContext) => {
    const chain: QueryChain = {
      select(value: string, options?: unknown) {
        ctx.operations.push({ method: "select", args: [value, options] });
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
      range(...args: unknown[]) {
        ctx.operations.push({ method: "range", args });
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
      rpc(fnName: string, args?: unknown) {
        if (!rpcResolver) {
          return Promise.resolve({
            data: null,
            error: new Error(`Unexpected rpc call: ${fnName}`)
          });
        }
        return Promise.resolve(rpcResolver(fnName, args));
      },
      from(table: string) {
        const ctx: QueryContext = {
          table,
          operations: []
        };
        return makeChain(ctx);
      }
    }
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
    match_notes: "Kept the active safe.\nReview turn four.",
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

test("mapBattleLog reports malformed stored sections and falls back safely", () => {
  const reports: unknown[][] = [];
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    reports.push(args);
  };

  try {
    const log = mapBattleLog(
      buildLogRow({
        raw_log: "raw",
        sections: [
          {
            title: "Setup",
            player: "",
            actions: [{ title: "Missing details" }],
            prizesAfterTurn: {}
          }
        ]
      }) as never
    );

    assert.deepEqual(log.sections, []);
    assert.equal(reports.length, 1);
    assert.equal(reports[0]?.[0], "[pokenotes:error]");
    assert.doesNotMatch(JSON.stringify(reports[0]?.[1]), /Missing details|raw/);
  } finally {
    console.error = originalConsoleError;
  }
});

test("getLogDamageTimeline maps returned rows into chronological points", async (t) => {
  const originalCreateClient = logsDbTestHooks.createClient;
  const { client } = createFakeSupabaseClient(() => ({
    data: [
      {
        date: "2026-07-11",
        result: "Win",
        self_attack_damage: 220,
        opponent_attack_damage: 120
      },
      {
        date: "2026-07-10",
        result: "Loss",
        self_attack_damage: 180,
        opponent_attack_damage: 200
      },
      {
        date: "2026-07-09",
        result: "Unknown",
        self_attack_damage: null,
        opponent_attack_damage: null
      }
    ],
    error: null
  }));

  logsDbTestHooks.createClient = async () => client as never;
  t.after(() => {
    logsDbTestHooks.createClient = originalCreateClient;
  });

  const timeline = await getLogDamageTimeline("user-1");
  assert.deepEqual(timeline, [
    {
      date: "2026-07-09",
      result: null,
      selfAttackDamage: 0,
      opponentAttackDamage: 0
    },
    {
      date: "2026-07-10",
      result: "Loss",
      selfAttackDamage: 180,
      opponentAttackDamage: 200
    },
    {
      date: "2026-07-11",
      result: "Win",
      selfAttackDamage: 220,
      opponentAttackDamage: 120
    }
  ]);
});

test("getInitialLogsPageData maps the optimized RPC into window and linked-list semantics", async (t) => {
  const originalCreateClient = logsDbTestHooks.createClient;
  const { client } = createFakeSupabaseClient(
    () => {
      throw new Error("The initial read model should not issue table queries.");
    },
    (fnName) => {
      assert.equal(fnName, "get_initial_logs_page_data");
      return {
        data: {
          logs: [
            buildLogRow({
              date: "2026-04-26",
              id: "log-c",
              imported_at: "2026-04-26T10:00:00.000Z",
              linked_deck_list_id: "list-1",
              linked_deck_list_name: "League Cup"
            }),
            buildLogRow({
              date: "2026-04-20",
              id: "log-b",
              imported_at: "2026-04-20T10:00:00.000Z"
            }),
            buildLogRow({
              date: "2026-04-19",
              id: "log-a",
              imported_at: "2026-04-19T10:00:00.000Z"
            })
          ],
          stats: {
            games_lost: 5,
            games_played: 12,
            games_won: 7
          }
        },
        error: null
      };
    }
  );

  logsDbTestHooks.createClient = async () => client as never;
  t.after(() => {
    logsDbTestHooks.createClient = originalCreateClient;
  });

  const initialData = await getInitialLogsPageData();

  assert.deepEqual(initialData?.stats, {
    losses: 5,
    total: 12,
    wins: 7
  });
  assert.deepEqual(initialData?.window.logs.map((log) => log.id), ["log-c", "log-b"]);
  assert.equal(initialData?.window.logs[0]?.linkedDeckListName, "League Cup");
  assert.equal(initialData?.window.hasMore, true);
  assert.equal(initialData?.window.nextWindowEndDate, "2026-04-19");
});

test("getInitialLogsPageData returns null when the optimized RPC is unavailable", async (t) => {
  const originalCreateClient = logsDbTestHooks.createClient;
  const { client } = createFakeSupabaseClient(
    () => {
      throw new Error("Fallback is owned by the page loader.");
    },
    () => ({
      data: null,
      error: new Error("function is not available")
    })
  );

  logsDbTestHooks.createClient = async () => client as never;
  t.after(() => {
    logsDbTestHooks.createClient = originalCreateClient;
  });

  assert.equal(await getInitialLogsPageData(), null);
});

test("getLogsWindow returns the requested initial page and continuation metadata", async (t) => {
  const originalCreateClient = logsDbTestHooks.createClient;
  const { client } = createFakeSupabaseClient(() => ({
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

  const window = await getLogsWindow("user-1", { limit: 2, windowEndDate: "2026-04-26" });

  assert.deepEqual(window.logs.map((log) => log.id), ["log-c", "log-b"]);
  assert.equal(window.hasMore, true);
  assert.ok(window.nextWindowEndDate);
});

test("getLogsWindow anchors the initial 7-day window to the newest log date", async (t) => {
  const originalCreateClient = logsDbTestHooks.createClient;
  const { client } = createFakeSupabaseClient(() => ({
    data: [
      buildLogRow({ id: "log-future-local", date: "2026-07-04", imported_at: "2026-07-03T23:08:51.000Z" }),
      buildLogRow({ id: "log-new", date: "2026-04-10", imported_at: "2026-04-10T10:00:00.000Z" }),
      buildLogRow({ id: "log-old", date: "2026-04-03", imported_at: "2026-04-03T10:00:00.000Z" })
    ],
    error: null
  }));

  logsDbTestHooks.createClient = async () => client as never;
  t.after(() => {
    logsDbTestHooks.createClient = originalCreateClient;
  });

  const window = await getLogsWindow("user-1");

  assert.deepEqual(window.logs.map((log) => log.id), ["log-future-local"]);
  assert.equal(window.windowEndDate, "2026-07-04");
  assert.equal(window.windowStartDate, "2026-06-28");
  assert.equal(window.hasMore, true);
  assert.equal(window.nextWindowEndDate, "2026-06-27");
});

test("getLogsWindow returns the next same-date page after a cursor", async (t) => {
  const originalCreateClient = logsDbTestHooks.createClient;
  const { client } = createFakeSupabaseClient((ctx) => {
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

  const firstPage = await getLogsWindow("user-1", { limit: 1, windowEndDate: "2026-04-26" });
  const secondPage = await getLogsWindow("user-1", {
    cursor: firstPage.nextWindowEndDate,
    limit: 1
  });

  assert.deepEqual(firstPage.logs.map((log) => log.id), ["log-c"]);
  assert.deepEqual(secondPage.logs.map((log) => log.id), ["log-a"]);
});

test("getLogsWindow reanchors a sparse date cursor and exhausts Load More", async (t) => {
  const originalCreateClient = logsDbTestHooks.createClient;
  const { client } = createFakeSupabaseClient((ctx) => {
    const windowEndDate = ctx.operations.find((op) => op.method === "lte")?.args[1];

    return {
      data:
        windowEndDate === "2026-07-17"
          ? [
              buildLogRow({
                id: "log-april-21",
                date: "2026-04-21",
                imported_at: "2026-04-21T10:00:00.000Z"
              }),
              buildLogRow({
                id: "log-april-20",
                date: "2026-04-20",
                imported_at: "2026-04-20T10:00:00.000Z"
              }),
              buildLogRow({
                id: "log-april-14",
                date: "2026-04-14",
                imported_at: "2026-04-14T10:00:00.000Z"
              })
            ]
          : [
              buildLogRow({
                id: "log-april-14",
                date: "2026-04-14",
                imported_at: "2026-04-14T10:00:00.000Z"
              })
            ],
      error: null
    };
  });

  logsDbTestHooks.createClient = async () => client as never;
  t.after(() => {
    logsDbTestHooks.createClient = originalCreateClient;
  });

  const sparsePage = await getLogsWindow("tenant-user", { cursor: "2026-07-17" });
  const finalPage = await getLogsWindow("tenant-user", {
    cursor: sparsePage.nextWindowEndDate
  });

  assert.deepEqual(sparsePage.logs.map((log) => log.id), ["log-april-21", "log-april-20"]);
  assert.equal(sparsePage.windowEndDate, "2026-04-21");
  assert.equal(sparsePage.windowStartDate, "2026-04-15");
  assert.equal(sparsePage.hasMore, true);
  assert.equal(sparsePage.nextWindowEndDate, "2026-04-14");

  assert.deepEqual(finalPage.logs.map((log) => log.id), ["log-april-14"]);
  assert.equal(finalPage.hasMore, false);
  assert.equal(finalPage.nextWindowEndDate, "");
});

test("getLogStatsOverview prefers the RPC rollup path when it succeeds", async (t) => {
  const originalCreateClient = logsDbTestHooks.createClient;
  const { client } = createFakeSupabaseClient(
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
            coin_flips_lost: 4,
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
    coinFlipsLost: 4,
    coinFlipsWon: 8,
    mulligansTaken: 3,
    prizesTaken: 29,
    trackedDamage: 3480,
    trackedPrizes: 54
  });
});

test("getLogStatsOverview uses the read model when the live RPC has the old shape", async (t) => {
  const originalCreateClient = logsDbTestHooks.createClient;
  const { client } = createFakeSupabaseClient(
    (ctx) => {
      assert.equal(ctx.table, "user_log_stats");
      const select = ctx.operations.find((operation) => operation.method === "select");
      assert.equal(typeof select?.args[0], "string");
      assert.equal(String(select?.args[0]).includes("raw_log"), false);
      assert.ok(ctx.operations.some((operation) =>
        operation.method === "eq" && operation.args[0] === "user_id" && operation.args[1] === "user-1"
      ));
      return {
        data: {
          games_played: 12,
          games_won: 7,
          games_lost: 5,
          attack_damage: 1820,
          opponent_attack_damage: 1660,
          coin_flips_lost: 4,
          coin_flips_won: 8,
          mulligans_taken: 3,
          prizes_taken: 29,
          tracked_damage: 3480,
          tracked_prizes: 54
        },
        error: null
      };
    },
    () => ({
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
    })
  );

  logsDbTestHooks.createClient = async () => client as never;
  t.after(() => {
    logsDbTestHooks.createClient = originalCreateClient;
  });

  const overview = await getLogStatsOverview("user-1");

  assert.equal(overview.coinFlipsWon, 8);
  assert.equal(overview.coinFlipsLost, 4);
});

test("getLogStatsOverview falls back to the user_log_stats read model if the RPC errors", async (t) => {
  const originalCreateClient = logsDbTestHooks.createClient;
  const { client } = createFakeSupabaseClient(
    () => ({
      data: {
        games_played: 12,
        games_won: 7,
        games_lost: 5,
        attack_damage: 1820,
        opponent_attack_damage: 1660,
        coin_flips_lost: 4,
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
    coinFlipsLost: 4,
    coinFlipsWon: 8,
    mulligansTaken: 3,
    prizesTaken: 29,
    trackedDamage: 3480,
    trackedPrizes: 54
  });
});

test("getArchetypeMatchupStats maps opponent matchup rows", async (t) => {
  const originalCreateClient = logsDbTestHooks.createClient;
  const { client } = createFakeSupabaseClient(() => ({
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
});

test("getAllLogsByDeck pages and groups explicit and legacy-unlinked logs", async (t) => {
  const originalCreateClient = logsDbTestHooks.createClient;
  const decks = [buildDeckSummary("deck-a"), buildDeckSummary("deck-b"), buildDeckSummary("deck-c")];
  const explicitRows = Array.from({ length: 501 }, (_, index) =>
    buildLogRow({ id: `explicit-${index}`, linked_deck_id: "deck-b" })
  );
  const unlinkedRows = Array.from({ length: 501 }, (_, index) =>
    buildLogRow({
      id: `unlinked-${index}`,
      linked_deck_id: null,
      self_deck_name: "Deck deck-b",
      self_deck_sprites: ""
    })
  );
  const { client } = createFakeSupabaseClient((ctx) => {
    const hasExplicitDeckFilter = ctx.operations.some(
      (op) => op.method === "in" && op.args[0] === "linked_deck_id"
    );
    const hasUnlinkedFilter = ctx.operations.some(
      (op) => op.method === "is" && op.args[0] === "linked_deck_id"
    );

    const range = ctx.operations.find((op) => op.method === "range")?.args;
    assert.ok(range, "deck-log queries must request bounded pages");
    const [from, to] = range as number[];

    if (hasExplicitDeckFilter) {
      return {
        data: explicitRows.slice(from, to + 1),
        error: null
      };
    }

    if (hasUnlinkedFilter) {
      return {
        data: unlinkedRows.slice(from, to + 1),
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

  const deckBLogIds = new Set((logsByDeck.get("deck-b") ?? []).map((log) => log.id));
  assert.equal(deckBLogIds.size, 1002);
  assert.ok(deckBLogIds.has("explicit-500"));
  assert.ok(deckBLogIds.has("unlinked-500"));
});

test("getDeckLogSnapshots preserves grouped stats parity for explicit and legacy-unlinked logs", async (t) => {
  const originalCreateClient = logsDbTestHooks.createClient;
  const decks = [buildDeckSummary("deck-a"), buildDeckSummary("deck-b"), buildDeckSummary("deck-c")];
  const { client } = createFakeSupabaseClient((ctx) => {
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

  assert.equal(deckBSnapshot?.stats.total, 2);
  assert.equal(deckBSnapshot?.stats.wins, 1);
  assert.equal(deckBSnapshot?.stats.losses, 1);
  assert.deepEqual(
    deckBSnapshot?.logs.map((log) => log.id),
    ["deck-b-explicit", "deck-b-legacy"]
  );
});

test("getDeckStatsForIndex maps read-model rows and initializes missing decks", async (t) => {
  const originalCreateClient = logsDbTestHooks.createClient;
  const decks = [buildDeckSummary("deck-a"), buildDeckSummary("deck-b"), buildDeckSummary("deck-c")];
  const { client } = createFakeSupabaseClient((ctx) => {
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

  assert.deepEqual(deckBStats, {
    total: 3,
    wins: 2,
    losses: 1
  });
  assert.deepEqual(statsByDeck.get("deck-c"), {
    total: 0,
    wins: 0,
    losses: 0
  });
});

test("getLatestLogsForDeck returns linked-log preview rows", async (t) => {
  const originalCreateClient = logsDbTestHooks.createClient;
  const { client } = createFakeSupabaseClient((ctx) => {
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
});
