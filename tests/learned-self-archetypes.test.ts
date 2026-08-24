import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLearnedSelfArchetypeCatalogRow,
  buildLearnedSelfArchetype,
  normalizeLearnedSelfDeckSprites,
  promoteLearnedSelfArchetype,
  resolveSelfArchetypeForSave,
  resolveLearnedSelfArchetype,
  resolveLearnedSelfArchetypeFromCandidates
} from "@/lib/log-import/learned-self-archetypes";
import { getArchetypeEnrichment } from "@/lib/pokemon-catalog/archetype-enrichments.mjs";
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

test("normalizeLearnedSelfDeckSprites applies its normalization decision table", () => {
  const cases = [
    {
      name: "trims, lowercases, dedupes, and caps sprites",
      input: [" Dragapult ", "Dusknoir", "dragapult"],
      expected: ["dragapult", "dusknoir"]
    },
    {
      name: "prefers Mega Greninja before Dudunsparce",
      input: ["Dudunsparce", "Greninja-Mega"],
      expected: ["greninja-mega", "dudunsparce"]
    },
    {
      name: "prefers Hydrapple before Teal Mask Ogerpon",
      input: ["ogerpon", "hydrapple"],
      expected: ["hydrapple", "ogerpon"]
    }
  ];

  for (const scenario of cases) {
    assert.deepEqual(normalizeLearnedSelfDeckSprites(scenario.input), scenario.expected, scenario.name);
  }
});

