#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const apply = process.argv.length === 3 && process.argv[2] === "--apply";

if (process.argv.length > (apply ? 3 : 2)) {
  console.error("Usage: node scripts/rehearse-migrations.mjs [--apply]");
  process.exit(2);
}

function requiredEnvironment(name, pattern, description) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not set.`);
  }
  if (!pattern.test(value)) {
    throw new Error(`${name} is not a valid ${description}.`);
  }
  return value;
}

function runSupabase(args, { capture = false, label }) {
  const result = spawnSync("supabase", ["--agent=no", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit"
  });

  if (result.status !== 0) {
    if (capture) {
      if (result.stdout.trim()) process.stdout.write(result.stdout);
      if (result.stderr.trim()) process.stderr.write(result.stderr);
    }
    throw new Error(`${label} failed.`);
  }

  return capture ? result.stdout.trim() : "";
}

function parseBranchDetails(output) {
  let parsed;
  try {
    parsed = JSON.parse(output);
  } catch {
    throw new Error("Supabase branch details were not valid JSON.");
  }

  const details = Array.isArray(parsed) && parsed.length === 1 ? parsed[0] : parsed;
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    throw new Error("Supabase branch details did not identify exactly one branch.");
  }
  return details;
}

function projectRefFromDatabaseUrl(databaseUrl) {
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("POKENOTES_DISPOSABLE_DATABASE_URL is not a valid URL.");
  }

  if (!new Set(["postgres:", "postgresql:"]).has(parsed.protocol)) {
    throw new Error("POKENOTES_DISPOSABLE_DATABASE_URL must use PostgreSQL.");
  }

  const direct = /^db\.([a-z]{20})\.supabase\.co$/.exec(parsed.hostname);
  if (direct) return direct[1];

  const poolerHost = /^[a-z0-9-]+\.pooler\.supabase\.com$/.test(parsed.hostname);
  const poolerUser = /^postgres\.([a-z]{20})$/.exec(decodeURIComponent(parsed.username));
  if (poolerHost && poolerUser) return poolerUser[1];

  throw new Error(
    "Disposable database URL does not expose a supported Supabase project reference."
  );
}

try {
  const parentProjectRef = requiredEnvironment(
    "POKENOTES_PARENT_PROJECT_REF",
    /^[a-z]{20}$/,
    "Supabase parent project reference"
  );
  const branchId = requiredEnvironment(
    "POKENOTES_BRANCH_ID",
    /^[a-zA-Z0-9_-]{8,64}$/,
    "frozen Supabase branch ID"
  );
  const branchRef = requiredEnvironment(
    "POKENOTES_BRANCH_REF",
    /^[a-z]{20}$/,
    "frozen Supabase branch project reference"
  );
  const databaseUrl = process.env.POKENOTES_DISPOSABLE_DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("POKENOTES_DISPOSABLE_DATABASE_URL is not set.");
  }

  const verifyTargetBinding = () => {
    const details = parseBranchDetails(
      runSupabase(
        ["branches", "get", branchId, "--project-ref", parentProjectRef, "-o", "json"],
        { capture: true, label: "Disposable branch identity lookup" }
      )
    );

    if (details.id !== branchId || details.project_ref !== branchRef) {
      throw new Error("Live disposable branch identity does not match the frozen approved record.");
    }

    if (projectRefFromDatabaseUrl(databaseUrl) !== branchRef) {
      throw new Error("Disposable database URL is not bound to the frozen approved branch ref.");
    }

    console.log(`Verified disposable target binding: branch ${branchId}, ref ${branchRef}.`);
  };

  verifyTargetBinding();
  runSupabase(["db", "push", "--db-url", databaseUrl, "--dry-run"], {
    label: "Disposable migration dry run"
  });

  if (!apply) {
    console.log("Dry run complete. Re-run with --apply only after reviewing this exact plan.");
    process.exit(0);
  }

  verifyTargetBinding();
  runSupabase(["db", "push", "--db-url", databaseUrl], {
    label: "Disposable migration apply"
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
