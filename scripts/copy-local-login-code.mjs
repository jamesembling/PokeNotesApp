#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
loadDotenv({ path: resolve(rootDir, ".env"), override: false, quiet: true });
loadDotenv({ path: resolve(rootDir, ".env.local"), override: true, quiet: true });

const pairingCode = process.env.POKE_NOTES_LOCAL_LOGIN_CODE || "";

if (!pairingCode) {
  throw new Error("Missing local pairing code. Run npm run auth:local:setup first.");
}

if (process.platform !== "darwin") {
  throw new Error("Clipboard copy is currently supported on macOS only.");
}

execFileSync("pbcopy", [], {
  input: pairingCode,
  stdio: ["pipe", "ignore", "inherit"]
});

console.log("Local pairing code copied to the macOS clipboard; its value was not printed.");
