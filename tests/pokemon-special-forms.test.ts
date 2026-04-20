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

test("buildSpecialPokemonCatalogRows includes Mega Greninja alongside existing Mega forms", async () => {
  const { buildSpecialPokemonCatalogRows } = await loadModule();
  const rows = buildSpecialPokemonCatalogRows({ category: "mega", lastSyncedAt: "2026-04-19T00:00:00.000Z" });
  const greninja = rows.find((row) => row.slug === "greninja-mega");

  assert(greninja);
  assert.equal(greninja.label, "Mega Greninja");
  assert.equal(greninja.stage, "Stage 2");
  assert.equal(greninja.evolves_from, "frogadier");

  assert(rows.some((row) => row.slug === "lucario-mega"));
  assert(rows.some((row) => row.slug === "venusaur-mega"));
  assert.equal(new Set(rows.map((row) => row.slug)).size, rows.length);
});
