import assert from "node:assert/strict";
import test from "node:test";
import { buildPokemonNameVariants, stripTrainerPrefix } from "@/lib/log-import/normalization";
import type { PokemonCatalogRow } from "@/lib/log-import/types";

function createRow(slug: string, label: string): PokemonCatalogRow {
  return {
    slug,
    label,
    evolves_from: null,
    sprite_url: "",
    name_de: null,
    name_es: null,
    name_fr: null,
    name_it: null,
    name_pt_br: null
  };
}

test("buildPokemonNameVariants includes origin forme variants", () => {
  const variants = buildPokemonNameVariants(createRow("dialga-origin", "Origin Forme Dialga"));

  assert(variants.includes("origin forme dialga"));
  assert(variants.includes("dialga origin"));
  assert(variants.includes("dialga origin forme"));
});

test("buildPokemonNameVariants includes regional suffix variants", () => {
  const variants = buildPokemonNameVariants(createRow("zoroark-hisui", "Hisuian Zoroark"));

  assert(variants.includes("hisuian zoroark"));
  assert(variants.includes("zoroark hisui"));
});

test("buildPokemonNameVariants includes Mega prefix and suffix variants", () => {
  const variants = buildPokemonNameVariants(createRow("charizard-mega-x", "Mega Charizard X"));

  assert(variants.includes("mega charizard x"));
  assert(variants.includes("charizard mega x"));
});

test("stripTrainerPrefix removes trainer ownership prefixes", () => {
  assert.equal(stripTrainerPrefix("N's Zorua"), "Zorua");
  assert.equal(stripTrainerPrefix("Cynthia's Gabite"), "Gabite");
});
