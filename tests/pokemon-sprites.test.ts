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
