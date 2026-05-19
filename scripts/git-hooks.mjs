#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const mode = process.argv[2];

function run(command, args, options = {}) {
  console.log(`$ ${[command, ...args].join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: "inherit",
    shell: false,
    ...options
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function output(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
    ...options
  });

  if (result.status !== 0) {
    return "";
  }

  return result.stdout.trim();
}

function lines(value) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function stagedFiles() {
  return lines(output("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMRT"]));
}

function prePushFiles() {
  const input = readFileSync(0, "utf8").trim();
  const changed = new Set();
  const zeroSha = /^0+$/;

  for (const line of lines(input)) {
    const [, localSha, , remoteSha] = line.split(/\s+/);
    if (!localSha || zeroSha.test(localSha)) {
      continue;
    }

    let diffBase = remoteSha;
    if (!remoteSha || zeroSha.test(remoteSha)) {
      diffBase = output("git", ["merge-base", "HEAD", "origin/main"]);
    }

    if (!diffBase) {
      continue;
    }

    for (const file of lines(output("git", ["diff", "--name-only", "--diff-filter=ACMRT", `${diffBase}..${localSha}`]))) {
      changed.add(file);
    }
  }

  if (changed.size > 0) {
    return [...changed].sort();
  }

  const upstreamDiff = output("git", ["diff", "--name-only", "--diff-filter=ACMRT", "@{u}...HEAD"]);
  return lines(upstreamDiff).sort();
}

function matchesAny(files, patterns) {
  return files.some((file) => patterns.some((pattern) => pattern.test(file)));
}

function runNpmScript(script, extraArgs = []) {
  run("npm", ["run", script, "--", ...extraArgs]);
}

const deckListPatterns = [
  /^lib\/deck-lists\//,
  /^lib\/db\/decks\.ts$/,
  /^app\/\(app\)\/decks\/actions\.ts$/,
  /^app\/shared\//,
  /sortedCards/
];

const readModelRoutePatterns = [
  /^app\/\(app\)\/decks\//,
  /^app\/\(app\)\/logs\//,
  /^app\/api\/deck-list\//,
  /^app\/api\/log-detail-context\//,
  /^lib\/db\/(decks|logs|log-linked-deck-list-names)\.ts$/,
  /^tests\/read-model-route-regression\.test\.ts$/
];

const sqlPatterns = [
  /^sql\/.*\.sql$/,
  /^schema\.sql$/,
  /^tests\/.*-sql\.test\.ts$/,
  /^lib\/db\//
];

const buildSensitivePatterns = [
  /^next\.config\./,
  /^package(-lock)?\.json$/,
  /^app\/.*\/(layout|page|route|loading|error|not-found)\.tsx?$/,
  /^app\/api\//,
  /^middleware\.ts$/,
  /^proxy\.ts$/,
  /^lib\/(auth|supabase)\//
];

const performanceSensitivePatterns = [
  /^app\/\(app\)\/layout\.tsx$/,
  /^app\/\(admin\)\/layout\.tsx$/,
  /^app\/\(app\)\/(decks|logs|stats)\//,
  /^app\/api\/performance-events\//,
  /^lib\/db\//,
  /^scripts\/perf-prod\.mjs$/
];

if (mode === "pre-commit") {
  const files = stagedFiles();

  if (files.length === 0) {
    process.exit(0);
  }

  if (matchesAny(files, deckListPatterns)) {
    console.log("");
    console.log("Deck-list visual ordering paths changed. This is a protected user-visible contract.");
    runNpmScript("test", ["tests/deck-list-visual-sort.test.ts"]);
  }

  if (matchesAny(files, readModelRoutePatterns)) {
    console.log("");
    console.log("Read-model route paths changed. Checking first-render route contracts.");
    runNpmScript("test", ["tests/read-model-route-regression.test.ts"]);
  }

  if (matchesAny(files, sqlPatterns)) {
    console.log("");
    console.log("SQL/data paths changed. Checking SQL regression tests.");
    runNpmScript("test", [
      "tests/deck-log-stats-sql.test.ts",
      "tests/archetype-matchup-stats-sql.test.ts"
    ]);
  }

  process.exit(0);
}

if (mode === "pre-push") {
  const files = prePushFiles();

  if (files.length === 0) {
    console.log("No pushed file changes detected.");
    process.exit(0);
  }

  console.log("");
  console.log("Running pre-push quality gate.");
  runNpmScript("lint");
  runNpmScript("typecheck");
  runNpmScript("test");

  if (matchesAny(files, buildSensitivePatterns)) {
    console.log("");
    console.log("Build-sensitive files changed. Running production build.");
    runNpmScript("build");
  }

  const changedSqlFiles = files.filter((file) => /^sql\/.*\.sql$/.test(file));
  if (changedSqlFiles.length > 0) {
    console.log("");
    console.log("SQL files changed. Deploying undeployed SQL to linked Supabase before push.");
    run("node", ["scripts/deploy-changed-sql.mjs", ...changedSqlFiles]);
  }

  if (matchesAny(files, performanceSensitivePatterns)) {
    console.log("");
    console.log("Performance-sensitive paths changed. After deploy, verify with: npm run perf:prod");
  }

  process.exit(0);
}

console.error("Usage: node scripts/git-hooks.mjs <pre-commit|pre-push>");
process.exit(2);
