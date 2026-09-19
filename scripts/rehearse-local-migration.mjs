#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";

function usage() {
  console.error(
    "Usage: node scripts/rehearse-local-migration.mjs --from <git-ref> --through <14-digit-version> [--verify <sql-file>]"
  );
}

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!new Set(["--from", "--through", "--verify"]).has(flag) || !value) {
      usage();
      process.exit(2);
    }
    if (values.has(flag)) throw new Error(`${flag} must be supplied once.`);
    values.set(flag, value);
  }

  const from = values.get("--from");
  const through = values.get("--through");
  if (!from || !through) {
    usage();
    process.exit(2);
  }
  if (!/^\d{14}$/.test(through)) {
    throw new Error("--through must be a 14-digit migration version.");
  }

  return { from, through, verify: values.get("--verify") };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? process.cwd(),
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    env: process.env
  });
  if (result.status !== 0) {
    if (options.capture) {
      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
    }
    throw new Error(`${options.label ?? command} failed.`);
  }
  return options.capture ? result.stdout.trim() : "";
}

function git(args, options = {}) {
  return run("git", args, { ...options, capture: true });
}

function supabase(args, workdir, options = {}) {
  return run("supabase", ["--agent=no", "--workdir", workdir, ...args], options);
}

function migrationVersion(path) {
  const match = /(?:^|\/)(\d{14})_[^/]+\.sql$/.exec(path);
  return match?.[1] ?? null;
}

let rehearsalDirectory;
let initialized = false;

try {
  const { from, through, verify } = parseArguments(process.argv.slice(2));
  const repositoryRoot = git(["rev-parse", "--show-toplevel"], { label: "Repository lookup" });
  const reviewedCommit = git(["rev-parse", "--verify", "HEAD^{commit}"], {
    cwd: repositoryRoot,
    label: "Reviewed commit lookup"
  });
  const baselineCommit = git(["rev-parse", "--verify", `${from}^{commit}`], {
    cwd: repositoryRoot,
    label: "Baseline ref lookup"
  });
  const baselineSchema = git(["show", `${baselineCommit}:schema.sql`], {
    cwd: repositoryRoot,
    label: "Baseline schema lookup"
  });
  if (!baselineSchema.trim()) throw new Error("The baseline schema.sql is empty.");

  const changed = git(
    [
      "diff",
      "--name-only",
      "--diff-filter=A",
      `${baselineCommit}..${reviewedCommit}`,
      "--",
      "supabase/migrations/*.sql"
    ],
    { cwd: repositoryRoot, label: "Migration selection" }
  )
    .split("\n")
    .filter(Boolean)
    .map((path) => ({ path, version: migrationVersion(path) }))
    .filter((entry) => entry.version && entry.version <= through)
    .sort((left, right) => left.version.localeCompare(right.version));

  if (!changed.some((entry) => entry.version === through)) {
    throw new Error(
      `Migration ${through} was not added between ${baselineCommit} and HEAD; refusing an ambiguous rehearsal.`
    );
  }

  const verifyPath = verify ? resolve(repositoryRoot, verify) : null;
  const verifyRelative = verifyPath ? relative(repositoryRoot, verifyPath) : null;
  if (verifyRelative && (verifyRelative.startsWith("..") || resolve(repositoryRoot, verifyRelative) !== verifyPath)) {
    throw new Error("--verify must resolve inside the repository.");
  }
  const verificationSql = verifyRelative
    ? git(["show", `${reviewedCommit}:${verifyRelative}`], {
        cwd: repositoryRoot,
        label: "Reviewed verification SQL lookup"
      })
    : null;

  rehearsalDirectory = mkdtempSync(join(tmpdir(), "pokenotes-migration-rehearsal-"));
  supabase(["init", "--force"], rehearsalDirectory, { label: "Local rehearsal initialization" });
  initialized = true;

  const configPath = join(rehearsalDirectory, "supabase", "config.toml");
  const isolatedPorts = new Map([
    [54320, 55320],
    [54321, 55321],
    [54322, 55322],
    [54323, 55323],
    [54324, 55324],
    [54327, 55327],
    [54329, 55329]
  ]);
  let config = readFileSync(configPath, "utf8");
  for (const [defaultPort, rehearsalPort] of isolatedPorts) {
    config = config.replaceAll(String(defaultPort), String(rehearsalPort));
  }
  writeFileSync(configPath, config);

  const migrationsDirectory = join(rehearsalDirectory, "supabase", "migrations");
  mkdirSync(migrationsDirectory, { recursive: true });
  writeFileSync(join(migrationsDirectory, "00000000000000_schema.sql"), `${baselineSchema.trim()}\n`);
  for (const entry of changed) {
    const migrationSql = git(["show", `${reviewedCommit}:${entry.path}`], {
      cwd: repositoryRoot,
      label: `Reviewed migration lookup (${basename(entry.path)})`
    });
    writeFileSync(join(migrationsDirectory, basename(entry.path)), `${migrationSql.trim()}\n`);
  }
  writeFileSync(join(rehearsalDirectory, "supabase", "seed.sql"), "-- no focused verification supplied\n");
  if (verificationSql) {
    writeFileSync(join(rehearsalDirectory, "supabase", "seed.sql"), `${verificationSql.trim()}\n`);
  }

  console.log(`Local target: ${rehearsalDirectory}`);
  console.log(`Pre-change source: ${baselineCommit}`);
  console.log(`Reviewed source: ${reviewedCommit}`);
  console.log(`Applying through: ${through}`);
  console.log(`Selected migrations: ${changed.map((entry) => basename(entry.path)).join(", ")}`);

  supabase(["start", "-x", "studio,imgproxy,mailpit,edge-runtime,logflare,vector,supavisor"], rehearsalDirectory, {
    label: "Local Supabase start"
  });
  supabase(["db", "reset", "--local"], rehearsalDirectory, {
    label: "Pre-change migration rehearsal"
  });
  supabase(["migration", "list", "--local"], rehearsalDirectory, {
    label: "Local migration list"
  });
  supabase(
    ["db", "advisors", "--local", "--type", "security", "--fail-on", "error"],
    rehearsalDirectory,
    { label: "Local security advisors" }
  );
  console.log("Local migration rehearsal passed.");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  if (rehearsalDirectory) {
    if (initialized) {
      try {
        supabase(["stop", "--no-backup"], rehearsalDirectory, {
          label: "Local rehearsal cleanup"
        });
        console.log("Local rehearsal containers and volumes removed.");
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      }
    }
    rmSync(rehearsalDirectory, { recursive: true, force: true });
  }
}
