import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLearnedSelfArchetype,
  normalizeLearnedSelfDeckSprites,
  resolveLearnedSelfArchetype,
  resolveLearnedSelfArchetypeFromCandidates
} from "@/lib/log-import/learned-self-archetypes";

type QueryOp = {
  method: string;
  args: unknown[];
};

type QueryContext = {
  table: string;
  operations: QueryOp[];
};

function createFakeSupabaseClient(rows: Array<{ id?: string; self_deck_sprites?: string }>) {
  const queries: QueryContext[] = [];

  const makeChain = (ctx: QueryContext) => {
    const chain = {
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
      limit(...args: unknown[]) {
        ctx.operations.push({ method: "limit", args });
        return chain;
      },
      then(
        onFulfilled?:
          | ((
              value: {
                data: Array<{ id?: string; self_deck_sprites?: string }>;
                error: null;
              }
            ) => unknown)
          | null,
        onRejected?: ((reason: unknown) => unknown) | null
      ) {
        return Promise.resolve({ data: rows, error: null }).then(onFulfilled, onRejected);
      }
    };

    return chain;
  };

  return {
    client: {
      from(table: "logs") {
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

test("normalizeLearnedSelfDeckSprites trims, lowercases, dedupes, and caps sprites", () => {
  assert.deepEqual(normalizeLearnedSelfDeckSprites([" Dragapult ", "Dusknoir", "dragapult"]), [
    "dragapult",
    "dusknoir"
  ]);
});

test("normalizeLearnedSelfDeckSprites applies preferred learned deck sprite order", () => {
  assert.deepEqual(normalizeLearnedSelfDeckSprites(["Dudunsparce", "Greninja-Mega"]), [
    "greninja-mega",
    "dudunsparce"
  ]);
});

test("normalizeLearnedSelfDeckSprites displays Hydrapple before Teal Mask Ogerpon", () => {
  assert.deepEqual(normalizeLearnedSelfDeckSprites(["ogerpon", "hydrapple"]), [
    "hydrapple",
    "ogerpon"
  ]);
});

test("buildLearnedSelfArchetype uses the stable sprite archetype id", () => {
  assert.deepEqual(buildLearnedSelfArchetype(["dusknoir", "dragapult"], 3), {
    archetypeId: "dragapult+dusknoir",
    label: "Dusknoir / Dragapult",
    sprites: ["dusknoir", "dragapult"],
    matchCount: 3
  });
});

test("buildLearnedSelfArchetype displays Mega Greninja before Dudunsparce", () => {
  assert.deepEqual(buildLearnedSelfArchetype(["dudunsparce", "greninja-mega"], 3), {
    archetypeId: "dudunsparce+greninja-mega",
    label: "Mega Greninja / Dudunsparce",
    sprites: ["greninja-mega", "dudunsparce"],
    matchCount: 3
  });
});

test("resolveLearnedSelfArchetype returns null below the learned threshold", async () => {
  const { client } = createFakeSupabaseClient([{ id: "log-1" }, { id: "log-2" }]);

  const resolved = await resolveLearnedSelfArchetype({
    supabase: client,
    userId: "user-1",
    sprites: ["dragapult", "dusknoir"]
  });

  assert.equal(resolved, null);
});

test("resolveLearnedSelfArchetype checks only matching self sprite variants for the user", async () => {
  const { client, queries } = createFakeSupabaseClient([
    { id: "log-1" },
    { id: "log-2" },
    { id: "log-3" }
  ]);

  const resolved = await resolveLearnedSelfArchetype({
    supabase: client,
    userId: "user-1",
    sprites: ["dragapult", "dusknoir"]
  });

  assert.deepEqual(resolved, {
    archetypeId: "dragapult+dusknoir",
    label: "Dragapult / Dusknoir",
    sprites: ["dragapult", "dusknoir"],
    matchCount: 3
  });
  assert.equal(queries[0].table, "logs");
  assert.deepEqual(queries[0].operations, [
    { method: "select", args: ["id"] },
    { method: "eq", args: ["user_id", "user-1"] },
    { method: "in", args: ["self_deck_sprites", ["dragapult,dusknoir", "dusknoir,dragapult"]] },
    { method: "limit", args: [3] }
  ]);
});

test("resolveLearnedSelfArchetype can promote the third matching save", async () => {
  const { client, queries } = createFakeSupabaseClient([{ id: "log-1" }, { id: "log-2" }]);

  const resolved = await resolveLearnedSelfArchetype({
    supabase: client,
    userId: "user-1",
    sprites: ["hydrapple", "ogerpon"],
    minimumExistingMatches: 2
  });

  assert.deepEqual(resolved, {
    archetypeId: "hydrapple+ogerpon",
    label: "Hydrapple / Ogerpon",
    sprites: ["hydrapple", "ogerpon"],
    matchCount: 2
  });
  assert.deepEqual(queries[0].operations, [
    { method: "select", args: ["id"] },
    { method: "eq", args: ["user_id", "user-1"] },
    { method: "in", args: ["self_deck_sprites", ["hydrapple,ogerpon", "ogerpon,hydrapple"]] },
    { method: "limit", args: [2] }
  ]);
});

test("resolveLearnedSelfArchetypeFromCandidates finds a learned lower-ranked pair", async () => {
  const { client } = createFakeSupabaseClient([
    { id: "log-1", self_deck_sprites: "froslass-mega,lopunny-mega" },
    { id: "log-2", self_deck_sprites: "froslass-mega,lopunny-mega" },
    { id: "log-3", self_deck_sprites: "froslass-mega,lopunny-mega" }
  ]);

  const resolved = await resolveLearnedSelfArchetypeFromCandidates({
    supabase: client,
    userId: "user-1",
    candidates: [
      ["dudunsparce", "froslass-mega"],
      ["froslass-mega", "lopunny-mega"]
    ]
  });

  assert.deepEqual(resolved, {
    archetypeId: "froslass-mega+lopunny-mega",
    label: "Mega Froslass / Mega Lopunny",
    sprites: ["froslass-mega", "lopunny-mega"],
    matchCount: 3
  });
});
