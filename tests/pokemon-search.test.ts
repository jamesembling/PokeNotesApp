import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRequiredPokemonOptions,
  SEARCH_QUERY_EXPECTATIONS
} from "@/lib/pokemon-catalog/contract";
import {
  findBestPokemonSearchMatch,
  findPokemonSearchMatches
} from "@/lib/pokemon/search";

const options = buildRequiredPokemonOptions();

test("picker search expectations resolve the supported special-form queries", () => {
  SEARCH_QUERY_EXPECTATIONS.forEach((expectation) => {
    const matches = findPokemonSearchMatches(options, expectation.query, 12).map(
      (option) => option.slug
    );
    const bestMatch = findBestPokemonSearchMatch(options, expectation.query)?.slug ?? null;

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
  });
});
