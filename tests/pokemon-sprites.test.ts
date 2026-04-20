import assert from "node:assert/strict";
import test from "node:test";
import { resolvePokemonSpriteSlug } from "@/lib/pokemon/sprites";

test("resolvePokemonSpriteSlug strips trainer prefixes from trainer Pokemon cards", () => {
  assert.equal(resolvePokemonSpriteSlug("Lillie's Clefairy ex"), "clefairy");
  assert.equal(resolvePokemonSpriteSlug("N's Zorua"), "zorua");
});

test("resolvePokemonSpriteSlug keeps standard Pokemon names intact", () => {
  assert.equal(resolvePokemonSpriteSlug("Clefairy ex"), "clefairy");
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
    ["Mega Greninja", "greninja-mega"],
  ];

  cases.forEach(([name, slug]) => {
    assert.equal(resolvePokemonSpriteSlug(name), slug, `Expected ${name} -> ${slug}`);
  });
});

test("resolvePokemonSpriteSlug strips trainer prefixes from additional trainer Pokemon cards", () => {
  assert.equal(resolvePokemonSpriteSlug("Cynthia's Gabite"), "gabite");
  assert.equal(resolvePokemonSpriteSlug("N's Darmanitan"), "darmanitan");
});
