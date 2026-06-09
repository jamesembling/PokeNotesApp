import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLearnedSelfArchetypeCatalogRow,
  buildLearnedSelfArchetype,
  normalizeLearnedSelfDeckSprites,
  promoteLearnedSelfArchetype,
  resolveLearnedSelfArchetype,
  resolveLearnedSelfArchetypeFromCandidates
} from "@/lib/log-import/learned-self-archetypes";
import type { IdentificationCatalog } from "@/lib/log-import/types";

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
  const upserts: unknown[] = [];

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
      upsert(value: unknown, options: unknown) {
        ctx.operations.push({ method: "upsert", args: [value, options] });
        upserts.push(value);
        return Promise.resolve({ error: null });
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
      from(table: "logs" | "archetype_catalog") {
        const ctx: QueryContext = {
          table,
          operations: []
        };
        queries.push(ctx);
        return makeChain(ctx);
      }
    },
    queries,
    upserts
  };
}

function createCatalog(): IdentificationCatalog {
  return {
    pokemon: {
      bySlug: new Map(),
      normalizedNameToSlug: new Map(),
      slugToAncestors: new Map([
        ["charizard", ["charmeleon", "charmander"]],
        ["charmeleon", ["charmander"]],
        ["pidgeot", ["pidgeotto", "pidgey"]],
        ["pidgeotto", ["pidgey"]]
      ]),
      slugToFamilyRoot: new Map(),
      maxNameTokens: 1
    },
    archetypes: {
      byId: new Map(),
      normalizedLabelToIds: new Map(),
      spriteToCandidateArchetypes: new Map(),
      familyRootToCandidateArchetypes: new Map()
    }
  };
}

function createCatalogWithKnownArchetype(archetypeId: string): IdentificationCatalog {
  const catalog = createCatalog();
  catalog.archetypes.byId.set(archetypeId, {
    id: archetypeId,
    label: "Known Archetype",
    sprites: [],
    detectionSprites: [],
    requiredMatchGroups: []
  });
  return catalog;
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

test("buildLearnedSelfArchetypeCatalogRow populates detection and required match groups", () => {
  assert.deepEqual(
    buildLearnedSelfArchetypeCatalogRow({
      userId: "user-1",
      sprites: ["charizard", "pidgeot"],
      matchCount: 3,
      catalog: createCatalog()
    }),
    {
      id: "learned:user-1:charizard+pidgeot",
      canonical_id: "charizard+pidgeot",
      label: "Charizard / Pidgeot",
      sprites: ["charizard", "pidgeot"],
      detection_sprites: ["charizard", "charmeleon", "charmander", "pidgeot", "pidgeotto", "pidgey"],
      required_match_groups: [
        ["charizard", "charmeleon", "charmander"],
        ["pidgeot", "pidgeotto", "pidgey"]
      ],
      is_excluded: false,
      source: "learned",
      user_id: "user-1",
      learned_match_count: 3
    }
  );
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

test("promoteLearnedSelfArchetype upserts a user-scoped catalog row", async () => {
  const { client, queries, upserts } = createFakeSupabaseClient([{ id: "log-1" }, { id: "log-2" }]);

  const resolved = await promoteLearnedSelfArchetype({
    supabase: client,
    userId: "user-1",
    sprites: ["charizard", "pidgeot"],
    catalog: createCatalog(),
    minimumExistingMatches: 2
  });

  assert.deepEqual(resolved, {
    archetypeId: "charizard+pidgeot",
    label: "Charizard / Pidgeot",
    sprites: ["charizard", "pidgeot"],
    matchCount: 3
  });
  assert.equal(queries[1].table, "archetype_catalog");
  assert.deepEqual(queries[1].operations, [
    {
      method: "upsert",
      args: [
        {
          id: "learned:user-1:charizard+pidgeot",
          canonical_id: "charizard+pidgeot",
          label: "Charizard / Pidgeot",
          sprites: ["charizard", "pidgeot"],
          detection_sprites: [
            "charizard",
            "charmeleon",
            "charmander",
            "pidgeot",
            "pidgeotto",
            "pidgey"
          ],
          required_match_groups: [
            ["charizard", "charmeleon", "charmander"],
            ["pidgeot", "pidgeotto", "pidgey"]
          ],
          is_excluded: false,
          source: "learned",
          user_id: "user-1",
          learned_match_count: 3
        },
        { onConflict: "id" }
      ]
    }
  ]);
  assert.equal(upserts.length, 1);
});

test("promoteLearnedSelfArchetype skips sprite pairs already in the catalog", async () => {
  const { client, queries, upserts } = createFakeSupabaseClient([{ id: "log-1" }, { id: "log-2" }]);

  const resolved = await promoteLearnedSelfArchetype({
    supabase: client,
    userId: "user-1",
    sprites: ["charizard", "pidgeot"],
    catalog: createCatalogWithKnownArchetype("charizard+pidgeot"),
    minimumExistingMatches: 2
  });

  assert.equal(resolved, null);
  assert.equal(queries.length, 0);
  assert.equal(upserts.length, 0);
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
