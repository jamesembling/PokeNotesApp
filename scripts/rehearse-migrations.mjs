#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertExactMigrationPlan,
  assertNoProtectedPhasedMigrations,
  migrationPhase,
  selectMigrationFilesForPhase
} from "./lib/migration-rehearsal-plan.mjs";

function parseOptions(args) {
  let apply = false;
  let phaseName = null;
  let targetName = "disposable";

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--apply" && !apply) {
      apply = true;
    } else if (argument === "--phase" && !phaseName && args[index + 1]) {
      phaseName = args[index + 1];
      index += 1;
    } else if (argument === "--target" && targetName === "disposable" && args[index + 1]) {
      targetName = args[index + 1];
      index += 1;
    } else {
      throw new Error(
        "Usage: node scripts/rehearse-migrations.mjs [--target disposable|production] [--phase share-phase-one|share-phase-two|coin-stats] [--apply]"
      );
    }
  }

  if (!new Set(["disposable", "production"]).has(targetName)) {
    throw new Error("Migration target must be disposable or production.");
  }
  if (phaseName) migrationPhase(phaseName);
  if (targetName === "production" && !phaseName) {
    throw new Error("Production migration rehearsal requires an explicit reviewed --phase.");
  }
  return { apply, phaseName, targetName };
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

function parseProjectList(output) {
  let parsed;
  try {
    parsed = JSON.parse(output);
  } catch {
    throw new Error("Supabase project list was not valid JSON.");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("Supabase project list did not return an array.");
  }
  return parsed;
}

function requireRegularFile(path, description) {
  let status;
  try {
    status = lstatSync(path);
  } catch {
    throw new Error(`${description} is missing.`);
  }
  if (!status.isFile() || status.isSymbolicLink()) {
    throw new Error(`${description} must be a regular file inside the reviewed checkout.`);
  }
}

function stageMigrationPhase(phaseName) {
  const sourceSupabase = join(process.cwd(), "supabase");
  const sourceMigrations = join(sourceSupabase, "migrations");
  const sourceConfig = join(sourceSupabase, "config.toml");
  requireRegularFile(sourceConfig, "Supabase config");

  const plan = selectMigrationFilesForPhase(phaseName, readdirSync(sourceMigrations));
  const stageRoot = mkdtempSync(join(tmpdir(), "pokenotes-migration-phase-"));
  const stageSupabase = join(stageRoot, "supabase");
  const stageMigrations = join(stageSupabase, "migrations");
  mkdirSync(stageMigrations, { recursive: true });
  copyFileSync(sourceConfig, join(stageSupabase, "config.toml"));

  for (const filename of plan.includedMigrations) {
    const source = join(sourceMigrations, filename);
    requireRegularFile(source, `Migration ${filename}`);
    copyFileSync(source, join(stageMigrations, filename));
  }

  return { ...plan, stageRoot };
}

function databaseTargetFromUrl(databaseUrl, targetLabel = "Disposable database URL") {
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error(`${targetLabel} is not a valid URL.`);
  }

  if (!new Set(["postgres:", "postgresql:"]).has(parsed.protocol)) {
    throw new Error(`${targetLabel} must use PostgreSQL.`);
  }

  const allowedSslModes = new Set(["require", "verify-ca", "verify-full"]);
  for (const [name, value] of parsed.searchParams) {
    if (name !== "sslmode" || !allowedSslModes.has(value)) {
      throw new Error(
        `${targetLabel} contains a query parameter that could alter the approved target.`
      );
    }
  }
  if (parsed.searchParams.getAll("sslmode").length > 1) {
    throw new Error(`${targetLabel} must not repeat TLS query parameters.`);
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
    `${targetLabel} does not expose a supported Supabase project reference.`
  );
}

let stageRoot = null;

