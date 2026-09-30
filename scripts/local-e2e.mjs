#!/usr/bin/env node

import { randomBytes } from "node:crypto";
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
const localSupabaseArgs = ["--workdir", "tests/e2e"];

const commands = {
  setup,
  reset,
  start,
  stop,
  status,
  dev,
  "save-auth": saveAuth
};

if (!commands[command]) {
  throw new Error(`Unknown command ${JSON.stringify(command)}. Use setup, reset, start, stop, status, dev, or save-auth.`);
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
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit"
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

async function start() {
  ensureDependencies();
  ensureDocker();
  prepareSchema();
  supabase([
    "start",
    "--exclude",
    "realtime,storage-api,imgproxy,edge-runtime,logflare,vector,supavisor"
  ], { capture: true });
  console.log("Local Supabase stack is running at http://127.0.0.1:54321 (Studio: http://127.0.0.1:54323)." );
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
  supabase(["db", "reset", "--local", "--no-seed"]);

  const currentStatus = stackStatus();
  const apiUrl = requireLocalStatusValue(currentStatus, ["API_URL"]);
  const anonKey = requireLocalStatusValue(currentStatus, ["ANON_KEY", "PUBLISHABLE_KEY"]);
  const serviceRoleKey = requireLocalStatusValue(currentStatus, ["SERVICE_ROLE_KEY", "SECRET_KEY"]);
  assertLocalUrl(apiUrl);

  const previousEnvironment = readExistingE2eEnvironment();
  const password = previousEnvironment.POKE_NOTES_TEST_LOGIN_PASSWORD
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
    POKE_NOTES_TEST_LOGIN_PASSWORD: password
  });

  console.log("Waiting for the recreated local schema to become readable through PostgREST.");
  await waitForLocalSchema(apiUrl, serviceRoleKey);
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
  const studioUrl = requireLocalStatusValue(currentStatus, ["STUDIO_URL"]);
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
  await spawnAndForward(nextBin, ["dev", "-H", "0.0.0.0", "--port", "3010"], localEnvironment());
}

async function saveAuth() {
  if (!existsSync(envFile)) {
    throw new Error("Missing .env.e2e.local. Run npm run e2e:local:setup first.");
  }
  await spawnAndForward(
    process.execPath,
    [
      "scripts/save-local-auth-state.mjs",
      "--base-url=http://localhost:3010",
      "--state=.agent-browser/pokenotes-e2e-auth.json"
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
