#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { prePushFileSets, remoteMainSha } from "./git-hook-files.mjs";

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
  /^tests\/logs-regression\.test\.ts$/
];

const sqlPatterns = [
  /^sql\/.*\.sql$/,
  /^supabase\/migrations\/.*\.sql$/,
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
    runNpmScript("test", ["tests/logs-regression.test.ts"]);
  }

  if (matchesAny(files, sqlPatterns)) {
    console.log("");
    console.log("SQL/data paths changed. Checking SQL regression tests.");
    runNpmScript("test", [
      "tests/default-privileges.test.ts",
      "tests/first-class-deck-lists-sql.test.ts",
      "tests/log-share-atomic-lifecycle-sql.test.ts",
      "tests/migration-release-runbook.test.ts"
    ]);
  }

  process.exit(0);
}

if (mode === "pre-push") {
  let fileSets;
  try {
    const remoteName = process.argv[3]?.trim();
    const pushLocation = process.argv[4]?.trim();
    const pushTarget = pushLocation || remoteName;
    if (!pushTarget) {
      throw new Error(
        "The push destination is required. Git supplies it automatically; for a manual check run npm run hooks:pre-push -- <push-location>."
      );
    }
    const targetMainSha = remoteMainSha(pushTarget);
    fileSets = prePushFileSets(readFileSync(0, "utf8"), { targetMainSha });
  } catch (error) {
    console.error("Could not determine the pushed changes safely. Push stopped.");
    console.error(error instanceof Error ? error.message : String(error));
    console.error("Ensure the push destination exposes refs/heads/main and retry.");
    process.exit(1);
  }

  const { pushedFiles: files } = fileSets;

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

  if (matchesAny(files, performanceSensitivePatterns)) {
    console.log("");
    console.log("Performance-sensitive paths changed. After deploy, verify with: npm run perf:prod");
  }

  process.exit(0);
}

console.error("Usage: node scripts/git-hooks.mjs <pre-commit|pre-push>");
process.exit(2);
