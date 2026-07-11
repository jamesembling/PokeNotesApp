#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
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
const baseUrlParts = new URL(baseUrl);
const statePath = resolve(String(args.get("--state") || ".agent-browser/pokenotes-local-auth.json"));
const session = String(args.get("--session") || `pokenotes-local-auth-${Date.now()}`);
const pairingCode = String(process.env.POKE_NOTES_LOCAL_LOGIN_CODE || "");

if (!existsSync(agentBrowserBin)) {
  throw new Error("agent-browser is not installed. Run npm install first.");
}

if (!pairingCode) {
  throw new Error("Missing local pairing code. Run npm run auth:local:setup first.");
}

await assertDevServerReady(baseUrl);

mkdirSync(dirname(statePath), { recursive: true });
runAgentBrowser(["open", new URL("/login", baseUrl).toString()], { stdio: "inherit" });
const currentUrl = new URL(runAgentBrowser(["get", "url"]).trim());
if (currentUrl.pathname === "/login") {
  runAgentBrowser([
    "fill",
    'form[action="/auth/dev-login"] input[name="pairingCode"]',
    pairingCode
  ]);
  runAgentBrowser([
    "click",
    'form[action="/auth/dev-login"] button[type="submit"]'
  ]);
}
runAgentBrowser([
  "wait",
  "--fn",
  "document.readyState === 'complete' && location.pathname !== '/login'"
]);
runAgentBrowser(["state", "save", statePath], { stdio: "inherit" });
sanitizeAuthState();
chmodSync(statePath, 0o600);

console.log(`Saved local auth state to ${statePath}`);

function runAgentBrowser(commandArgs, options = {}) {
  return execFileSync(
    agentBrowserBin,
    [
      "--session",
      session,
      "--allowed-domains",
      Array.from(
        new Set([
          baseUrlParts.host,
          baseUrlParts.hostname,
          "localhost",
          "127.0.0.1",
          "*.supabase.co",
          "*.supabase.in"
        ])
      ).join(","),
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

function sanitizeAuthState() {
  let state;
  try {
    state = JSON.parse(readFileSync(statePath, "utf8"));
  } catch (error) {
    rmSync(statePath, { force: true });
    throw new Error("Saved local auth state could not be sanitized and was removed.", {
      cause: error
    });
  }
  const expectedHostname = baseUrlParts.hostname.toLowerCase();
  const expectedOrigin = baseUrlParts.origin;

  state.cookies = Array.isArray(state.cookies)
    ? state.cookies.filter((cookie) =>
        String(cookie?.domain || "").replace(/^\./, "").toLowerCase() === expectedHostname
      )
    : [];
  state.origins = Array.isArray(state.origins)
    ? state.origins.filter((entry) => entry?.origin === expectedOrigin)
    : [];

  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
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
