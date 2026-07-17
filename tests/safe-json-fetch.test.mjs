import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assertAllowedJsonUrl,
  fetchJsonWithinBoundary
} from "../lib/catalog/safe-json-fetch.mjs";
import {
  assertUsableCardCatalog,
  normalizeCardCatalogSetId,
  recordUniqueCardIds
} from "../lib/card-effect-catalog/sync.mjs";
import {
  assertEvolutionStageMapContains,
  assertSpeciesPayloadIdentity,
  assertUsablePokemonCatalog,
  recordUniqueSpeciesSummaries
} from "../lib/pokemon-catalog/sync.mjs";

const boundary = {
  allowedOrigins: ["https://api.example.com"],
  allowedPathPrefixes: ["/v1/catalog"]
};

const pokemonSyncSource = readFileSync(
  new URL("../lib/pokemon-catalog/sync.mjs", import.meta.url),
  "utf8"
);
const cardSyncSource = readFileSync(
  new URL("../lib/card-effect-catalog/sync.mjs", import.meta.url),
  "utf8"
);

test("accepts only HTTPS URLs on an exact origin and approved path", () => {
  assert.equal(
    assertAllowedJsonUrl("https://api.example.com/v1/catalog?page=1", boundary).toString(),
    "https://api.example.com/v1/catalog?page=1"
  );

  for (const value of [
    "http://api.example.com/v1/catalog",
    "https://api.example.com:444/v1/catalog",
    "https://user:password@api.example.com/v1/catalog",
    "https://api.example.com/v1/catalog#fragment",
    "https://api.example.com/v2/catalog",
    "https://api.example.com/v1/catalog-evil",
    "https://attacker.example/v1/catalog"
  ]) {
    assert.throws(() => assertAllowedJsonUrl(value, boundary), /allowlist/);
  }
});

test("both catalog syncs route network JSON through the shared boundary", () => {
  for (const source of [pokemonSyncSource, cardSyncSource]) {
    assert.match(source, /fetchJsonWithinBoundary/);
    assert.doesNotMatch(source, /await fetch\s*\(/);
  }
});

test("passes a timeout signal, disables redirects, and parses bounded JSON", async () => {
  let requestOptions;
  const payload = await fetchJsonWithinBoundary("https://api.example.com/v1/catalog", {
    ...boundary,
    fetchImpl: async (_url, options) => {
      requestOptions = options;
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "content-type": "application/json" },
        status: 200
      });
    },
    maxResponseBytes: 100,
    timeoutMs: 1_000
  });

  assert.deepEqual(payload, { ok: true });
  assert.equal(requestOptions.redirect, "error");
  assert.equal(requestOptions.signal instanceof AbortSignal, true);
});

test("rejects a response whose declared length exceeds the boundary", async () => {
  await assert.rejects(
    fetchJsonWithinBoundary("https://api.example.com/v1/catalog", {
      ...boundary,
      fetchImpl: async () =>
        new Response("{}", {
          headers: { "content-length": "101" },
          status: 200
        }),
      maxResponseBytes: 100
    }),
    /size limit/
  );
});

test("rejects streamed content that exceeds the boundary", async () => {
  await assert.rejects(
    fetchJsonWithinBoundary("https://api.example.com/v1/catalog", {
      ...boundary,
      fetchImpl: async () => new Response(JSON.stringify({ value: "too large" })),
      maxResponseBytes: 5
    }),
    /size limit/
  );
});

test("rejects malformed JSON without returning its content", async () => {
  await assert.rejects(
    fetchJsonWithinBoundary("https://api.example.com/v1/catalog", {
      ...boundary,
      fetchImpl: async () => new Response("not-json"),
      maxResponseBytes: 100
    }),
    /not valid JSON/
  );
});

