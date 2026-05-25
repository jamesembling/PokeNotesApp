#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
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

if (!supabaseUrl || !serviceRoleKey) {
  writeLocalEnv({
    POKE_NOTES_ENABLE_TEST_LOGIN: "1",
    POKE_NOTES_TEST_LOGIN_SECRET:
      process.env.POKE_NOTES_TEST_LOGIN_SECRET || randomToken(24)
  });
  console.log("Local test-login base env is configured in .env.local.");
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
const password = process.env.POKE_NOTES_TEST_LOGIN_PASSWORD || randomToken(32);
await updateExistingTestUserPassword(authUser, password);
writeLocalEnv({
  POKE_NOTES_ENABLE_TEST_LOGIN: "1",
  POKE_NOTES_TEST_LOGIN_SECRET:
    process.env.POKE_NOTES_TEST_LOGIN_SECRET || randomToken(24),
  POKE_NOTES_TEST_LOGIN_EMAIL: authUser.email || "",
  POKE_NOTES_TEST_LOGIN_PASSWORD: password
});

console.log("Local test-login is configured.");
console.log(`Test account: ${authUser.email}`);
console.log("Existing test account was reused; no new account was created and no role was changed.");
console.log("Credentials were written to ignored local env; secret values were not printed.");

function randomToken(byteLength) {
  return randomBytes(byteLength).toString("base64url");
}

function parseEnvFile(path) {
  if (!existsSync(path)) {
    return new Map();
  }

  const entries = new Map();
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) {
      entries.set(match[1], match[2]);
    }
  }
  return entries;
}

function writeLocalEnv(values) {
  const existingContent = existsSync(localEnvPath) ? readFileSync(localEnvPath, "utf8") : "";
  const entries = parseEnvFile(localEnvPath);
  let nextContent = existingContent.trimEnd();

  for (const [key, value] of Object.entries(values)) {
    if (entries.has(key) && entries.get(key)) {
      continue;
    }

    if (nextContent) {
      nextContent += "\n";
    }
    nextContent += `${key}=${value}`;
  }

  if (nextContent !== existingContent.trimEnd()) {
    writeFileSync(localEnvPath, `${nextContent}\n`);
  }
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
