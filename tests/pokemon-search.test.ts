import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRequiredPokemonOptions,
  SEARCH_QUERY_EXPECTATIONS
} from "@/lib/pokemon-catalog/contract";
import {
  buildPokemonSearchIndex,
  findBestPokemonSearchMatch,
  findBestPokemonSearchMatchInIndex,
  findPokemonSearchMatches,
  findPokemonSearchMatchesInIndex
} from "@/lib/pokemon/search";

const options = buildRequiredPokemonOptions();
const index = buildPokemonSearchIndex(options);

test("picker search expectations resolve the supported special-form queries", () => {
  SEARCH_QUERY_EXPECTATIONS.forEach((expectation) => {
    const matches = findPokemonSearchMatches(options, expectation.query, 12).map(
      (option) => option.slug
    );
    const indexedMatches = findPokemonSearchMatchesInIndex(index, expectation.query, 12).map(
      (option) => option.slug
    );
    const bestMatch = findBestPokemonSearchMatch(options, expectation.query)?.slug ?? null;
    const indexedBestMatch = findBestPokemonSearchMatchInIndex(index, expectation.query)?.slug ?? null;

    expectation.expectedSlugs.forEach((slug) => {
      assert(
        matches.includes(slug),
        `Expected query "${expectation.query}" to include ${slug}, got ${matches.join(", ")}`
      );
    });

    assert.equal(
      bestMatch,
      expectation.bestMatch,
      `Expected query "${expectation.query}" to best-match ${expectation.bestMatch ?? "null"}`
    );
    assert.deepEqual(indexedMatches, matches);
    assert.equal(indexedBestMatch, bestMatch);
  });
});