test("aborts an upstream request that exceeds the timeout", async () => {
  await assert.rejects(
    fetchJsonWithinBoundary("https://api.example.com/v1/catalog", {
      ...boundary,
      fetchImpl: async (_url, { signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
      timeoutMs: 5
    }),
    { name: "AbortError" }
  );
});

test("blocks destructive card-catalog publication for empty or incomplete runs", () => {
  assert.throws(
    () => assertUsableCardCatalog({ cardCount: 0, expectedCardCount: 0, prepared: 0 }),
    /destructive publication was stopped/
  );
  assert.throws(
    () => assertUsableCardCatalog({ cardCount: 25, expectedCardCount: 25, prepared: 0 }),
    /destructive publication was stopped/
  );
  assert.throws(
    () => assertUsableCardCatalog({ cardCount: 24, expectedCardCount: 25, prepared: 8 }),
    /destructive publication was stopped/
  );
  assert.doesNotThrow(() =>
    assertUsableCardCatalog({ cardCount: 25, expectedCardCount: 25, prepared: 8 })
  );
});

test("catalog completeness counts unique valid card identities rather than page entries", () => {
  const seenCardIds = new Set();
  recordUniqueCardIds(
    [
      { id: "sv1-1", name: "Card One" },
      { id: "sv1-2", name: "Card Two" }
    ],
    seenCardIds
  );

  assert.deepEqual([...seenCardIds], ["sv1-1", "sv1-2"]);
  assert.throws(
    () => recordUniqueCardIds([{ id: "sv1-1", name: "Repeated" }], seenCardIds),
    /missing or repeated/
  );
  assert.throws(
    () => recordUniqueCardIds([{ id: "", name: "Missing id" }], new Set()),
    /missing or repeated/
  );
  assert.throws(
    () => recordUniqueCardIds([{ id: "sv1-3", name: "" }], new Set()),
    /missing or repeated/
  );
});

test("set-scoped card catalog sync accepts only canonical set ids", () => {
  assert.equal(normalizeCardCatalogSetId(" ME5 "), "me5");
  assert.equal(normalizeCardCatalogSetId(""), null);
  assert.throws(() => normalizeCardCatalogSetId("me5*"), /letters and numbers/);
});

test("retains the current Pokemon catalog when an upstream run has no usable species", () => {
  assert.throws(
    () => assertUsablePokemonCatalog({ speciesCount: 0, preparedSpeciesCount: 0 }),
    /existing catalog was retained/
  );
  assert.throws(
    () => assertUsablePokemonCatalog({ speciesCount: 25, preparedSpeciesCount: 0 }),
    /existing catalog was retained/
  );
  assert.doesNotThrow(() =>
    assertUsablePokemonCatalog({ speciesCount: 25, preparedSpeciesCount: 24 })
  );
});

test("Pokemon catalog pages require unique complete species identities", () => {
  const names = new Set();
  const urls = new Set();
  recordUniqueSpeciesSummaries(
    [
      { name: "bulbasaur", url: "https://pokeapi.co/api/v2/pokemon-species/1/" },
      { name: "ivysaur", url: "https://pokeapi.co/api/v2/pokemon-species/2/" }
    ],
    names,
    urls
  );

  assert.equal(names.size, 2);
  assert.throws(
    () =>
      recordUniqueSpeciesSummaries(
        [{ name: "bulbasaur", url: "https://pokeapi.co/api/v2/pokemon-species/1/" }],
        names,
        urls
      ),
    /missing or repeated/
  );
  assert.throws(
    () => recordUniqueSpeciesSummaries([{ name: "", url: "" }], new Set(), new Set()),
    /missing or repeated/
  );
});

test("Pokemon catalog candidates reject malformed evolution-chain payloads", () => {
  assert.doesNotThrow(() =>
    assertEvolutionStageMapContains(new Map([["bulbasaur", { stage: "Basic" }]]), "bulbasaur")
  );
  assert.throws(
    () => assertEvolutionStageMapContains(new Map(), "bulbasaur"),
    /invalid evolution-chain payload/
  );
});

test("Pokemon species details must match their list identity", () => {
  const summary = {
    name: "bulbasaur",
    url: "https://pokeapi.co/api/v2/pokemon-species/1/"
  };

  assert.doesNotThrow(() =>
    assertSpeciesPayloadIdentity(summary, { id: 1, name: "bulbasaur" })
  );
  assert.throws(
    () => assertSpeciesPayloadIdentity(summary, { id: 2, name: "ivysaur" }),
    /identities did not match/
  );
  assert.throws(
    () => assertSpeciesPayloadIdentity(summary, { id: 2, name: "bulbasaur" }),
    /identities did not match/
  );
});
