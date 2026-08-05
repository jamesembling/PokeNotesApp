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

function redactorForDatabaseTarget(databaseUrl, parsedUrl) {
  const secrets = new Set([databaseUrl, parsedUrl.username, parsedUrl.password]);

  for (const value of [parsedUrl.username, parsedUrl.password]) {
    try {
      secrets.add(decodeURIComponent(value));
    } catch {
      // The full URL is still redacted when a credential is not valid percent-encoding.
    }
  }

  const orderedSecrets = [...secrets].filter(Boolean).sort((left, right) => right.length - left.length);
  return (output) => {
    let redacted = output;
    for (const secret of orderedSecrets) {
      redacted = redacted.replaceAll(secret, "[REDACTED]");
    }
    return redacted;
  };
}

function forwardRedacted(output, destination, redact) {
  if (output) destination.write(redact(output));
}

function runSupabase(args, { capture = false, label, redact }) {
  const result = spawnSync("supabase", ["--agent=no", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  if (!capture || result.status !== 0) {
    forwardRedacted(result.stdout, process.stdout, redact);
  }
  forwardRedacted(result.stderr, process.stderr, redact);

  if (result.status !== 0) {
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

function databaseTargetFromUrl(databaseUrl) {
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("POKENOTES_DISPOSABLE_DATABASE_URL is not a valid URL.");
  }

  if (!new Set(["postgres:", "postgresql:"]).has(parsed.protocol)) {
    throw new Error("POKENOTES_DISPOSABLE_DATABASE_URL must use PostgreSQL.");
  }

  const allowedSslModes = new Set(["require", "verify-ca", "verify-full"]);
  for (const [name, value] of parsed.searchParams) {
    if (name !== "sslmode" || !allowedSslModes.has(value)) {
      throw new Error(
        "Disposable database URL contains a query parameter that could alter the approved target."
      );
    }
  }
  if (parsed.searchParams.getAll("sslmode").length > 1) {
    throw new Error("Disposable database URL must not repeat TLS query parameters.");
  }

  const direct = /^db\.([a-z]{20})\.supabase\.co$/.exec(parsed.hostname);
  if (direct) {
    return { projectRef: direct[1], redact: redactorForDatabaseTarget(databaseUrl, parsed) };
  }

  const poolerHost = /^[a-z0-9-]+\.pooler\.supabase\.com$/.test(parsed.hostname);
  const poolerUser = /^postgres\.([a-z]{20})$/.exec(decodeURIComponent(parsed.username));
  if (poolerHost && poolerUser) {
    return { projectRef: poolerUser[1], redact: redactorForDatabaseTarget(databaseUrl, parsed) };
  }

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
  if (branchRef === parentProjectRef) {
    throw new Error("POKENOTES_BRANCH_REF must differ from POKENOTES_PARENT_PROJECT_REF.");
  }
  const databaseUrl = process.env.POKENOTES_DISPOSABLE_DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("POKENOTES_DISPOSABLE_DATABASE_URL is not set.");
  }
  const databaseTarget = databaseTargetFromUrl(databaseUrl);
  if (databaseTarget.projectRef !== branchRef) {
    throw new Error("Disposable database URL is not bound to the frozen approved branch ref.");
  }

  const verifyTargetBinding = () => {
    const details = parseBranchDetails(
      runSupabase(
        ["branches", "get", branchId, "--project-ref", parentProjectRef, "-o", "json"],
        {
          capture: true,
          label: "Disposable branch identity lookup",
          redact: databaseTarget.redact
        }
      )
    );

    if (details.id !== branchId || details.project_ref !== branchRef) {
      throw new Error("Live disposable branch identity does not match the frozen approved record.");
    }

    console.log(`Verified disposable target binding: branch ${branchId}, ref ${branchRef}.`);
  };

  verifyTargetBinding();
  runSupabase(["db", "push", "--db-url", databaseUrl, "--dry-run"], {
    label: "Disposable migration dry run",
    redact: databaseTarget.redact
  });

  if (!apply) {
    console.log("Dry run complete. Re-run with --apply only after reviewing this exact plan.");
    process.exit(0);
  }

  verifyTargetBinding();
  runSupabase(["db", "push", "--db-url", databaseUrl], {
    label: "Disposable migration apply",
    redact: databaseTarget.redact
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
