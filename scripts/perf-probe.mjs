#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const DEFAULT_PATHS = [
  "/decks",
  "/logs",
  "/api/deck-selection-options",
  "/api/stats-matchups"
];

const THRESHOLDS = {
  parseMs: 100,
  payloadBytes: 200 * 1024,
  ttfbMs: 500
};

const args = parseArgs(process.argv.slice(2));

if (args.flags.has("--help") || args.flags.has("-h")) {
  console.log(`Usage:
  npm run perf:probe
  npm run perf:probe -- --base-url=http://localhost:3000 --path=/decks --path=/logs
  npm run perf:probe -- --url=http://localhost:3000/api/stats-matchups

Options:
  --base-url=http://localhost:3000  Base URL used with --path values.
  --path=/decks                    Path to probe. Can be repeated.
  --url=http://...                  Full URL to probe. Can be repeated.
  --header='Name: value'            Request header. Can be repeated.
  --cookie='name=value; ...'        Cookie header for authenticated probes.
  --method=GET                      HTTP method. Defaults to GET.
  --repeat=1                        Number of times to probe each target.
  --out=.perf/probe                 Save response bodies for inspection.

Notes:
  Page routes such as /decks and /logs are reported as HTML/page probes.
  JSON parse time and item counts are only reported for JSON responses.
`);
  process.exit(0);
}

const baseUrl = String(readSingle("--base-url") || process.env.PERF_PROBE_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const method = String(readSingle("--method") || "GET").toUpperCase();
const repeat = Math.max(1, Number(readSingle("--repeat") || 1));
const outDir = readSingle("--out");
const headers = buildHeaders(args.multi.get("--header") || []);
const cookie = readSingle("--cookie") || process.env.PERF_PROBE_COOKIE;

if (cookie) {
  headers.Cookie = String(cookie);
}

const explicitUrls = args.multi.get("--url") || [];
const paths = args.multi.get("--path") || [];
const targets = [
  ...explicitUrls.map((url) => String(url)),
  ...(paths.length > 0 ? paths : DEFAULT_PATHS).map((path) => new URL(String(path), baseUrl).toString())
];

console.log("Route/API performance probe");
console.log(`method: ${method}`);
console.log(`repeat: ${repeat}`);
console.log(`targets: ${targets.length}`);
console.log("");

const rows = [];
for (const target of targets) {
  for (let attempt = 1; attempt <= repeat; attempt += 1) {
    const result = await probeUrl(target, { headers, method });
    if (outDir) {
      const filename = buildBodyFilename(target, attempt, result.contentType);
      const outputPath = resolve(rootDir, outDir, filename);
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, result.body);
      result.savedBody = outputPath;
    }
    rows.push({ ...result, attempt });
  }
}

printRows(rows);

const flagged = rows.filter((row) => row.flags.length > 0);
if (flagged.length > 0) {
  console.log("");
  console.log("Flags");
  for (const row of flagged) {
    console.log(`${row.label} #${row.attempt}: ${row.flags.join(", ")}`);
  }
}

function parseArgs(rawArgs) {
  const parsed = {
    flags: new Set(),
    multi: new Map()
  };

  for (const arg of rawArgs) {
    if (!arg.startsWith("--") || !arg.includes("=")) {
      parsed.flags.add(arg);
      continue;
    }

    const [key, ...rest] = arg.split("=");
    const value = rest.join("=");
    const existing = parsed.multi.get(key) || [];
    existing.push(value);
    parsed.multi.set(key, existing);
  }

  return parsed;
}

function readSingle(key) {
  const values = args.multi.get(key);
  return values?.[values.length - 1];
}

function buildHeaders(headerArgs) {
  const parsedHeaders = {};

  for (const header of headerArgs) {
    const separator = String(header).indexOf(":");
    if (separator === -1) {
      throw new Error(`Invalid --header value "${header}". Use "Name: value".`);
    }

    const name = String(header).slice(0, separator).trim();
    const value = String(header).slice(separator + 1).trim();
    if (name) {
      parsedHeaders[name] = value;
    }
  }

  return parsedHeaders;
}

