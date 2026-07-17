#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { config as loadDotenv } from "dotenv";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const envPath = resolve(rootDir, ".env");
const localEnvPath = resolve(rootDir, ".env.local");
loadDotenv({ path: envPath, override: false });
loadDotenv({ path: localEnvPath, override: true });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEW_SUPABASE_URL || "";
const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEW_SUPABASE_SERVICE_KEY || "";
const rotatePassword = process.argv.includes("--rotate-password");
const localLoginCode = process.env.POKE_NOTES_LOCAL_LOGIN_CODE || randomToken(24);
const localLoginHosts = discoverLocalLoginHosts();

if (!supabaseUrl || !serviceRoleKey) {
  if (rotatePassword) {
    throw new Error(
      "Cannot rotate the local test-account password because admin Supabase env vars are missing."
    );
  }

  writeLocalEnv({
    POKE_NOTES_ENABLE_TEST_LOGIN: "1",
    POKE_NOTES_LOCAL_LOGIN_CODE: localLoginCode,
    POKE_NOTES_LOCAL_LOGIN_HOSTS: localLoginHosts
  }, {
    replaceKeys: new Set(["POKE_NOTES_LOCAL_LOGIN_HOSTS"])
  });
  console.log("Local development login base env is configured in .env.local.");
  console.log(
    "Skipped Codex test account lookup because admin Supabase env vars are missing."
  );
  console.log("Set POKE_NOTES_TEST_LOGIN_EMAIL and POKE_NOTES_TEST_LOGIN_PASSWORD locally before saving auth state.");
  process.exit(0);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const authUser = await findConfiguredOrExistingCodexUser();
const configuredPassword = process.env.POKE_NOTES_TEST_LOGIN_PASSWORD || "";
const password = rotatePassword || !configuredPassword ? randomToken(32) : configuredPassword;
const shouldUpdatePassword = rotatePassword || !configuredPassword;

if (shouldUpdatePassword) {
  await updateExistingTestUserPassword(authUser, password);
}

writeLocalEnv({
  POKE_NOTES_ENABLE_TEST_LOGIN: "1",
  POKE_NOTES_LOCAL_LOGIN_CODE: localLoginCode,
  POKE_NOTES_LOCAL_LOGIN_HOSTS: localLoginHosts,
  POKE_NOTES_TEST_LOGIN_EMAIL: authUser.email || "",
  POKE_NOTES_TEST_LOGIN_PASSWORD: password
}, {
  replaceKeys: new Set([
    "POKE_NOTES_LOCAL_LOGIN_HOSTS",
    ...(rotatePassword ? ["POKE_NOTES_TEST_LOGIN_PASSWORD"] : [])
  ])
});

console.log("Local development login is configured.");
console.log("Existing test account was reused; no new account was created and no role was changed.");
if (rotatePassword) {
  console.log("The local test-account password was explicitly rotated.");
  console.log("Existing browser sessions were invalidated; run npm run auth:local:save.");
} else if (shouldUpdatePassword) {
  console.log("The local test-account password was initialized.");
} else {
  console.log("The existing password was preserved; active browser sessions remain valid.");
}
console.log("Credentials were written to ignored local env; secret values were not printed.");
console.log("Use npm run auth:local:copy-code to copy the local pairing code without printing it.");

function randomToken(byteLength) {
  return randomBytes(byteLength).toString("base64url");
}

function writeLocalEnv(values, options = {}) {
  const existingContent = existsSync(localEnvPath) ? readFileSync(localEnvPath, "utf8") : "";
  const replaceKeys = options.replaceKeys ?? new Set();
  const writtenKeys = new Set();
  const lines = existingContent.trimEnd() ? existingContent.trimEnd().split(/\r?\n/) : [];
  const nextLines = lines.map((line) => {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match || !(match[1] in values)) {
      return line;
    }

    const key = match[1];
    writtenKeys.add(key);

    if (match[2] && !replaceKeys.has(key)) {
      return line;
    }

    return `${key}=${values[key]}`;
  });

  for (const [key, value] of Object.entries(values)) {
    if (writtenKeys.has(key)) {
      continue;
    }

    nextLines.push(`${key}=${value}`);
  }

  const nextContent = nextLines.join("\n");
  if (nextContent !== existingContent.trimEnd()) {
    writeFileSync(localEnvPath, `${nextContent}\n`, { mode: 0o600 });
  }

  chmodSync(localEnvPath, 0o600);
}

