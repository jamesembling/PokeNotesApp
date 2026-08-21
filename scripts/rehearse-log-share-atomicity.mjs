#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  cleanupFixtureShares,
  collectShareTokens,
  collectSettledShareResults,
  finalizeRehearsal
} from "./lib/log-share-rehearsal-safety.mjs";

const REQUIRED_ENV = [
  "POKENOTES_SHARE_REHEARSAL_URL",
  "POKENOTES_SHARE_REHEARSAL_EXPECTED_HOST",
  "POKENOTES_SHARE_REHEARSAL_ANON_KEY",
  "POKENOTES_SHARE_REHEARSAL_USER_A_TOKEN",
  "POKENOTES_SHARE_REHEARSAL_USER_B_TOKEN",
  "POKENOTES_SHARE_REHEARSAL_USER_A_LOG_ID",
  "POKENOTES_SHARE_REHEARSAL_USER_B_LOG_ID"
];

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function createToken() {
  return randomBytes(12).toString("base64url");
}

function sharePayload(logId, label) {
  return {
    version: "v1",
    log: { id: logId, sections: [] },
    linkedStrategyLabel: label
  };
}

function authenticatedClient(url, anonKey, accessToken, customFetch) {
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
      ...(customFetch ? { fetch: customFetch } : {})
    }
  });
}

async function createShare(client, logId, label) {
  return client.rpc("create_log_share", {
    p_token: createToken(),
    p_source_log_id: logId,
    p_payload: sharePayload(logId, label)
  });
}

function oneRow(result, operation) {
  assert(!result.error, `${operation} failed: ${result.error?.code ?? "unknown"}`);
  assert(Array.isArray(result.data) && result.data.length === 1, `${operation} returned no row`);
  return result.data[0];
}

const missing = REQUIRED_ENV.filter((name) => !process.env[name]?.trim());
if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
}

const phase = requiredEnv("POKENOTES_SHARE_REHEARSAL_PHASE");
assert(
  phase === "rpc-cutover",
  "POKENOTES_SHARE_REHEARSAL_PHASE must be rpc-cutover"
);

const url = requiredEnv("POKENOTES_SHARE_REHEARSAL_URL");
const expectedHost = requiredEnv("POKENOTES_SHARE_REHEARSAL_EXPECTED_HOST");
assert(new URL(url).host === expectedHost, "Rehearsal URL does not match the confirmed staging host");
assert(
  process.env.POKENOTES_SHARE_REHEARSAL_CONFIRM === `staging:${expectedHost}`,
  "Set POKENOTES_SHARE_REHEARSAL_CONFIRM=staging:<expected-host> after confirming the target"
);

