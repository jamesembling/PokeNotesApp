import assert from "node:assert/strict";
import test from "node:test";

type SpecialFormsModule = {
  buildSpecialPokemonCatalogRows: (args?: { category?: string; lastSyncedAt?: string }) => Array<{
    slug: string;
    label: string;
    stage: string;
    evolves_from: string | null;
    sprite_url: string;
    last_synced_at: string;
  }>;
};

async function loadModule(): Promise<SpecialFormsModule> {
  // @ts-expect-error Shared seed helper is authored as an ESM .mjs module.
  return import("../lib/pokemon-catalog/special-forms.mjs") as Promise<SpecialFormsModule>;
}

test("buildSpecialPokemonCatalogRows applies the category and metadata decision table", async () => {
  const { buildSpecialPokemonCatalogRows } = await loadModule();
  const cases = [
    {
      name: "special-form catalog rows",
      category: "special-form",
      expectedCount: 9
    },
    {
      name: "mega catalog rows",
      category: "mega"
    }
  ];

  const rowsByCategory = new Map(
    cases.map((scenario) => {
      const rows = buildSpecialPokemonCatalogRows({
        category: scenario.category,
        lastSyncedAt: "2026-04-19T00:00:00.000Z"
      });
      assert(rows.length > 0, `${scenario.name}: rows exist`);
      if (scenario.expectedCount !== undefined) {
        assert.equal(rows.length, scenario.expectedCount, `${scenario.name}: row count`);
      }
      assert.equal(
        new Set(rows.map((row) => row.slug)).size,
        rows.length,
        `${scenario.name}: unique slugs`
      );
      assert(
        rows.every((row) => row.last_synced_at === "2026-04-19T00:00:00.000Z"),
        `${scenario.name}: sync timestamp`
      );
      return [scenario.category, rows] as const;
    })
  );

  const specialRows = rowsByCategory.get("special-form");
  assert(specialRows);
  const specialSlugs = specialRows.map((row) => row.slug);
  const heatRotom = specialRows.find((row) => row.slug === "rotom-heat");
  assert(heatRotom);
  assert.deepEqual(
    [heatRotom.label, heatRotom.stage, heatRotom.evolves_from, heatRotom.sprite_url],
    ["Heat Rotom", "Basic", null, "https://r2.limitlesstcg.net/pokemon/gen9/rotom-heat.png"]
  );

  assert.equal(specialSlugs.length, 9);
  assert.deepEqual(
    new Set(specialSlugs),
    new Set([
      "ursaluna-bloodmoon",
      "ogerpon-cornerstone",
      "ogerpon-hearthflame",
      "dialga-origin",
      "palkia-origin",
      "ogerpon",
      "ogerpon-wellspring",
      "zoroark-hisui",
      "rotom-heat"
    ])
  );
  assert.equal(
    specialRows.find((row) => row.slug === "dialga-origin")?.label,
    "Origin Forme Dialga"
  );
  assert.equal(
    specialRows.find((row) => row.slug === "zoroark-hisui")?.sprite_url,
    "https://r2.limitlesstcg.net/pokemon/gen9/zoroark-hisui.png"
  );

  const rows = rowsByCategory.get("mega");
  assert(rows);
  const greninja = rows.find((row) => row.slug === "greninja-mega");

  assert(greninja);
  assert.equal(greninja.label, "Mega Greninja");
  assert.equal(greninja.stage, "Stage 2");
  assert.equal(greninja.evolves_from, "frogadier");

  assert(rows.some((row) => row.slug === "lucario-mega"));
  assert(rows.some((row) => row.slug === "venusaur-mega"));
  assert.deepEqual(
    ["darkrai-mega", "delphox-mega", "slowbro-mega", "zeraora-mega"].map(
      (slug) => rows.find((row) => row.slug === slug)?.label
    ),
    ["Mega Darkrai", "Mega Delphox", "Mega Slowbro", "Mega Zeraora"]
  );
  assert.equal(rows.find((row) => row.slug === "delphox-mega")?.evolves_from, "braixen");
  assert.equal(rows.find((row) => row.slug === "slowbro-mega")?.evolves_from, "slowpoke");
  assert.equal(
    rows.find((row) => row.slug === "darkrai-mega")?.sprite_url,
    "https://r2.limitlesstcg.net/pokemon/gen9/darkrai.png"
  );
  assert.equal(
    rows.find((row) => row.slug === "zeraora-mega")?.sprite_url,
    "https://r2.limitlesstcg.net/pokemon/gen9/zeraora.png"
  );
  assert.deepEqual(
    ["dragalge-mega", "floette-mega", "gallade-mega", "pyroar-mega"].map(
      (slug) => rows.find((row) => row.slug === slug)?.label
    ),
    ["Mega Dragalge", "Mega Floette", "Mega Gallade", "Mega Pyroar"]
  );
  assert.equal(rows.find((row) => row.slug === "dragalge-mega")?.evolves_from, "skrelp");
  assert.equal(rows.find((row) => row.slug === "floette-mega")?.evolves_from, "flabebe");
  assert.equal(rows.find((row) => row.slug === "gallade-mega")?.evolves_from, "kirlia");
  assert.equal(rows.find((row) => row.slug === "pyroar-mega")?.evolves_from, "litleo");
  for (const [slug, label, stage, parent, spriteUrl] of [
    [
      "golisopod-mega",
      "Mega Golisopod",
      "Stage 1",
      "wimpod",
      "https://play.pokemonshowdown.com/sprites/gen5/golisopod-mega.png"
    ],
    [
      "golurk-mega",
      "Mega Golurk",
      "Stage 1",
      "golett",
      "https://play.pokemonshowdown.com/sprites/gen5/golurk-mega.png"
    ],
    [
      "malamar-mega",
      "Mega Malamar",
      "Stage 1",
      "inkay",
      "https://r2.limitlesstcg.net/pokemon/gen9/malamar-mega.png"
    ],
    [
      "rayquaza-mega",
      "Mega Rayquaza",
      "Basic",
      null,
      "https://r2.limitlesstcg.net/pokemon/gen9/rayquaza-mega.png"
    ]
  ] as const) {
    const row:
      ReturnType<SpecialFormsModule["buildSpecialPokemonCatalogRows"]>[number] | undefined =
      rows.find((entry) => entry.slug === slug);
    assert(row, `Missing ${label}`);
    assert.deepEqual(
      [row.label, row.stage, row.evolves_from, row.sprite_url],
      [label, stage, parent, spriteUrl]
    );
  }
  assert.equal(new Set(rows.map((row) => row.slug)).size, rows.length);
});
