#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync
} from "node:fs";
import { delimiter, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv, parse as parseDotenv } from "dotenv";
import { waitForLocalSchema } from "./local-e2e-readiness.mjs";
import localNetworkHosts from "./local-network-hosts.cjs";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const e2eDir = resolve(rootDir, "tests/e2e");
const migrationDir = resolve(e2eDir, "supabase/migrations");
const generatedMigration = resolve(migrationDir, "00000000000000_schema.sql");
const envFile = resolve(rootDir, ".env.e2e.local");
const supabaseBin = resolve(rootDir, "node_modules/.bin/supabase");
const tsxBin = resolve(rootDir, "node_modules/.bin/tsx");
const nextBin = resolve(rootDir, "node_modules/.bin/next");
const dockerBinDir = "/Applications/Docker.app/Contents/Resources/bin";
const command = process.argv[2] || "status";
const appPort = 3010;
const claudeEmail = "claude@pokenotes.local";
const localSupabaseArgs = ["--workdir", "tests/e2e"];
const excludedServices = [
  "realtime",
  "imgproxy",
  "edge-runtime",
  "logflare",
  "vector",
  "supavisor",
  // CI never opens Studio or reads mail; skipping them avoids pulling about 1.3 GB of images.
  ...(process.env.POKENOTES_E2E_HEADLESS === "1" ? ["studio", "mailpit"] : [])
];
const dbContainer = "supabase_db_pokenotes-e2e";
// The container's /tmp holds the data of the freshly migrated, unseeded database.
const pristineDir = "/tmp/pokenotes-e2e-pristine";
// Every table the app, seed and checks write lives here; cron, net and vault are left as they are.
const fixtureSchemas = ["public", "private", "auth", "storage"];
const restorePristineSql = `
set lock_timeout = '10s';
set session_replication_role = replica;
do $$
declare
  fixture_tables text;
begin
  select string_agg(c.oid::regclass::text, ', ')
  into fixture_tables
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in (${fixtureSchemas.map((name) => `'${name}'`).join(", ")})
    and c.relkind in ('r', 'p')
    and not c.relispartition
    and not exists (
      select 1 from pg_depend d
      where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e'
    );
  execute 'truncate table ' || fixture_tables || ' restart identity';
end $$;
\\i ${pristineDir}/data.sql
notify pgrst, 'reload schema';
`;

const commands = {
  setup,
  reset,
  start,
  stop,
  status,
  dev,
  "save-auth": saveAuth,
  "copy-code": copyCode
};

if (!commands[command]) {
  throw new Error(`Unknown command ${JSON.stringify(command)}. Use setup, reset, start, stop, status, dev, save-auth, or copy-code.`);
}

await commands[command]();

function localEnvironment(extra = {}) {
  return {
    ...process.env,
    PATH: [dockerBinDir, process.env.PATH || ""].filter(Boolean).join(delimiter),
    ...extra
  };
}

function run(binary, args, options = {}) {
  const result = spawnSync(binary, args, {
    cwd: rootDir,
    env: options.env || localEnvironment(),
    encoding: "utf8",
    input: options.input,
    maxBuffer: 64 * 1024 * 1024,
    stdio: options.capture ? [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"] : "inherit"
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`${binary} ${args.join(" ")} failed${detail ? `:\n${detail}` : "."}`);
  }
  return String(result.stdout || "");
}

function ensureDependencies() {
  for (const file of [supabaseBin, tsxBin, nextBin]) {
    if (!existsSync(file)) {
      throw new Error("Local dependencies are missing. Run npm ci first.");
    }
  }
}

function ensureDocker() {
  const docker = existsSync(resolve(dockerBinDir, "docker"))
    ? resolve(dockerBinDir, "docker")
    : "docker";
  const result = spawnSync(docker, ["info", "--format", "{{.ServerVersion}}"], {
    cwd: rootDir,
    env: localEnvironment(),
    encoding: "utf8"
  });
  if (result.status !== 0) {
    throw new Error("Docker Desktop is not running. Open Docker Desktop, wait for the engine, then retry.");
  }
}

function prepareSchema() {
  mkdirSync(migrationDir, { recursive: true });
  const unexpected = readdirSync(migrationDir).filter(
    (name) => name !== "00000000000000_schema.sql"
  );
  if (unexpected.length > 0) {
    throw new Error(`Unexpected files in generated local migration directory: ${unexpected.join(", ")}`);
  }
  cpSync(resolve(rootDir, "schema.sql"), generatedMigration);
}

function supabase(args, options) {
  return run(supabaseBin, [...localSupabaseArgs, ...args], options);
}

function stackStatus() {
  const output = supabase(["status", "--output", "json"], { capture: true });
  return JSON.parse(output);
}

function requireLocalStatusValue(statusValue, names) {
  for (const name of names) {
    const value = statusValue[name];
    if (value) return String(value);
  }
  throw new Error(`Supabase status did not include ${names.join(" or ")}.`);
}

function assertLocalUrl(value) {
  const url = new URL(value);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "54321") {
    throw new Error(`Refusing non-local Supabase URL ${url.origin}.`);
  }
}