const anonKey = requiredEnv("POKENOTES_SHARE_REHEARSAL_ANON_KEY");
const userAToken = requiredEnv("POKENOTES_SHARE_REHEARSAL_USER_A_TOKEN");
const userBToken = requiredEnv("POKENOTES_SHARE_REHEARSAL_USER_B_TOKEN");
const userALogId = requiredEnv("POKENOTES_SHARE_REHEARSAL_USER_A_LOG_ID");
const userBLogId = requiredEnv("POKENOTES_SHARE_REHEARSAL_USER_B_LOG_ID");
const clientA = authenticatedClient(url, anonKey, userAToken);
const clientASecondSession = authenticatedClient(url, anonKey, userAToken);
const clientB = authenticatedClient(url, anonKey, userBToken);
const publicClient = createClient(url, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

let userAShareId;
let userBShareId;
const observedUserATokens = new Set();
const observedUserBTokens = new Set();
let primaryError;

try {
  // Start from an RPC-clean fixture without depending on direct table DELETE.
  const existingA = await clientA
    .from("log_shares")
    .select("id")
    .eq("source_log_id", userALogId)
    .gt("expires_at", new Date().toISOString());
  assert(!existingA.error, `Unable to inspect user A fixture: ${existingA.error?.code ?? "unknown"}`);
  for (const row of existingA.data ?? []) {
    const cleanup = await clientA.rpc("revoke_log_share", { p_share_id: row.id });
    assert(!cleanup.error, `Unable to clean user A fixture: ${cleanup.error?.code ?? "unknown"}`);
  }

  const concurrentSettled = await Promise.allSettled(
    Array.from({ length: 12 }, (_, index) =>
      createShare(index % 2 === 0 ? clientA : clientASecondSession, userALogId, "Atomic rehearsal")
    )
  );
  const concurrentOutcome = collectSettledShareResults(
    concurrentSettled,
    observedUserATokens,
    "concurrent create"
  );
  if (concurrentOutcome.errors.length > 0) {
    throw new AggregateError(
      concurrentOutcome.errors,
      "Concurrent share creation failed"
    );
  }
  const concurrentRows = concurrentOutcome.rows;
  assert(new Set(concurrentRows.map((row) => row.id)).size === 1, "Concurrent creates returned multiple tokens");
  userAShareId = concurrentRows[0].id;

  const activeA = await clientA
    .from("log_shares")
    .select("id")
    .eq("source_log_id", userALogId)
    .gt("expires_at", new Date().toISOString());
  assert(!activeA.error, `Unable to inspect active user A shares: ${activeA.error?.code ?? "unknown"}`);
  assert(activeA.data?.length === 1, "Concurrency rehearsal left more than one active token");

  const publicBeforeRevoke = oneRow(
    await publicClient.rpc("get_active_log_share", { p_token: userAShareId }),
    "public read before revoke"
  );
  assert(publicBeforeRevoke.id === userAShareId, "Public reader returned the wrong token");
  observedUserATokens.add(userAShareId);

  const crossTenantCreate = await createShare(clientB, userALogId, "Cross-tenant rehearsal");
  collectShareTokens([crossTenantCreate], observedUserBTokens, "cross-tenant create");
  assert(crossTenantCreate.error?.message === "LOG_SHARE_SOURCE_NOT_FOUND", "Cross-tenant create did not fail closed");
  const crossTenantRevoke = await clientB.rpc("revoke_log_share", { p_share_id: userAShareId });
  assert(!crossTenantRevoke.error && crossTenantRevoke.data === false, "Cross-tenant revoke affected another owner");
  const crossTenantDirectDelete = await clientB
    .from("log_shares")
    .delete()
    .eq("id", userAShareId)
    .select("id");
  assert(
    !crossTenantDirectDelete.error && crossTenantDirectDelete.data?.length === 0,
    "Cross-tenant direct DELETE bypassed owner RLS"
  );

  const userBCreate = await createShare(clientB, userBLogId, "Tenant B control");
  collectShareTokens([userBCreate], observedUserBTokens, "tenant B create");
  userBShareId = oneRow(userBCreate, "tenant B create").id;
  observedUserBTokens.add(userBShareId);

  const revokedA = await clientA.rpc("revoke_log_share", { p_share_id: userAShareId });
  assert(!revokedA.error && revokedA.data === true, "Owner revoke failed");
  const publicAfterRevoke = await publicClient.rpc("get_active_log_share", { p_token: userAShareId });
  assert(!publicAfterRevoke.error && publicAfterRevoke.data?.length === 0, "Revoked token remains public");
  const tenantBStillPublic = oneRow(
    await publicClient.rpc("get_active_log_share", { p_token: userBShareId }),
    "tenant B isolation control"
  );
  assert(tenantBStillPublic.id === userBShareId, "Owner revoke crossed the tenant boundary");
  userAShareId = undefined;

  let injected = false;
  const faultClient = authenticatedClient(url, anonKey, userAToken, async (...args) => {
    const response = await fetch(...args);
    const requestUrl = args[0] instanceof Request ? args[0].url : String(args[0]);
    if (!injected && requestUrl.includes("/rpc/create_log_share")) {
      injected = true;
      throw new Error("Injected response loss after database response");
    }
    return response;
  });
  const lostResponse = await createShare(faultClient, userALogId, "Fault rehearsal");
  collectShareTokens([lostResponse], observedUserATokens, "lost-response create");
  assert(injected && lostResponse.error, "Fault injection did not lose the committed response");
  const activeAfterLoss = await clientA
    .from("log_shares")
    .select("id")
    .eq("source_log_id", userALogId)
    .gt("expires_at", new Date().toISOString());
  assert(!activeAfterLoss.error, `Unable to inspect lost-response commit: ${activeAfterLoss.error?.code ?? "unknown"}`);
  assert(activeAfterLoss.data?.length === 1, "Lost response did not leave exactly one committed token");
  userAShareId = activeAfterLoss.data[0].id;
  observedUserATokens.add(userAShareId);
  const retryResult = await createShare(clientA, userALogId, "Fault rehearsal");
  collectShareTokens([retryResult], observedUserATokens, "retry after response loss");
  const retry = oneRow(retryResult, "retry after response loss");
  const activeAfterRetry = await clientA
    .from("log_shares")
    .select("id")
    .eq("source_log_id", userALogId)
    .gt("expires_at", new Date().toISOString());
  assert(!activeAfterRetry.error, `Unable to inspect retry result: ${activeAfterRetry.error?.code ?? "unknown"}`);
  assert(activeAfterRetry.data?.length === 1, "Retry after response loss created a hidden duplicate");
  assert(activeAfterRetry.data[0].id === retry.id, "Retry did not return the committed active token");
  userAShareId = retry.id;

  const directDelete = await clientA.from("log_shares").delete().eq("id", userAShareId).select("id");
  assert(!directDelete.error && directDelete.data?.length === 1, "Compatibility DELETE is unavailable");
  userAShareId = undefined;

  const anonRevoke = await publicClient.rpc("revoke_log_share", { p_share_id: userBShareId });
  assert(anonRevoke.error?.code === "42501", "Anonymous revocation was not denied");
} catch (error) {
  primaryError = error;
}

const cleanupErrors = await cleanupFixtureShares({
  fixtures: [
    {
      client: clientA,
      label: "user A fixture",
      logId: userALogId,
      observedTokens: observedUserATokens
    },
    {
      client: clientB,
      label: "user B fixture",
      logId: userBLogId,
      observedTokens: observedUserBTokens
    }
  ],
  publicClient
});

finalizeRehearsal({ phase, primaryError, cleanupErrors });
