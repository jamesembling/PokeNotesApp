import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPokemonSpriteUrlFromSlug,
  buildSelectableSpriteOptions,
  resolvePokemonSpriteSlug
} from "@/lib/pokemon/sprites";

test("resolvePokemonSpriteSlug applies the trainer, standard, and variant decision table", () => {
  const cases = [
    ["trainer prefix with ex suffix", "Lillie's Clefairy ex", "clefairy"],
    ["trainer prefix", "N's Zorua", "zorua"],
    ["additional trainer prefix", "Cynthia's Gabite", "gabite"],
    ["standard name with ex suffix", "Clefairy ex", "clefairy"]
  ] as const;

  for (const [name, input, expected] of cases) {
    assert.equal(resolvePokemonSpriteSlug(input), expected, `${name}: ${input}`);
  }
});

test("resolvePokemonSpriteSlug resolves special forms and Mega variants", () => {
  const cases: Array<[string, string]> = [
    ["Cornerstone Mask Ogerpon ex", "ogerpon-cornerstone"],
    ["Wellspring Mask Ogerpon ex", "ogerpon-wellspring"],
    ["Hearthflame Mask Ogerpon ex", "ogerpon-hearthflame"],
    ["Bloodmoon Ursaluna ex", "ursaluna-bloodmoon"],
    ["Origin Forme Dialga VSTAR", "dialga-origin"],
    ["Dialga Origin", "dialga-origin"],
    ["Origin Forme Palkia VSTAR", "palkia-origin"],
    ["Palkia Origin", "palkia-origin"],
    ["Hisuian Zoroark VSTAR", "zoroark-hisui"],
    ["Zoroark Hisui", "zoroark-hisui"],
    ["Mega Charizard X", "charizard-mega-x"],
    ["Mega Charizard Y", "charizard-mega-y"],
    ["Charizard Mega X", "charizard-mega-x"],
    ["Mega Absol", "absol-mega"],
    ["Mega Audino", "audino-mega"],
    ["Mega Chandelure", "chandelure-mega"],
    ["Mega Darkrai", "darkrai-mega"],
    ["Mega Delphox", "delphox-mega"],
    ["Mega Diancie", "diancie-mega"],
    ["Mega Excadrill", "excadrill-mega"],
    ["Mega Greninja", "greninja-mega"],
    ["Mega Heracross", "heracross-mega"],
    ["Mega Hawlucha", "hawlucha-mega"],
    ["Mega Kangaskhan", "kangaskhan-mega"],
    ["Mega Latias", "latias-mega"],
    ["Mega Mawile", "mawile-mega"],
    ["Mega Pyroar", "pyroar-mega"],
    ["Mega Floette", "floette-mega"],
    ["Mega Dragalge", "dragalge-mega"],
    ["Mega Skarmory", "skarmory-mega"],
    ["Mega Slowbro", "slowbro-mega"],
    ["Mega Zygarde", "zygarde-mega"],
    ["Mega Zeraora", "zeraora-mega"],
    ["Pyroar Mega", "pyroar-mega"],
    ["Floette Mega", "floette-mega"],
    ["Dragalge Mega", "dragalge-mega"],
  ];

  cases.forEach(([name, slug]) => {
    assert.equal(resolvePokemonSpriteSlug(name), slug, `Expected ${name} -> ${slug}`);
  });
});

test("curated sprite assets resolve directly and appear in selectable options", () => {
  const urlCases = [
    ["lowercase curated asset slug", "crushing-hammer", "/pixelated-hammer-sprite-transparent.png"],
    ["case-insensitive curated asset slug", "Crushing-Hammer", "/pixelated-hammer-sprite-transparent.png"],
    ["Mega Darkrai sprite asset", "darkrai-mega", "https://r2.limitlesstcg.net/pokemon/gen9/darkrai.png"],
    ["Mega Zeraora sprite asset", "zeraora-mega", "https://r2.limitlesstcg.net/pokemon/gen9/zeraora.png"]
  ] as const;

  for (const [name, slug, expectedUrl] of urlCases) {
    assert.equal(buildPokemonSpriteUrlFromSlug(slug), expectedUrl, name);
  }

  const options = buildSelectableSpriteOptions([
    {
      slug: "dragapult",
      label: "Dragapult",
      spriteUrl: "https://example.com/dragapult.png"
    }
  ]);

  assert.deepEqual(
    options.map((option) => option.slug),
    ["dragapult", "crushing-hammer"]
  );
  assert.equal(options.find((option) => option.slug === "crushing-hammer")?.label, "Crushing Hammer");
});