try {
  const { apply, phaseName, targetName } = parseOptions(process.argv.slice(2));
  const phase = phaseName ? migrationPhase(phaseName) : null;
  if (phase?.confirmation) {
    const actual = process.env[phase.confirmation.environment]?.trim();
    if (actual !== phase.confirmation.value) {
      const confirmationContext =
        phaseName === "share-phase-two"
          ? "after the application cutover is verified"
          : "after a current data-impact recount is reviewed";
      throw new Error(
        `${phase.confirmation.environment} must be ${phase.confirmation.value} ${confirmationContext}.`
      );
    }
  }

  let databaseUrl;
  let databaseTarget;
  let verifyTargetBinding;

  if (targetName === "production") {
    const productionProjectRef = requiredEnvironment(
      "POKENOTES_PRODUCTION_PROJECT_REF",
      /^[a-z]{20}$/,
      "Supabase production project reference"
    );
    const expectedConfirmation = `approved-production:${phaseName}:${productionProjectRef}`;
    if (process.env.POKENOTES_PRODUCTION_MIGRATION_CONFIRM?.trim() !== expectedConfirmation) {
      throw new Error(
        `POKENOTES_PRODUCTION_MIGRATION_CONFIRM must be ${expectedConfirmation} after separate production approval is recorded.`
      );
    }
    databaseUrl = process.env.POKENOTES_PRODUCTION_DATABASE_URL?.trim();
    if (!databaseUrl) {
      throw new Error("POKENOTES_PRODUCTION_DATABASE_URL is not set.");
    }
    databaseTarget = databaseTargetFromUrl(databaseUrl, "Production database URL");
    if (databaseTarget.projectRef !== productionProjectRef) {
      throw new Error("Production database URL is not bound to the approved production project ref.");
    }
    verifyTargetBinding = () => {
      const projects = parseProjectList(
        runSupabase(["projects", "list", "-o", "json"], {
          capture: true,
          label: "Production project identity lookup",
          redact: databaseTarget.redact
        })
      );
      if (!projects.some((project) => project?.id === productionProjectRef || project?.ref === productionProjectRef)) {
        throw new Error("Live Supabase project list does not contain the approved production project ref.");
      }
      console.log(`Verified production target binding: project ${productionProjectRef}.`);
    };
  } else {
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
    databaseUrl = process.env.POKENOTES_DISPOSABLE_DATABASE_URL?.trim();
    if (!databaseUrl) {
      throw new Error("POKENOTES_DISPOSABLE_DATABASE_URL is not set.");
    }
    databaseTarget = databaseTargetFromUrl(databaseUrl);
    if (databaseTarget.projectRef !== branchRef) {
      throw new Error("Disposable database URL is not bound to the frozen approved branch ref.");
    }
    verifyTargetBinding = () => {
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
  }

  const stagedPlan = phaseName ? stageMigrationPhase(phaseName) : null;
  stageRoot = stagedPlan?.stageRoot ?? null;
  const pushPrefix = stageRoot ? ["--workdir", stageRoot] : [];

  verifyTargetBinding();
  const dryRunOutput = runSupabase(
    [...pushPrefix, "db", "push", "--db-url", databaseUrl, "--dry-run"],
    {
      capture: true,
      label: `${targetName === "production" ? "Production" : "Disposable"} migration dry run`,
      redact: databaseTarget.redact
    }
  );
  forwardRedacted(dryRunOutput ? `${dryRunOutput}\n` : "", process.stdout, databaseTarget.redact);
  if (stagedPlan) {
    assertExactMigrationPlan(dryRunOutput, stagedPlan.pendingMigrations);
    console.log(
      `Verified ${phaseName} migration plan: ${stagedPlan.pendingMigrations.join(", ")}.`
    );
  } else {
    assertNoProtectedPhasedMigrations(dryRunOutput);
  }

  if (!apply) {
    console.log("Dry run complete. Re-run with --apply only after reviewing this exact plan.");
    process.exitCode = 0;
  } else {
    verifyTargetBinding();
    runSupabase([...pushPrefix, "db", "push", "--db-url", databaseUrl], {
      label: `${targetName === "production" ? "Production" : "Disposable"} migration apply`,
      redact: databaseTarget.redact
    });
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  if (stageRoot) {
    rmSync(stageRoot, { recursive: true, force: true });
  }
}