function dbExec(args, input) {
  return run("docker", ["exec", "-i", dbContainer, ...args], { capture: true, input });
}

function pgDump(args) {
  // A fixed restrict key keeps repeated dumps byte-identical.
  return dbExec(["pg_dump", "-U", "supabase_admin", "-d", "postgres", "--restrict-key=pokenotese2e", ...args]);
}

function dumpFixtureData() {
  return pgDump(["--data-only", ...fixtureSchemas.map((name) => `--schema=${name}`)]);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function pristineManifest(data) {
  return {
    schema: sha256(readFileSync(generatedMigration)),
    catalog: sha256(pgDump(["--schema-only"])),
    data: sha256(data)
  };
}

// Call only while the database is freshly migrated and unseeded.
function capturePristineSnapshot() {
  const data = dumpFixtureData();
  dbExec(["sh", "-c", `rm -rf ${pristineDir} && mkdir -p ${pristineDir} && cat > ${pristineDir}/data.sql`], data);
  dbExec(["sh", "-c", `cat > ${pristineDir}/manifest.json`], JSON.stringify(pristineManifest(data)));
}

// Returns why the full CLI reset is needed, or null after restoring the pristine data.
function restorePristineSnapshot() {
  let expected;
  try {
    expected = JSON.parse(dbExec(["cat", `${pristineDir}/manifest.json`]));
  } catch {
    return "no pristine snapshot";
  }
  if (expected.schema !== sha256(readFileSync(generatedMigration))) return "schema.sql differs from the snapshot";
  if (expected.catalog !== sha256(pgDump(["--schema-only"]))) return "the database schema changed";
  try {
    dbExec(
      ["psql", "-U", "supabase_admin", "-d", "postgres", "-X", "-q", "-v", "ON_ERROR_STOP=1", "--single-transaction", "-f", "-"],
      restorePristineSql
    );
  } catch (error) {
    const lines = String(error.message).split("\n");
    return `restoring the snapshot failed: ${lines.find((line) => line.includes("ERROR:")) || lines.at(-1)}`;
  }
  if (sha256(dumpFixtureData()) !== expected.data) return "restored data differs from the snapshot";
  return null;
}

function dbVolumeExists() {
  // The CLI names the database volume after its container.
  return spawnSync("docker", ["volume", "inspect", dbContainer], {
    env: localEnvironment(),
    stdio: "ignore"
  }).status === 0;
}

async function start() {
  ensureDependencies();
  ensureDocker();
  prepareSchema();
  const freshDatabase = !dbVolumeExists();
  supabase(["start", "--exclude", excludedServices.join(",")], { capture: true });
  // Seeding is disabled, so a newly created database is already in its pristine state.
  if (freshDatabase) capturePristineSnapshot();
  console.log(excludedServices.includes("studio")
    ? "Local Supabase stack is running at http://127.0.0.1:54321 without Studio."
    : "Local Supabase stack is running at http://127.0.0.1:54321 (Studio: http://127.0.0.1:54323).");
}

async function setup() {
  ensureDependencies();
  ensureDocker();
  const current = spawnSync(supabaseBin, [...localSupabaseArgs, "status"], {
    cwd: rootDir,
    env: localEnvironment(),
    encoding: "utf8"
  });
  if (current.status === 0) {
    supabase(["stop", "--no-backup"]);
  }
  await reset();
}

async function reset() {
  await start();
  // Truncating and restoring the pristine data avoids recreating the database and restarting containers.
  const fullResetReason = restorePristineSnapshot();
  if (fullResetReason) {
    console.log(`Recreating the local database: ${fullResetReason}.`);
    supabase(["db", "reset", "--local", "--no-seed"]);
  } else {
    console.log("Restored the pristine local database without restarting containers.");
  }

  const currentStatus = stackStatus();
  const apiUrl = requireLocalStatusValue(currentStatus, ["API_URL"]);
  const anonKey = requireLocalStatusValue(currentStatus, ["ANON_KEY", "PUBLISHABLE_KEY"]);
  const serviceRoleKey = requireLocalStatusValue(currentStatus, ["SERVICE_ROLE_KEY", "SECRET_KEY"]);
  assertLocalUrl(apiUrl);

  const previousEnvironment = readExistingE2eEnvironment();
  const password = previousEnvironment.POKE_NOTES_TEST_LOGIN_PASSWORD
    || `Local-${randomBytes(18).toString("base64url")}!9`;
  const claudePassword = previousEnvironment.POKE_NOTES_CLAUDE_LOGIN_PASSWORD
    || `Local-${randomBytes(18).toString("base64url")}!9`;
  const pairingCode = previousEnvironment.POKE_NOTES_LOCAL_LOGIN_CODE
    || randomBytes(18).toString("base64url");
  const authClaimsSecret = previousEnvironment.POKENOTES_AUTH_CLAIMS_SECRET
    || randomBytes(32).toString("base64url");
  const seedEnvironment = localEnvironment({
    POKENOTES_E2E_LOCAL: "1",
    NEXT_PUBLIC_SUPABASE_URL: apiUrl,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
    POKE_NOTES_TEST_LOGIN_EMAIL: "e2e@pokenotes.local",
    POKE_NOTES_TEST_LOGIN_PASSWORD: password,
    POKE_NOTES_CLAUDE_LOGIN_EMAIL: claudeEmail,
    POKE_NOTES_CLAUDE_LOGIN_PASSWORD: claudePassword
  });

  console.log("Waiting for the recreated local schema to become readable through PostgREST.");
  await waitForLocalSchema(apiUrl, serviceRoleKey);
  if (fullResetReason) capturePristineSnapshot();
  run(tsxBin, ["scripts/seed-local-e2e.ts"], { env: seedEnvironment });

  const contents = [
    "# Generated by npm run e2e:local:setup. Local-only; do not commit.",
    "POKENOTES_E2E_LOCAL=1",
    `POKENOTES_AUTH_CLAIMS_SECRET=${authClaimsSecret}`,
    `NEXT_PUBLIC_SUPABASE_URL=${apiUrl}`,
    `NEXT_PUBLIC_SUPABASE_ANON_KEY=${anonKey}`,
    `SUPABASE_URL=${apiUrl}`,
    `SUPABASE_SERVICE_ROLE_KEY=${serviceRoleKey}`,
    `NEW_SUPABASE_URL=${apiUrl}`,
    `NEW_SUPABASE_SERVICE_KEY=${serviceRoleKey}`,
    "POKE_NOTES_ENABLE_TEST_LOGIN=1",
    `POKE_NOTES_LOCAL_LOGIN_CODE=${pairingCode}`,
    "POKE_NOTES_LOCAL_LOGIN_HOSTS=localhost:3010,127.0.0.1:3010,[::1]:3010",
    "POKE_NOTES_TEST_LOGIN_EMAIL=e2e@pokenotes.local",
    `POKE_NOTES_TEST_LOGIN_PASSWORD=${password}`,
    `POKE_NOTES_CLAUDE_LOGIN_EMAIL=${claudeEmail}`,
    `POKE_NOTES_CLAUDE_LOGIN_PASSWORD=${claudePassword}`,
    ""
  ].join("\n");

  writeFileSync(envFile, contents, { mode: 0o600 });
  chmodSync(envFile, 0o600);
  console.log("Local E2E database reset and synthetic fixtures loaded.");
  console.log("Start the app with npm run dev:e2e. Credentials remain in .env.e2e.local.");
}

function readExistingE2eEnvironment() {
  if (!existsSync(envFile)) return {};
  const parsed = parseDotenv(readFileSync(envFile));
  if (parsed.POKENOTES_E2E_LOCAL !== "1") return {};
  return parsed;
}

async function stop() {
  ensureDependencies();
  supabase(["stop"]);
}

async function status() {
  ensureDependencies();
  const currentStatus = stackStatus();
  const apiUrl = requireLocalStatusValue(currentStatus, ["API_URL"]);
  assertLocalUrl(apiUrl);
  const studioUrl = currentStatus.STUDIO_URL ? String(currentStatus.STUDIO_URL) : "not started";
  console.log(`Local E2E Supabase is running. API: ${apiUrl}; Studio: ${studioUrl}.`);
}

async function dev() {
  ensureDependencies();
  if (!existsSync(envFile)) {
    throw new Error("Missing .env.e2e.local. Run npm run e2e:local:setup first.");
  }
  loadDotenv({ path: resolve(rootDir, ".env"), override: false });
  loadDotenv({ path: resolve(rootDir, ".env.local"), override: true });
  loadDotenv({ path: envFile, override: true });
  if (process.env.POKENOTES_E2E_LOCAL !== "1") {
    throw new Error("Refusing to start: the E2E local-only marker is missing.");
  }
  assertLocalUrl(String(process.env.NEXT_PUBLIC_SUPABASE_URL || ""));
  // Discovered at start, not stored, because the Mac's Wi-Fi address changes between networks.
  const lanHosts = localNetworkHosts.localNetworkHostnames();
  const loginHosts = new Set([
    ...String(process.env.POKE_NOTES_LOCAL_LOGIN_HOSTS || "").split(",").filter(Boolean),
    ...lanHosts.map((hostname) => `${hostname}:${appPort}`)
  ]);
  if (lanHosts.length > 0) {
    console.log(`On a phone on the same Wi-Fi, open ${lanHosts.map((hostname) => `http://${hostname}:${appPort}`).join(" or ")}.`);
    console.log("Run npm run auth:e2e:copy-code on this Mac and paste the code on the phone (Universal Clipboard).");
  }
  await spawnAndForward(
    nextBin,
    ["dev", "-H", "0.0.0.0", "--port", String(appPort)],
    localEnvironment({ POKE_NOTES_LOCAL_LOGIN_HOSTS: Array.from(loginHosts).join(",") })
  );
}

async function copyCode() {
  const pairingCode = readExistingE2eEnvironment().POKE_NOTES_LOCAL_LOGIN_CODE;
  if (!pairingCode) {
    throw new Error("Missing .env.e2e.local. Run npm run e2e:local:setup first.");
  }
  run("pbcopy", [], { capture: true, input: pairingCode });
  console.log("Local E2E pairing code copied to the macOS clipboard; its value was not printed.");
}

async function saveAuth() {
  if (!existsSync(envFile)) {
    throw new Error("Missing .env.e2e.local. Run npm run e2e:local:setup first.");
  }
  const claude = process.argv.slice(3).includes("--account=claude");
  await spawnAndForward(
    process.execPath,
    [
      "scripts/save-local-auth-state.mjs",
      `--base-url=http://localhost:${appPort}`,
      ...(claude
        ? ["--account=claude", "--state=.agent-browser/pokenotes-e2e-claude-auth.json"]
        : ["--state=.agent-browser/pokenotes-e2e-auth.json"])
    ],
    localEnvironment({ POKENOTES_ENV_FILE: ".env.e2e.local" })
  );
}

function spawnAndForward(binary, args, env) {
  return new Promise((resolveProcess, rejectProcess) => {
    const child = spawn(binary, args, { cwd: rootDir, env, stdio: "inherit" });
    child.once("error", rejectProcess);
    child.once("exit", (code, signal) => {
      if (code === 0) resolveProcess();
      else rejectProcess(new Error(`${binary} exited with ${signal || `code ${code}`}.`));
    });
  });
}
