#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { parse as parseEnv } from "dotenv";

const root = fileURLToPath(new URL("..", import.meta.url));
const baseUrl = "http://localhost:3010";
const notes = "Synthetic browser import verification";
const expiredSession = process.argv[2] === "--expired-session";
const variant = expiredSession ? "expired-session" : "authenticated";
const startedAt = new Date().toISOString();
let stage = "preflight";
let server;
let browser;
let page;
let artifacts;
let environment = {};
let failureMessage;

if (process.argv.includes("--help")) {
  console.log("npm run e2e:local:import [-- --expired-session]\nResets the synthetic local database, starts port 3010, signs in, and checks paste, review, save, reload and catalogue learning. The expired-session variant verifies refresh during deck-options loading before saving. Closes its browser and app afterward; leaves the local database available for inspection. Port 3010 must be free. No hosted target or credentials are accepted.");
  process.exit(0);
}
assert.ok(process.argv.length === 2 || (process.argv.length === 3 && expiredSession),
  "This local-only command accepts only --expired-session, not target overrides.");

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, async () => {
    await cleanup();
    process.exit(signal === "SIGINT" ? 130 : 143);
  });
}

try {
  artifacts = mkdtempSync(resolve(tmpdir(), "pokenotes-import-"));
  assert.ok(existsSync(chromium.executablePath()), "Install the pinned browser first: npx playwright install chromium");
  await requireFreePort();
  checkpoint("reset synthetic fixtures");
  execFileSync(process.execPath, ["scripts/local-e2e.mjs", "reset"], {
    cwd: root, stdio: "inherit", timeout: 180000
  });
  environment = parseEnv(readFileSync(resolve(root, ".env.e2e.local")));
  const api = new URL(environment.NEXT_PUBLIC_SUPABASE_URL);
  assert.equal(environment.POKENOTES_E2E_LOCAL, "1", "Missing local-only marker.");
  assert.ok(["http://localhost:54321", "http://127.0.0.1:54321"].includes(api.origin), "Refusing a hosted database.");
  assert.equal(environment.POKE_NOTES_TEST_LOGIN_EMAIL, "e2e@pokenotes.local");
  assert.ok(environment.POKE_NOTES_LOCAL_LOGIN_CODE, "Missing synthetic pairing code.");
  const db = createClient(api.origin, environment.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(10000) }) }
  });
  const { user_id: userId } = await query(db.from("decks").select("user_id").eq("id", "e2e-deck-dragapult").single());
  const logs = () => query(db.from("logs").select("id,linked_deck_list_id,match_notes,self_deck_sprites,raw_log,coin_toss_won").eq("user_id", userId));
  const learned = () => query(db.from("archetype_catalog").select("id,sprites").eq("user_id", userId).eq("source", "learned").eq("canonical_id", "dragapult+munkidori"));
  assert.equal((await logs()).length, 3, "Reset must contain exactly three synthetic logs.");
  assert.equal((await learned()).length, 0, "Learning must start absent.");

  checkpoint("start isolated app");
  const output = openSync(resolve(artifacts, "server.log"), "w", 0o600);
  server = spawn(process.execPath, ["scripts/local-e2e.mjs", "dev"], {
    cwd: root, detached: true, stdio: ["ignore", output, output]
  });
  closeSync(output);
  server.on("error", () => { process.exitCode = 1; });
  await until(async () => {
    if (server.exitCode !== null) throw new Error("The isolated app exited during startup.");
    try {
      const response = await fetch(`${baseUrl}/login`, { signal: AbortSignal.timeout(2000), redirect: "manual" });
      await response.body?.cancel();
      return response.status === 200;
    } catch { return false; }
  }, 45000);

  checkpoint("authenticate synthetic account");
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 577 } });
  context.setDefaultTimeout(20000);
  await context.route("**/*", route => {
    const url = new URL(route.request().url());
    return ["localhost", "127.0.0.1"].includes(url.hostname) ? route.continue() : route.abort();
  });
  page = await context.newPage();
  let saveRequests = 0;
  page.on("request", request => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/log-import/save") saveRequests++;
  });
  await page.goto(`${baseUrl}/login`);
  await page.locator('form[action="/auth/dev-login"] input[name="pairingCode"]').fill(environment.POKE_NOTES_LOCAL_LOGIN_CODE);
  await Promise.all([
    page.waitForURL(`${baseUrl}/dashboard`),
    page.locator('form[action="/auth/dev-login"] button[type="submit"]').click()
  ]);
  await verifyLogsBootstrap();
  await page.getByRole("button", { name: "E2E Trainer e2e@pokenotes.local", exact: true }).waitFor();
  assert.equal(new URL(page.url()).pathname, "/logs", "Login must reach the authenticated app.");

  // Create the learning example through the UI using the existing synthetic log.
  const fixture = readFileSync(resolve(root, "tests/e2e/fixtures/battle-log-valid.txt"), "utf8");
  const bench = "E2ETrainer played Dreepy to the Bench.";
  assert.ok(fixture.includes(bench), "The synthetic fixture no longer has its expected starting state.");
  const rawLog = fixture.replace(bench, `${bench}\nE2ETrainer played Munkidori to the Bench.`).trim();
  const journeyStarted = performance.now();
  await page.setViewportSize({ width: 390, height: 844 });
  let expiredCookie;
  let deckOptionsRequests = 0;
  if (expiredSession) {
    checkpoint("start import with an expired access token and valid refresh token");
    const [bootstrap] = await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname === "/api/log-import/bootstrap"),
      page.getByRole("button", { name: "Import PTCGL Log", exact: true }).focus()
    ]);
    assert.equal(bootstrap.status(), 200, "Prewarming must finish before expiring the browser session.");
    expiredCookie = await expireBrowserAccessToken(context);
  } else {
    checkpoint("recover deck options after a failed request");
    await page.route("**/api/deck-selection-options", route => {
      deckOptionsRequests++;
      return deckOptionsRequests === 1
        ? route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"Unavailable"}' })
        : route.continue();
    });
  }
  checkpoint("paste and review");
  const deckOptionsResponse = expiredSession
    ? page.waitForResponse(response => new URL(response.url()).pathname === "/api/deck-selection-options")
    : null;
  const firstReview = await openReview(rawLog);
  if (expiredSession) {
    const response = await deckOptionsResponse;
    const cookieHeader = await response.request().headerValue("cookie");
    assert.ok(cookieHeader?.includes(`${expiredCookie.name}=${expiredCookie.value}`),
      "The deck-options request must begin with the expired access token.");
    assert.equal(response.status(), 200, "Deck options must load after the proxy refreshes the session.");
    const options = await response.json();
    assert.ok(options.deckLists?.some(deckList => deckList.id === "e2e-list-attached"),
      "The refreshed request must return the synthetic Deck List.");
    await until(async () => (await context.cookies(baseUrl))
      .some(cookie => cookie.name === expiredCookie.name && cookie.value !== expiredCookie.value));
    await page.getByText("More details", { exact: true }).click();
    await page.locator("#import-deck-list-mobile").click();
    await page.getByRole("option", { name: "League Cup List", exact: true }).click();
  } else {
    const deckOptionsAlert = page.getByRole("alert").filter({ hasText: "Could not load deck options" });
    await deckOptionsAlert.waitFor();
    const [deckOptionsRetry] = await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname === "/api/deck-selection-options" && response.status() === 200),
      page.getByRole("button", { name: "Retry", exact: true }).click()
    ]);
    assert.equal(deckOptionsRetry.status(), 200);
    await deckOptionsAlert.waitFor({ state: "hidden" });
    assert.equal(deckOptionsRequests, 2, "Retry must issue a fresh deck options request.");
    await page.getByText("More details", { exact: true }).click();
    await until(() => page.locator("#import-deck-list-mobile").isEnabled());
    await page.unroute("**/api/deck-selection-options");
  }
  assert.ok(firstReview.draftId, "A ready review must identify its persisted draft.");
  const persistedDraft = await query(
    db.from("battle_log_import_drafts").select("id").eq("id", firstReview.draftId).eq("user_id", userId).maybeSingle()
  );
  assert.equal(persistedDraft?.id, firstReview.draftId, "Review readiness must imply durable draft storage.");
  assert.deepEqual(await selfSprites(), ["dreepy", "munkidori"], "First review must precede catalogue learning.");

  checkpoint("keep mobile sprite search Enter inside the review form");
  let releasePokemonOptions;
  const pokemonOptionsGate = new Promise(resolve => { releasePokemonOptions = resolve; });
  await page.route("**/api/pokemon-options", async route => {
    await pokemonOptionsGate;
    await route.continue();
  });
  const pokemonOptionsRequest = page.waitForRequest(
    request => new URL(request.url()).pathname === "/api/pokemon-options"
  );
  await page.getByRole("button", { name: /^Dreepy(?: Dreepy)?$/ }).click();
  const search = page.getByPlaceholder("Search to replace Pokemon");
  await pokemonOptionsRequest;
  await search.press("Enter");
  assert.equal(saveRequests, 0, "Enter in an empty loading search must not save the Battle Log.");
  await search.fill("not-a-pokemon");
  await search.press("Enter");
  assert.equal(saveRequests, 0, "Enter in an unmatched loading search must not save the Battle Log.");
  releasePokemonOptions();
  await page.getByText('No Pokemon found for "not-a-pokemon"', { exact: true }).waitFor();
  await search.press("Enter");
  assert.equal(saveRequests, 0, "Enter in an unmatched loaded search must not save the Battle Log.");
  await page.getByRole("button", { name: "Close Pokemon search", exact: true }).click();
  await page.unroute("**/api/pokemon-options");

  checkpoint("select a sprite with Enter in the desktop popover");
  await page.setViewportSize({ width: 1280, height: 577 });
  await page.getByRole("button", { name: /^Dreepy(?: Dreepy)?$/ }).click();
  await search.fill("Dragapult");
  await page.getByRole("button", { name: /^Dragapult(?: Dragapult)?$/ }).waitFor();
  await search.press("Enter");
  await search.waitFor({ state: "hidden" });
  assert.deepEqual(await selfSprites(), ["dragapult", "munkidori"]);
  assert.equal(saveRequests, 0, "Selecting a matched sprite with Enter must not save the Battle Log.");
  await page.getByRole("textbox", { name: "Match notes", exact: true }).fill(notes);
  checkpoint("save exactly one Battle Log");
  const [response] = await Promise.all([
    page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/log-import/save"),
    page.getByRole("button", { name: "Save Log", exact: true }).click()
  ]);
  assert.equal(response.status(), 200, "The browser save request must succeed.");
  const originalSaveRequest = response.request();
  const originalSaveHeaders = await originalSaveRequest.allHeaders();
  const originalSaveBody = originalSaveRequest.postDataBuffer();
  assert.ok(originalSaveBody, "The browser save request must include its multipart body.");
  const result = await response.json();
  assert.equal(result.ok, true);
  assert.match(result.redirectTo, /^\/logs\/[^/]+$/);
  await page.waitForURL(`${baseUrl}${result.redirectTo}`);
  await page.getByRole("heading", { name: "Review Battle Log", exact: true }).waitFor({ state: "hidden" });
  assert.equal(saveRequests, 1, "Save must send exactly one request.");
  const savedPath = new URL(page.url()).pathname;

  const savedLogs = await logs();
  assert.equal(savedLogs.length, 4, "Save must add exactly one Battle Log.");
  const saved = savedLogs.find(row => `/logs/${row.id}` === savedPath);
  assert.ok(saved, "The browser must navigate to the committed Battle Log.");
  assert.equal(saved.match_notes, notes);
  assert.equal(saved.raw_log.trim(), rawLog);
  assert.equal(saved.self_deck_sprites, "dragapult,munkidori");
  assert.equal(saved.coin_toss_won, true);
  if (expiredSession) {
    assert.equal(saved.linked_deck_list_id, "e2e-list-attached",
      "The imported Battle Log must retain the Deck List selected after refresh.");
  }

  checkpoint("replay the identical save request");
  const replayResponse = await context.request.fetch(originalSaveRequest.url(), {
    data: originalSaveBody,
    failOnStatusCode: false,
    headers: {
      "content-type": originalSaveHeaders["content-type"],
      origin: baseUrl,
      referer: `${baseUrl}/logs`
    },
    method: "POST"
  });
  assert.equal(replayResponse.status(), 200, "An identical save retry must succeed.");
  const replayResult = await replayResponse.json();
  assert.deepEqual(replayResult, result, "An identical save retry must return the original Battle Log.");
  assert.equal((await logs()).length, 4, "An identical save retry must not create another Battle Log.");

  checkpoint("reject changed values with the same save identity");
  const changedSaveBody = Buffer.from(
    originalSaveBody.toString("utf8").replace(notes, `${notes} changed`),
    "utf8"
  );
  assert.notDeepEqual(changedSaveBody, originalSaveBody, "The conflicting retry must change a permitted value.");
  const conflictResponse = await context.request.fetch(originalSaveRequest.url(), {
    data: changedSaveBody,
    failOnStatusCode: false,
    headers: {
      "content-type": originalSaveHeaders["content-type"],
      origin: baseUrl,
      referer: `${baseUrl}/logs`
    },
    method: "POST"
  });
  assert.ok(conflictResponse.status() >= 400, "Changed values with the same save identity must fail.");
  const logsAfterConflict = await logs();
  assert.equal(logsAfterConflict.length, 4, "A conflicting retry must not duplicate the saved log.");
  assert.equal(
    logsAfterConflict.find(row => row.id === saved.id)?.match_notes,
    notes,
    "A conflicting retry must not modify the saved log."
  );

  checkpoint("reload the committed Battle Log");
  await page.reload();
  assert.equal(new URL(page.url()).pathname, savedPath);
  await page.getByRole("heading", { name: "Battle Log versus Charmander", exact: true }).waitFor();
  await page.getByRole("button", { name: "Edit match notes", exact: true }).click();
  assert.equal(await page.getByRole("textbox", { name: "Match notes", exact: true }).inputValue(), notes);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();

  checkpoint("verify catalogue learning and the next review");
  await until(async () => {
    const rows = await learned();
    if (rows.length === 0) return false;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, `learned:${userId}:dragapult+munkidori`);
    assert.deepEqual(rows[0].sprites, ["dragapult", "munkidori"]);
    return true;
  });
  await openReview(rawLog);
  assert.deepEqual(await selfSprites(), ["dragapult", "munkidori"], "The next review must consume the learned catalogue.");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  assert.equal((await logs()).length, 4, "Abandoning the second review must not create another log.");
  assert.equal(saveRequests, 1, "The second review must not send a save request.");
  console.log(`PASS: ${expiredSession ? "expired-session" : "authenticated"} paste → review → save → reload → learned review (${Math.round(performance.now() - journeyStarted)} ms, local diagnostic only).`);
} catch (error) {
  failureMessage = redact(error.message);
  console.error(`FAIL at ${stage}: ${failureMessage}`);
  if (artifacts) {
    if (page) {
      try { writeFileSync(resolve(artifacts, "browser.txt"), redact(await page.locator("body").ariaSnapshot({ timeout: 3000 })), { mode: 0o600 }); } catch { /* The browser may itself be the failure. */ }
    }
    console.error(`Local diagnostics: ${artifacts}`);
  }
  process.exitCode = 1;
} finally {
  try {
    await cleanup();
  } finally {
    if (artifacts && process.exitCode && process.env.CI) {
      const diagnostics = resolve(root, ".agent-browser/import-check", variant);
      mkdirSync(diagnostics, { recursive: true });
      writeFileSync(resolve(diagnostics, "summary.json"), JSON.stringify({
        variant, startedAt, failedAt: new Date().toISOString(), stage,
        error: failureMessage || "Interrupted before the journey completed."
      }, null, 2) + "\n", { mode: 0o600 });
      for (const name of ["server.log", "browser.txt"]) {
        const source = resolve(artifacts, name);
        if (existsSync(source)) {
          writeFileSync(resolve(diagnostics, name), redact(readFileSync(source, "utf8")), { mode: 0o600 });
        }
      }
      console.error(`Redacted CI diagnostics: ${diagnostics}`);
    }
    if (artifacts && !process.exitCode) rmSync(artifacts, { recursive: true, force: true });
  }
}

