#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const files = process.argv
  .slice(2)
  .filter((file) => file.startsWith("sql/") && file.endsWith(".sql"));

if (files.length === 0) {
  console.log("No SQL files to deploy.");
  process.exit(0);
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function runSupabase(args, { parseJson = false } = {}) {
  const result = spawnSync("supabase", ["--agent=no", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  if (result.status !== 0) {
    if (result.stdout.trim()) {
      process.stdout.write(result.stdout);
    }
    if (result.stderr.trim()) {
      process.stderr.write(result.stderr);
    }
    throw new Error(`supabase ${args.join(" ")} failed`);
  }

  if (result.stderr.trim()) {
    process.stderr.write(result.stderr);
  }

  if (!parseJson) {
    if (result.stdout.trim()) {
      process.stdout.write(result.stdout);
    }
    return null;
  }

  const output = result.stdout.trim();
  if (!output) {
    return [];
  }

  try {
    return JSON.parse(output);
  } catch {
    const start = output.indexOf("[");
    const end = output.lastIndexOf("]");
    if (start >= 0 && end > start) {
      return JSON.parse(output.slice(start, end + 1));
    }
    throw new Error(`Could not parse Supabase JSON output: ${output}`);
  }
}

function queryJson(sql) {
  return runSupabase(["db", "query", "--linked", "-o", "json", sql], {
    parseJson: true
  });
}

function queryTable(sql) {
  return runSupabase(["db", "query", "--linked", "-o", "table", sql]);
}

function deployFile(file) {
  return runSupabase(["db", "query", "--linked", "-f", file, "-o", "table"]);
}

function sha256ForFile(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function currentCommit() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  });

  return result.status === 0 ? result.stdout.trim() : null;
}

const uniqueFiles = [...new Set(files)].sort();

try {
  queryTable(`
    create schema if not exists codex_private;

    create table if not exists codex_private.sql_deployments (
      path text primary key,
      sha256 text not null,
      git_commit text,
      deployed_at timestamptz not null default now()
    );
  `);

  const gitCommit = currentCommit();

  for (const file of uniqueFiles) {
    if (!existsSync(file)) {
      console.log(`Skipping deleted SQL file: ${file}`);
      continue;
    }

    const sha256 = sha256ForFile(file);
    const rows = queryJson(`
      select sha256
      from codex_private.sql_deployments
      where path = ${sqlString(file)}
      limit 1;
    `);

    if (rows[0]?.sha256 === sha256) {
      console.log(`SQL already deployed: ${file}`);
      continue;
    }

    console.log(`Deploying SQL: ${file}`);
    deployFile(file);

    queryTable(`
      insert into codex_private.sql_deployments (path, sha256, git_commit, deployed_at)
      values (${sqlString(file)}, ${sqlString(sha256)}, ${sqlString(gitCommit ?? "")}, now())
      on conflict (path) do update
      set sha256 = excluded.sha256,
          git_commit = excluded.git_commit,
          deployed_at = excluded.deployed_at;
    `);

    const verifyRows = queryJson(`
      select sha256
      from codex_private.sql_deployments
      where path = ${sqlString(file)}
      limit 1;
    `);

    if (verifyRows[0]?.sha256 !== sha256) {
      throw new Error(`Deployment ledger verification failed for ${file}`);
    }

    console.log(`Deployed and recorded SQL: ${file}`);
  }
} catch (error) {
  console.error("");
  console.error("SQL deployment failed. Push stopped before code reached the remote.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
