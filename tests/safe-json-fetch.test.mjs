import assert from "node:assert/strict";
import test from "node:test";
import {
  assertAllowedJsonUrl,
  fetchJsonWithinBoundary
} from "../lib/catalog/safe-json-fetch.mjs";

const boundary = {
  allowedOrigins: ["https://api.example.com"],
  allowedPathPrefixes: ["/v1/catalog"]
};

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
