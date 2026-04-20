import assert from "node:assert/strict";
import test from "node:test";
import {
  DISALLOWED_POKEMON_OPTION_LABELS,
  DISALLOWED_POKEMON_OPTION_SLUGS,
  getRequiredPokemonCatalogEntries,
  SEARCH_QUERY_EXPECTATIONS
} from "@/lib/pokemon-catalog/contract";
import { getSpecialPokemonForms } from "@/lib/pokemon-catalog/special-forms.mjs";

test("required catalog contract mirrors the supported special-form source list", () => {
  const requiredEntries = getRequiredPokemonCatalogEntries();
  const specialForms = getSpecialPokemonForms();

  assert.equal(requiredEntries.length, specialForms.length);
  assert.deepEqual(
    requiredEntries.map((entry) => entry.slug).sort(),
    specialForms.map((entry) => entry.slug).sort()
  );
});

test("catalog contract does not allow alias rows to overlap with canonical entries", () => {
  const requiredEntries = getRequiredPokemonCatalogEntries();
  const requiredSlugs = new Set(requiredEntries.map((entry) => entry.slug));
  const requiredLabels = new Set(requiredEntries.map((entry) => entry.label));

  DISALLOWED_POKEMON_OPTION_SLUGS.forEach((slug) => {
    assert.equal(requiredSlugs.has(slug), false, `Did not expect ${slug} to be a canonical slug`);
  });

  DISALLOWED_POKEMON_OPTION_LABELS.forEach((label) => {
    assert.equal(
      requiredLabels.has(label),
      false,
      `Did not expect ${label} to be a canonical picker label`
    );
  });
});

test("search expectations only reference canonical supported slugs", () => {
  const requiredSlugs = new Set(getRequiredPokemonCatalogEntries().map((entry) => entry.slug));

  SEARCH_QUERY_EXPECTATIONS.forEach((expectation) => {
    expectation.expectedSlugs.forEach((slug) => {
      assert(
        requiredSlugs.has(slug),
        `Expected query fixture "${expectation.query}" to reference a canonical slug`
      );
    });

    if (expectation.bestMatch) {
      assert(
        requiredSlugs.has(expectation.bestMatch),
        `Expected best match for "${expectation.query}" to be canonical`
      );
    }
  });
});
