#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const envPath = resolve(rootDir, ".env");
const localEnvPath = resolve(rootDir, ".env.local");
const agentBrowserBin = resolve(
  rootDir,
  process.platform === "win32"
    ? "node_modules/.bin/agent-browser.cmd"
    : "node_modules/.bin/agent-browser"
);

loadDotenv({ path: envPath, override: false });
loadDotenv({ path: localEnvPath, override: true });

const args = new Map();
for (const arg of process.argv.slice(2)) {
  const [key, ...rest] = arg.split("=");
  args.set(key, rest.length > 0 ? rest.join("=") : "true");
}

const baseUrl = String(args.get("--base-url") || "http://localhost:3000").replace(/\/$/, "");
const statePath = resolve(String(args.get("--state") || ".agent-browser/pokenotes-local-auth.json"));
const session = String(args.get("--session") || `pokenotes-local-auth-${Date.now()}`);
const secret = process.env.POKE_NOTES_TEST_LOGIN_SECRET || "";

if (!secret) {
  throw new Error(
    "Missing POKE_NOTES_TEST_LOGIN_SECRET. Run npm run auth:local:setup first."
  );
}

if (!existsSync(agentBrowserBin)) {
  throw new Error("agent-browser is not installed. Run npm install first.");
}

await assertDevServerReady(baseUrl);

mkdirSync(dirname(statePath), { recursive: true });
const loginUrl = new URL("/auth/test-login", baseUrl);
loginUrl.searchParams.set("secret", secret);

runAgentBrowser(["open", loginUrl.toString()], { stdio: "inherit" });
runAgentBrowser([
  "wait",
  "--fn",
  "document.readyState === 'complete' && location.pathname !== '/login'"
]);
runAgentBrowser(["state", "save", statePath], { stdio: "inherit" });

console.log(`Saved local auth state to ${statePath}`);

function runAgentBrowser(commandArgs, options = {}) {
  return execFileSync(
    agentBrowserBin,
    [
      "--session",
      session,
      "--allowed-domains",
      "localhost,127.0.0.1,*.supabase.co,*.supabase.in",
      ...commandArgs
    ],
    {
      cwd: rootDir,
      encoding: "utf8",
      stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
      timeout: options.timeoutMs ?? 30000
    }
  );
}

function assertDevServerReady(baseUrlValue) {
  return new Promise((resolveReady, rejectReady) => {
    const request = httpRequest(baseUrlValue, { method: "GET", timeout: 5000 }, (response) => {
      response.resume();
      resolveReady();
    });

    request.on("timeout", () => {
      request.destroy(new Error(`Timed out connecting to ${baseUrlValue}`));
    });
    request.on("error", () => {
      rejectReady(
        new Error(`Local dev server is not reachable at ${baseUrlValue}. Start it with npm run dev:test-login.`)
      );
    });
    request.end();
  });
}