function probeUrl(target, options) {
  return new Promise((resolveResult, reject) => {
    const url = new URL(target);
    const requestFn = url.protocol === "https:" ? httpsRequest : httpRequest;
    const startedAt = performance.now();
    let firstByteAt = null;
    const chunks = [];

    const req = requestFn(
      url,
      {
        headers: options.headers,
        method: options.method
      },
      (res) => {
        res.on("data", (chunk) => {
          if (firstByteAt === null) {
            firstByteAt = performance.now();
          }
          chunks.push(chunk);
        });

        res.on("end", () => {
          const endedAt = performance.now();
          const body = Buffer.concat(chunks);
          const contentType = String(res.headers["content-type"] || "");
          const result = buildResult({
            body,
            contentType,
            durationMs: endedAt - startedAt,
            statusCode: res.statusCode || 0,
            target,
            ttfbMs: (firstByteAt || endedAt) - startedAt
          });

          resolveResult(result);
        });
      }
    );

    req.on("error", reject);
    req.end();
  });
}

function buildResult({ body, contentType, durationMs, statusCode, target, ttfbMs }) {
  const isJson = /\bjson\b/i.test(contentType);
  const result = {
    body,
    bytes: body.byteLength,
    contentType: contentType.split(";")[0] || "-",
    durationMs: Math.round(durationMs),
    flags: [],
    itemCount: "-",
    label: labelFor(target),
    parseMs: "-",
    statusCode,
    target,
    ttfbMs: Math.round(ttfbMs),
    type: responseType(contentType)
  };

  if (isJson && body.byteLength > 0) {
    const parseStartedAt = performance.now();
    try {
      const parsed = JSON.parse(body.toString("utf8"));
      result.parseMs = Math.round(performance.now() - parseStartedAt);
      result.itemCount = countJsonItems(parsed);
    } catch {
      result.parseMs = "invalid";
    }
  }

  if (result.ttfbMs > THRESHOLDS.ttfbMs) {
    result.flags.push(`TTFB>${THRESHOLDS.ttfbMs}ms`);
  }
  if (result.bytes > THRESHOLDS.payloadBytes) {
    result.flags.push(`payload>${Math.round(THRESHOLDS.payloadBytes / 1024)}KB`);
  }
  if (typeof result.parseMs === "number" && result.parseMs > THRESHOLDS.parseMs) {
    result.flags.push(`parse>${THRESHOLDS.parseMs}ms`);
  }
  if (statusCode >= 300) {
    result.flags.push(`HTTP ${statusCode}`);
  }

  return result;
}

function responseType(contentType) {
  if (/\bjson\b/i.test(contentType)) {
    return "json";
  }
  if (/\bhtml\b/i.test(contentType)) {
    return "page";
  }
  return "other";
}

function countJsonItems(value) {
  if (Array.isArray(value)) {
    return value.length;
  }
  if (value && typeof value === "object") {
    return Object.keys(value).length;
  }
  return 1;
}

function labelFor(target) {
  const url = new URL(target);
  return `${url.pathname}${url.search}`;
}

function buildBodyFilename(target, attempt, contentType) {
  const label = labelFor(target)
    .replace(/^\//, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "") || "root";
  const extension = /\bjson\b/i.test(contentType) ? "json" : "txt";
  return `${label}-${attempt}.${extension}`;
}

function printRows(rows) {
  const columns = [
    ["target", (row) => row.label],
    ["type", (row) => row.type],
    ["http", (row) => row.statusCode],
    ["ttfb", (row) => row.ttfbMs],
    ["bytes", (row) => row.bytes],
    ["items", (row) => row.itemCount],
    ["parse", (row) => row.parseMs],
    ["total", (row) => row.durationMs]
  ];

  const widths = Object.fromEntries(
    columns.map(([name, getter]) => [
      name,
      Math.max(name.length, ...rows.map((row) => String(getter(row)).length))
    ])
  );

  console.log(
    columns
      .map(([name]) => name.padEnd(widths[name]))
      .join("  ")
  );
  console.log(
    columns
      .map(([name]) => "-".repeat(widths[name]))
      .join("  ")
  );

  for (const row of rows) {
    console.log(
      columns
        .map(([name, getter]) => String(getter(row)).padEnd(widths[name]))
        .join("  ")
    );
  }
}