function checkpoint(value) {
  stage = value;
  console.log(`[import-check] ${value}`);
}

async function expireBrowserAccessToken(context) {
  const authCookies = (await context.cookies(baseUrl)).filter(cookie =>
    cookie.name.startsWith("sb-") && cookie.name.endsWith("-auth-token")
  );
  assert.equal(authCookies.length, 1, "The synthetic login must have one session cookie.");
  const [cookie] = authCookies;
  assert.ok(cookie.value.startsWith("base64-"));
  const session = JSON.parse(Buffer.from(cookie.value.slice(7), "base64url").toString("utf8"));
  assert.ok(session.refresh_token, "The browser session must retain a valid refresh token.");
  const parts = session.access_token.split(".");
  assert.equal(parts.length, 3);
  const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  claims.exp = Math.floor(Date.now() / 1000) - 60;
  session.access_token = `${parts[0]}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.${parts[2]}`;
  session.expires_at = claims.exp;
  const value = `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
  await context.addCookies([{ ...cookie, value }]);
  assert.ok((await context.cookies(baseUrl)).some(current =>
    current.name === cookie.name && current.value === value
  ), "The next browser request must use the expired session cookie.");
  return { name: cookie.name, value };
}

async function verifyLogsBootstrap() {
  checkpoint("load logs before workspace JavaScript and recover failed loads");
  let bootstrapRequests = 0;
  const countRequest = request => {
    if (new URL(request.url()).pathname === "/api/logs/bootstrap") bootstrapRequests++;
  };
  page.on("request", countRequest);
  let releaseScripts;
  const scriptsReleased = new Promise(resolve => { releaseScripts = resolve; });
  const holdScript = async route => {
    await scriptsReleased;
    await route.continue();
  };
  await page.route("**/_next/static/chunks/*.js", holdScript);
  try {
    const bootstrap = page.waitForResponse(response => new URL(response.url()).pathname === "/api/logs/bootstrap", { timeout: 10000 });
    await page.goto(`${baseUrl}/logs`, { waitUntil: "commit" });
    const response = await bootstrap;
    assert.equal(response.status(), 200, "Logs must load while hydration scripts are held.");
    assert.equal((await response.json()).stats.total, 3);
    assert.equal(bootstrapRequests, 1, "The HTML parser must start exactly one bootstrap request.");
    assert.equal(await page.locator('[data-route-client-timing="route-data-visible"]').count(), 0, "The request must finish before hydration.");
  } finally {
    releaseScripts();
    await page.unrouteAll({ behavior: "wait" });
  }
  await page.locator('[data-route-client-timing="route-data-visible"][data-route-client-paint-ms]').waitFor({ state: "attached" });
  assert.equal(bootstrapRequests, 1, "Hydration must consume the early result without a duplicate request.");

  await page.route("**/api/logs/bootstrap", route => route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"Synthetic unavailable response"}' }), { times: 1 });
  await page.reload();
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await page.locator('[data-route-client-timing="route-data-visible"]').waitFor({ state: "attached" });
  assert.equal(bootstrapRequests, 3, "Retry must make a fresh request after the failed early result.");

  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await page.getByRole("heading", { name: "Dashboard", exact: true }).waitFor();
  await page.getByRole("link", { name: "Battle Logs", exact: true }).click();
  await page.locator('[data-route-client-timing="route-data-visible"]').waitFor({ state: "attached" });
  assert.equal(bootstrapRequests, 4, "Returning through client navigation must fetch fresh logs.");

  await page.context().clearCookies();
  await page.reload();
  await page.waitForURL(`${baseUrl}/login`);
  assert.equal(bootstrapRequests, 5, "An unauthorized early response must redirect without another bootstrap.");
  await page.locator('form[action="/auth/dev-login"] input[name="pairingCode"]').fill(environment.POKE_NOTES_LOCAL_LOGIN_CODE);
  await Promise.all([
    page.waitForURL(`${baseUrl}/dashboard`),
    page.locator('form[action="/auth/dev-login"] button[type="submit"]').click()
  ]);
  await page.goto(`${baseUrl}/logs`);
  await page.locator('[data-route-client-timing="route-data-visible"]').waitFor({ state: "attached" });
  assert.equal(bootstrapRequests, 6, "A new document must use a new authenticated result.");
  page.off("request", countRequest);
}

async function selfSprites() {
  return page.locator('input[name="selfSprites"]').evaluateAll(inputs => inputs.map(input => input.value));
}

async function openReview(rawLog) {
  await page.getByRole("button", { name: "Import PTCGL Log", exact: true }).click();
  const [response] = await Promise.all([
    page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/log-import/review"),
    page.getByRole("textbox", { name: "Battle log", exact: true }).fill(rawLog)
  ]);
  assert.equal(response.status(), 200, "The browser review request must succeed.");
  const review = await response.json();
  await page.getByRole("textbox", { name: "Match notes", exact: true }).waitFor();
  return review;
}

async function until(predicate, timeout = 20000) {
  const deadline = Date.now() + timeout;
  do {
    if (await predicate()) return;
    await delay(200);
  } while (Date.now() < deadline);
  throw new Error(`Expected checkpoint was not reached within ${timeout / 1000} seconds.`);
}

async function query(promise) {
  const { data, error } = await promise;
  if (error) throw new Error(`Local database verification failed: ${error.message}`);
  return data;
}

async function requireFreePort() {
  for (const host of ["0.0.0.0", "::"]) {
    await new Promise((accept, reject) => {
      const probe = createServer();
      probe.once("error", error => error.code === "EAFNOSUPPORT" ? accept() : reject(new Error("Port 3010 is occupied. Stop dev:e2e before running the self-contained import check.")));
      probe.listen(3010, host, () => probe.close(accept));
    });
  }
}

function redact(message) {
  const text = Object.entries(environment)
    .filter(([key]) => /KEY|PASSWORD|CODE|SECRET|TOKEN/.test(key))
    .reduce((text, [, value]) => value ? text.replaceAll(value, "<redacted>") : text, String(message));
  return text.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "<redacted JWT>")
    .split("\n")
    .map(line => /(?:authorization|set-cookie|cookie|access_token|refresh_token)\s*[:=]/i.test(line)
      ? "<redacted credential line>" : line)
    .join("\n");
}

async function cleanup() {
  const ownedBrowser = browser;
  browser = undefined;
  try { await ownedBrowser?.close(); } finally {
    if (server?.pid) {
      try { process.kill(-server.pid, "SIGTERM"); } catch (error) { if (error.code !== "ESRCH") throw error; }
      server = undefined;
    }
  }
}
