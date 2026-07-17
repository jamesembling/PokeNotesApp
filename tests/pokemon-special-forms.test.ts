import assert from "node:assert/strict";
import test from "node:test";

type SpecialFormsModule = {
  buildSpecialPokemonCatalogRows: (args?: {
    category?: string;
    lastSyncedAt?: string;
  }) => Array<{
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

test("buildSpecialPokemonCatalogRows includes the supported special-form catalog entries", async () => {
  const { buildSpecialPokemonCatalogRows } = await loadModule();
  const rows = buildSpecialPokemonCatalogRows({ category: "special-form", lastSyncedAt: "2026-04-19T00:00:00.000Z" });
  const slugs = rows.map((row) => row.slug);

  assert.equal(slugs.length, 8);
  assert.deepEqual(new Set(slugs), new Set([
    "ursaluna-bloodmoon",
    "ogerpon-cornerstone",
    "ogerpon-hearthflame",
    "dialga-origin",
    "palkia-origin",
    "ogerpon",
    "ogerpon-wellspring",
    "zoroark-hisui"
  ]));
  assert.equal(rows.find((row) => row.slug === "dialga-origin")?.label, "Origin Forme Dialga");
  assert.equal(rows.find((row) => row.slug === "zoroark-hisui")?.sprite_url, "https://r2.limitlesstcg.net/pokemon/gen9/zoroark-hisui.png");
});

test("buildSpecialPokemonCatalogRows includes current Mega forms", async () => {
  const { buildSpecialPokemonCatalogRows } = await loadModule();
  const rows = buildSpecialPokemonCatalogRows({ category: "mega", lastSyncedAt: "2026-04-19T00:00:00.000Z" });
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
    ["dragalge-mega", "floette-mega", "gallade-mega", "pyroar-mega"].map((slug) => rows.find((row) => row.slug === slug)?.label),
    ["Mega Dragalge", "Mega Floette", "Mega Gallade", "Mega Pyroar"]
  );
  assert.equal(rows.find((row) => row.slug === "dragalge-mega")?.evolves_from, "skrelp");
  assert.equal(rows.find((row) => row.slug === "floette-mega")?.evolves_from, "flabebe");
  assert.equal(rows.find((row) => row.slug === "gallade-mega")?.evolves_from, "kirlia");
  assert.equal(rows.find((row) => row.slug === "pyroar-mega")?.evolves_from, "litleo");
  assert.equal(new Set(rows.map((row) => row.slug)).size, rows.length);
});