function discoverLocalLoginHosts() {
  const port = String(process.env.PORT || "3000");
  const hosts = new Set([
    `localhost:${port}`,
    `127.0.0.1:${port}`,
    `[::1]:${port}`
  ]);

  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === "IPv4" && !address.internal) {
        if (isPrivateIpv4(address.address)) {
          hosts.add(`${address.address}:${port}`);
        }
      }
    }
  }

  if (process.platform === "darwin") {
    try {
      const localHostName = execFileSync("scutil", ["--get", "LocalHostName"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"]
      }).trim();
      if (localHostName) {
        hosts.add(`${localHostName}.local:${port}`);
      }
    } catch {
      // The discovered private IP remains available when mDNS lookup is unavailable.
    }
  }

  for (const configuredHost of String(process.env.POKE_NOTES_LOCAL_LOGIN_HOSTS || "").split(",")) {
    const normalizedHost = configuredHost.trim();
    if (normalizedHost) {
      hosts.add(normalizedHost);
    }
  }

  return Array.from(hosts).join(",");
}

function isPrivateIpv4(address) {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet))) {
    return false;
  }

  return (
    octets[0] === 10 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168) ||
    (octets[0] === 169 && octets[1] === 254)
  );
}

async function listAllAuthUsers() {
  const users = [];
  let page = 1;

  while (page < 20) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 100
    });

    if (error) {
      throw error;
    }

    users.push(...data.users);

    if (data.users.length < 100) {
      return users;
    }

    page += 1;
  }

  throw new Error("Auth user list exceeded scan limit.");
}

async function findConfiguredOrExistingCodexUser() {
  const users = await listAllAuthUsers();
  const configuredEmail = process.env.POKE_NOTES_TEST_LOGIN_EMAIL || "";

  if (configuredEmail) {
    const configuredUser = users.find(
      (candidate) => candidate.email?.toLowerCase() === configuredEmail.toLowerCase()
    );
    if (!configuredUser) {
      throw new Error(
        `POKE_NOTES_TEST_LOGIN_EMAIL is set, but no existing auth user matched ${configuredEmail}.`
      );
    }
    return configuredUser;
  }

  const codexCandidates = users.filter((candidate) => {
    const email = candidate.email?.toLowerCase() || "";
    const metadata = JSON.stringify(candidate.user_metadata ?? {}).toLowerCase();
    return email.includes("codex") || metadata.includes("codex");
  });

  if (codexCandidates.length === 1) {
    return codexCandidates[0];
  }

  if (codexCandidates.length > 1) {
    throw new Error(
      "Found multiple possible Codex test users. Set POKE_NOTES_TEST_LOGIN_EMAIL in .env.local."
    );
  }

  throw new Error(
    "Could not find the existing Codex test user. Set POKE_NOTES_TEST_LOGIN_EMAIL in .env.local."
  );
}

async function updateExistingTestUserPassword(user, password) {
  const { data, error } = await supabase.auth.admin.updateUserById(user.id, {
    email_confirm: true,
    password,
    user_metadata: {
      ...(user.user_metadata ?? {}),
      full_name:
        typeof user.user_metadata?.full_name === "string"
          ? user.user_metadata.full_name
          : "Codex Test User",
      name:
        typeof user.user_metadata?.name === "string"
          ? user.user_metadata.name
          : "Codex Test User"
    }
  });

  if (error) {
    throw error;
  }

  return data.user;
}
