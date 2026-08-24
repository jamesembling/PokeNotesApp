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

test("Pokemon name normalization applies the variant and trainer-prefix decision table", () => {
  const variantCases = [
    {
      name: "origin forme variants",
      row: createRow("dialga-origin", "Origin Forme Dialga"),
      expected: ["origin forme dialga", "dialga origin", "dialga origin forme"]
    },
    {
      name: "regional suffix variants",
      row: createRow("zoroark-hisui", "Hisuian Zoroark"),
      expected: ["hisuian zoroark", "zoroark hisui"]
    },
    {
      name: "Mega prefix and suffix variants",
      row: createRow("charizard-mega-x", "Mega Charizard X"),
      expected: ["mega charizard x", "charizard mega x"]
    }
  ];

  for (const scenario of variantCases) {
    const variants = buildPokemonNameVariants(scenario.row);
    for (const expected of scenario.expected) {
      assert(variants.includes(expected), `${scenario.name}: ${expected}`);
    }
  }

  const trainerPrefixCases = [
    ["N's Zorua", "Zorua"],
    ["Cynthia's Gabite", "Gabite"]
  ] as const;

  for (const [input, expected] of trainerPrefixCases) {
    assert.equal(stripTrainerPrefix(input), expected, `trainer prefix: ${input}`);
  }
});