test("buildLearnedSelfArchetype applies its identity and display decision table", () => {
  const cases = [
    {
      name: "uses the stable sprite archetype id",
      sprites: ["dusknoir", "dragapult"],
      expected: {
        archetypeId: "dragapult+dusknoir",
        label: "Dusknoir / Dragapult",
        sprites: ["dusknoir", "dragapult"],
        matchCount: 3
      }
    },
    {
      name: "displays Mega Greninja before Dudunsparce",
      sprites: ["dudunsparce", "greninja-mega"],
      expected: {
        archetypeId: "dudunsparce+greninja-mega",
        label: "Mega Greninja / Dudunsparce",
        sprites: ["greninja-mega", "dudunsparce"],
        matchCount: 3
      }
    }
  ];

  for (const scenario of cases) {
    assert.deepEqual(
      buildLearnedSelfArchetype(scenario.sprites, 3),
      scenario.expected,
      scenario.name
    );
  }
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

test("resolveLearnedSelfArchetype applies the threshold and query decision table", async () => {
  type ResolveCase = {
    name: string;
    rows: Array<{ id?: string; self_deck_sprites?: string }>;
    sprites: string[];
    minimumExistingMatches?: number;
    expected: unknown;
    expectedOperations?: QueryOp[];
  };

  const cases: ResolveCase[] = [
    {
      name: "returns null below the learned threshold",
      rows: [{ id: "log-1" }, { id: "log-2" }],
      sprites: ["dragapult", "dusknoir"],
      expected: null
    },
    {
      name: "checks only matching self sprite variants for the user",
      rows: [{ id: "log-1" }, { id: "log-2" }, { id: "log-3" }],
      sprites: ["dragapult", "dusknoir"],
      expected: {
        archetypeId: "dragapult+dusknoir",
        label: "Dragapult / Dusknoir",
        sprites: ["dragapult", "dusknoir"],
        matchCount: 3
      },
      expectedOperations: [
        { method: "select", args: ["id"] },
        { method: "eq", args: ["user_id", "user-1"] },
        { method: "in", args: ["self_deck_sprites", ["dragapult,dusknoir", "dusknoir,dragapult"]] },
        { method: "limit", args: [3] }
      ]
    },
    {
      name: "can promote the third matching save with a custom threshold",
      rows: [{ id: "log-1" }, { id: "log-2" }],
      sprites: ["hydrapple", "ogerpon"],
      minimumExistingMatches: 2,
      expected: {
        archetypeId: "hydrapple+ogerpon",
        label: "Hydrapple / Ogerpon",
        sprites: ["hydrapple", "ogerpon"],
        matchCount: 2
      },
      expectedOperations: [
        { method: "select", args: ["id"] },
        { method: "eq", args: ["user_id", "user-1"] },
        { method: "in", args: ["self_deck_sprites", ["hydrapple,ogerpon", "ogerpon,hydrapple"]] },
        { method: "limit", args: [2] }
      ]
    }
  ];

  for (const scenario of cases) {
    const { client, queries } = createFakeSupabaseClient(scenario.rows);
    const resolved = await resolveLearnedSelfArchetype({
      supabase: client,
      userId: "user-1",
      sprites: scenario.sprites,
      ...(scenario.minimumExistingMatches === undefined
        ? {}
        : { minimumExistingMatches: scenario.minimumExistingMatches })
    });

    assert.deepEqual(resolved, scenario.expected, scenario.name);
    if (scenario.expectedOperations) {
      assert.equal(queries[0].table, "logs", `${scenario.name}: table`);
      assert.deepEqual(queries[0].operations, scenario.expectedOperations, `${scenario.name}: query`);
    }
  }
});

test("promoteLearnedSelfArchetype applies the upsert and existing-catalog decision table", async () => {
  const cases = [
    {
      name: "upserts a user-scoped catalog row",
      catalog: () => createCatalog(),
      expected: {
        archetypeId: "charizard+pidgeot",
        label: "Charizard / Pidgeot",
        sprites: ["charizard", "pidgeot"],
        matchCount: 3
      },
      expectedUpsert: true
    },
    {
      name: "skips sprite pairs already in the catalog",
      catalog: () => createCatalogWithKnownArchetype("charizard+pidgeot"),
      expected: null,
      expectedUpsert: false
    }
  ];

  for (const scenario of cases) {
    const { client, queries, upserts } = createFakeSupabaseClient([
      { id: "log-1" },
      { id: "log-2" }
    ]);
    const resolved = await promoteLearnedSelfArchetype({
      supabase: client,
      userId: "user-1",
      sprites: ["charizard", "pidgeot"],
      catalog: scenario.catalog(),
      minimumExistingMatches: 2
    });

    assert.deepEqual(resolved, scenario.expected, scenario.name);
    assert.equal(upserts.length, scenario.expectedUpsert ? 1 : 0, `${scenario.name}: upserts`);
    assert.equal(queries.length, scenario.expectedUpsert ? 2 : 0, `${scenario.name}: queries`);

    if (scenario.expectedUpsert) {
      assert.equal(queries[1].table, "archetype_catalog", `${scenario.name}: table`);
      const operation = queries[1].operations[0];
      assert.equal(operation?.method, "upsert", `${scenario.name}: operation`);
      const [row, options] = operation?.args as [
        { id?: string; canonical_id?: string; user_id?: string; source?: string },
        { onConflict?: string }
      ];
      assert.deepEqual(
        {
          id: row.id,
          canonical_id: row.canonical_id,
          user_id: row.user_id,
          source: row.source
        },
        {
          id: "learned:user-1:charizard+pidgeot",
          canonical_id: "charizard+pidgeot",
          user_id: "user-1",
          source: "learned"
        },
        `${scenario.name}: upsert identity contract`
      );
      assert.deepEqual(options, { onConflict: "id" }, `${scenario.name}: upsert options`);
    }
  }

  const excadrillMetagross = getArchetypeEnrichment("excadrill-mega+metagross");
  assert.deepEqual(excadrillMetagross, {
    label: "Mega Excadrill / Metagross",
    sprites: ["excadrill-mega", "metagross"],
    detectionSprites: ["excadrill-mega", "excadrill", "drilbur", "metagross", "metang", "beldum"],
    requiredMatchGroups: [
      ["excadrill-mega", "excadrill", "drilbur"],
      ["metagross", "metang", "beldum"]
    ]
  });

  const knownCatalog = createCatalogWithKnownArchetype("excadrill-mega+metagross");
  knownCatalog.archetypes.byId.set("excadrill-mega+metagross", {
    id: "excadrill-mega+metagross",
    label: excadrillMetagross.label ?? "",
    sprites: excadrillMetagross.sprites ?? [],
    detectionSprites: excadrillMetagross.detectionSprites ?? [],
    requiredMatchGroups: excadrillMetagross.requiredMatchGroups ?? []
  });
  const { client, queries, upserts } = createFakeSupabaseClient([]);

  const resolvedKnownOrder = await resolveSelfArchetypeForSave({
    supabase: client,
    userId: "user-1",
    sprites: ["metagross", "excadrill-mega"],
    catalog: knownCatalog,
    minimumExistingMatches: 2
  });

  assert.deepEqual(resolvedKnownOrder, {
    archetypeId: "excadrill-mega+metagross",
    label: "Mega Excadrill / Metagross",
    sprites: ["excadrill-mega", "metagross"],
    matchCount: 0
  });
  assert.equal(queries.length, 0, "known catalogue identity does not query prior logs");
  assert.equal(upserts.length, 0, "known catalogue identity is not promoted again");
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
