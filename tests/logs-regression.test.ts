import assert from "node:assert/strict";
import test from "node:test";
import {
  getAllLogsByDeck,
  getDeckLogSnapshots,
  getDeckStatsForIndex,
  getLogById,
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
  error: null;
};

type QueryChain = {
  select(value: string): QueryChain;
  eq(...args: unknown[]): QueryChain;
  in(...args: unknown[]): QueryChain;
  is(...args: unknown[]): QueryChain;
  gte(...args: unknown[]): QueryChain;
  lte(...args: unknown[]): QueryChain;
  lt(...args: unknown[]): QueryChain;
  order(...args: unknown[]): QueryChain;
  limit(...args: unknown[]): QueryChain;
  maybeSingle(): Promise<QueryResult>;
  then(
    onFulfilled?: ((value: QueryResult) => unknown) | null,
    onRejected?: ((reason: unknown) => unknown) | null
  ): Promise<unknown>;
};

function createFakeSupabaseClient(resolver: (ctx: QueryContext) => QueryResult) {
  const queries: QueryContext[] = [];

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
      from(table: string) {
        const ctx: QueryContext = {
          table,
          operations: []
        };
        queries.push(ctx);
        return makeChain(ctx);
      }
    },
    queries
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
        data: [buildLogRow({ id: "deck-b-explicit", linked_deck_id: "deck-b", result: "Win" })],
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

test("getDeckStatsForIndex preserves deck stats parity without materializing log lists", async (t) => {
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
        data: [buildLogRow({ id: "deck-b-explicit", linked_deck_id: "deck-b", result: "Win" })],
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

  const statsByDeck = await getDeckStatsForIndex("user-1", decks);
  const deckBStats = statsByDeck.get("deck-b");

  assert.equal(queries.length, 2);
  assert.deepEqual(
    queries.map((query) => query.operations.find((op) => op.method === "select")?.args[0]),
    [
      "id,result,linked_deck_id",
      "id,result,self_deck_name,self_deck_sprites,linked_deck_id"
    ]
  );
  assert.deepEqual(deckBStats, {
    total: 2,
    wins: 1,
    losses: 1
  });
});
