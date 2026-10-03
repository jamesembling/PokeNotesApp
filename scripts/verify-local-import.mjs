#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { parse as parseEnv } from "dotenv";
import sharp from "sharp";

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
const replayCaptures = [];
const blockedNetworkOrigins = new Set();

if (process.argv.includes("--help")) {
  console.log("npm run e2e:local:import [-- --expired-session]\nResets the synthetic local database, starts port 3010, signs in, and checks paste, review, save, reload, catalogue learning and saved Battle Replay navigation/playback. The authenticated variant also checks replay layouts, paging and ownership; the expired-session variant verifies refresh during deck-options loading before saving. Closes its browser and app afterward; leaves the local database available for inspection. Port 3010 must be free. No hosted target or credentials are accepted.");
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
    if (["localhost", "127.0.0.1"].includes(url.hostname)) return route.continue();
    blockedNetworkOrigins.add(url.origin);
    return route.abort();
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
  await verifyBattleReplay(db, userId, saved.id);
  assert.equal((await logs()).length, 4, "Replay verification must preserve the four saved logs.");
  assert.equal(saveRequests, 1, "Replay verification must not send an import save request.");
  console.log(`PASS: ${expiredSession ? "expired-session" : "authenticated"} paste → review → save → reload → learned review → saved replay (${Math.round(performance.now() - journeyStarted)} ms, local diagnostic only).`);
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

async function verifyBattleReplay(db, userId, logId) {
  checkpoint("open the saved Battle Log replay and preserve source actions");
  const errors = [];
  const consoleMessages = [];
  const captureError = error => errors.push(error.message);
  const captureConsole = message => {
    if (["warning", "error"].includes(message.type())) consoleMessages.push({ type: message.type(), text: redact(message.text()) });
  };
  page.on("pageerror", captureError);
  page.on("console", captureConsole);
  const original = await query(db.from("logs").select("*").eq("id", logId).single());
  const replayPath = `/replays/${logId}`;
  const scrubber = page.getByRole("slider", { name: "Scrub through battle replay", exact: true });
  const position = () => scrubber.inputValue();
  const summaries = original.sections.flatMap(section => section.actions.map(action => action.title
    .replaceAll(`${original.self_player_name}'s`, "Your")
    .replaceAll(`${original.opponent_player_name}'s`, "Opponent's")
    .replaceAll(original.self_player_name, "You")
    .replaceAll(original.opponent_player_name, "Opponent")
    .replace(/\bYou wins\b/g, "You win")
    .replace(/\bYou ended their turn\b/g, "You ended your turn")));
  await page.goto(`${baseUrl}/logs/${logId}`);
  await page.getByRole("link", { name: /^Replay battle(?: Beta| \(Beta\))?$/ }).click();
  await page.waitForURL(`${baseUrl}${replayPath}`);
  await scrubber.waitFor();
  assert.equal(await position(), "0");
  assert.equal(Number(await scrubber.getAttribute("max")), summaries.length,
    "Every saved source action must have a separate replay position.");
  for (const summary of summaries) {
    assert.equal(await page.getByText(summary, { exact: true }).and(page.locator("ol button p")).count(), 1,
      "The timeline must preserve each saved source action exactly once.");
  }
  await page.getByText("Unrecorded information stays unknown.", { exact: false }).waitFor();
  assert.ok(await page.getByLabel("Deck count unknown", { exact: true }).count() === 2);
  assert.ok(await page.getByLabel("Prize cards remaining unknown", { exact: true }).count() === 2);
  const diagnostics = page.locator("details").filter({ has: page.locator("summary", { hasText: /^Partial replay/ }) });
  assert.equal(await diagnostics.count(), 1, "Replay limitations must remain available beside the board.");
  await diagnostics.locator("summary").click();
  assert.equal(await diagnostics.getAttribute("open"), "");
  const diagnosticText = diagnostics.getByText("Recorded actions remain available.", { exact: false });
  await diagnosticText.waitFor();
  const diagnosticBox = await diagnosticText.boundingBox();
  assert.ok(diagnosticBox && diagnosticBox.width >= 200, "Expanded diagnostics must have readable line width.");
  await diagnostics.locator("summary").click();

  checkpoint("step, seek, play, pause and reload the saved replay");
  await page.getByRole("button", { name: "Next action", exact: true }).click();
  assert.equal(await position(), "1");
  await page.getByRole("button", { name: "Previous action", exact: true }).click();
  assert.equal(await position(), "0");
  let actionOffset = 0;
  const turnStarts = original.sections.flatMap(section => {
    const start = actionOffset + 1;
    actionOffset += section.actions.length;
    return section.actions.length ? [start] : [];
  });
  for (const start of turnStarts) {
    await page.getByRole("button", { name: "Next turn", exact: true }).click();
    assert.equal(Number(await position()), start,
      "Turn navigation must reach every saved source section, including both players' same-numbered turns.");
  }
  for (const start of turnStarts.slice(0, -1).reverse()) {
    await page.getByRole("button", { name: "Previous turn", exact: true }).click();
    assert.equal(Number(await position()), start);
  }
  await scrubber.focus();
  await scrubber.press("End");
  await until(async () => Number(await position()) === summaries.length);
  const timeline = page.getByRole("list", { name: "Match actions", exact: true });
  const selectedAction = timeline.locator('[aria-current="step"]');
  await until(async () => selectedAction.evaluate(element => {
    const row = element.getBoundingClientRect();
    const list = element.closest("ol").getBoundingClientRect();
    // Scroll offsets are integer-rounded while DOM bounds retain fractional pixels.
    return row.top >= list.top - 1 && row.bottom <= list.bottom + 1;
  }));
  assert.equal(await selectedAction.count(), 1, "Seeking must expose exactly one current timeline action.");
  await page.getByRole("button", { name: "Restart replay", exact: true }).click();
  assert.equal(await position(), "0");
  await page.getByRole("button", { name: "Play replay", exact: true }).click();
  await until(async () => Number(await position()) > 0);
  await page.getByRole("button", { name: "Pause replay", exact: true }).click();
  const paused = await position();
  await until(async () => new URL(page.url()).searchParams.get("position") === paused);
  await page.reload();
  await scrubber.waitFor();
  assert.equal(await position(), paused, "Reload must restore the action encoded in the URL.");
  await page.getByRole("link", { name: "View Battle Log", exact: true }).click();
  await page.waitForURL(`${baseUrl}/logs/${logId}`);
  await page.getByRole("link", { name: /^Replay battle(?: Beta| \(Beta\))?$/ }).click();
  await scrubber.waitFor();

  if (!expiredSession) {
    await verifyReplayCollection(db, userId, original);
  }
  page.off("pageerror", captureError);
  page.off("console", captureConsole);
  const groupedConsole = [...consoleMessages.reduce((groups, message) => {
    const key = `${message.type}:${message.text}`;
    const group = groups.get(key) ?? { ...message, count: 0 };
    group.count++;
    groups.set(key, group);
    return groups;
  }, new Map()).values()];
  console.log(`[import-check] replay console ${JSON.stringify({ messages: groupedConsole,
    blockedNetworkOrigins: [...blockedNetworkOrigins] })}`);
  assert.deepEqual(errors, [], "Replay navigation and interaction must not raise browser exceptions.");
}

async function verifyReplayLayouts(scrubber) {
  checkpoint("review replay at desktop, available-panel and mobile widths");
  const reviewDir = resolve(root, ".impeccable/review");
  mkdirSync(reviewDir, { recursive: true });
  for (const [label, width, height] of [["desktop", 1440, 1000], ["iab", 1233, 860], ["panel", 980, 850], ["mobile", 390, 844]]) {
    await page.setViewportSize({ width, height });
    await scrubber.waitFor();
    checkpoint(`keep the selected timeline action visible after resizing to ${width}px`);
    const currentTimelineAction = page.getByRole("list", { name: "Match actions", exact: true }).locator('[aria-current="step"]');
    try {
      await until(async () => currentTimelineAction.evaluate(element => {
        const row = element.getBoundingClientRect();
        const list = element.closest("ol").getBoundingClientRect();
        // Scroll offsets are integer-rounded while DOM bounds retain fractional pixels.
        return row.top >= list.top - 1 && row.bottom <= list.bottom + 1;
      }), 5000);
    } catch (error) {
      console.error("[import-check] timeline resize geometry", await currentTimelineAction.evaluate(element => {
        const list = element.closest("ol");
        const rect = node => { const box = node.getBoundingClientRect(); return { top: box.top, bottom: box.bottom, width: box.width, height: box.height }; };
        return { row: rect(element), list: rect(list), scrollTop: list.scrollTop, scrollHeight: list.scrollHeight, clientHeight: list.clientHeight, scrollY, position: new URL(location.href).searchParams.get("position") };
      }));
      await captureReplay("battle-replay-timeline-resize-failure");
      throw error;
    }
    if (width < 860) {
      await page.getByRole("button", { name: "Open navigation menu", exact: true }).click();
      const betaLink = page.getByRole("link", { name: "Battle Replay (Beta)", exact: true });
      await betaLink.waitFor();
      assert.ok(await betaLink.getByText("Beta", { exact: true }).isVisible());
      await captureReplay("battle-replay-mobile-navigation", false);
      await page.getByRole("button", { name: "Close navigation menu", exact: true }).click();
    } else {
      const betaLink = page.getByRole("link", { name: "Battle Replay (Beta)", exact: true });
      assert.ok(await betaLink.isVisible());
      await page.locator('[data-sidebar="rail"]').click();
      assert.ok(await betaLink.isVisible(), "Collapsed sidebar must retain its accessible beta label.");
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        `Replay must fit ${label} width with a collapsed sidebar.`);
      await captureReplay(`battle-replay-${label}-collapsed`);
      await page.locator('[data-sidebar="rail"]').click();
    }
    for (const theme of ["light", "dark"]) {
      const toggle = page.getByRole("button", { name: `Switch to ${theme} mode`, exact: true });
      if (await toggle.isVisible()) await toggle.click();
      await until(() => page.locator("html").evaluate((element, dark) => element.classList.contains("dark") === dark, theme === "dark"));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        `Replay must fit ${label} width in ${theme} mode.`);
      await captureReplay(`battle-replay-${label}-${theme}`);
    }
    if (label === "desktop" || label === "mobile") {
      const diagnostics = page.locator("details").filter({ has: page.locator("summary", { hasText: /^Partial replay/ }) });
      assert.equal(await page.locator("summary", { hasText: /^Recorded source/ }).count(), 0,
        "Recorded source must not take space beneath the board.");
      await diagnostics.locator("summary").click();
      for (const detail of [diagnostics]) {
        const box = await detail.boundingBox();
        assert.ok(box && box.width >= 200 && box.x >= 0 && box.x + box.width <= width + 1,
          `Expanded ${label} replay evidence must stay readable within the viewport.`);
      }
      await captureReplay(`battle-replay-${label}-diagnostics-expanded`);
      await diagnostics.locator("summary").click();
    }
    const geometry = await page.getByRole("button", { name: "Preview Dreepy", exact: true }).boundingBox();
    console.log(`[import-check] replay ${label} ${width}px: Active card ${Math.round(geometry.width)}×${Math.round(geometry.height)}px`);
  }
  await page.setViewportSize({ width: 1280, height: 800 });
}

async function captureReplay(name, fullPage = true) {
  const path = resolve(root, ".impeccable/review", `${name}.png`);
  mkdirSync(resolve(root, ".impeccable/review"), { recursive: true });
  const pixels = await page.screenshot({ path, fullPage, animations: "disabled" });
  const capture = { path, viewport: page.viewportSize(),
    image: { width: pixels.readUInt32BE(16), height: pixels.readUInt32BE(20) }, capturedAt: new Date().toISOString() };
  replayCaptures.push(capture);
  writeFileSync(resolve(root, ".impeccable/review/battle-replay-manifest.json"),
    JSON.stringify({ variant, startedAt, captures: replayCaptures }, null, 2) + "\n");
  console.log(`[import-check] capture ${JSON.stringify(capture)}`);
  return pixels;
}

async function verifyPreviewLabel(dialog, name) {
  const label = dialog.getByText("HP ?", { exact: true });
  await label.waitFor();
  await captureReplay(name, false);
  const pixels = await label.screenshot({ animations: "disabled" });
  const surface = await label.evaluate(element => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const context = document.createElement("canvas").getContext("2d");
    const rgba = color => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data];
    };
    const probe = document.createElement("span");
    probe.style.color = "var(--card-foreground)";
    probe.style.backgroundColor = "var(--card)";
    element.appendChild(probe);
    const card = getComputedStyle(probe);
    const expected = { foreground: rgba(card.color), background: rgba(card.backgroundColor) };
    probe.remove();
    return { theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
      foreground: rgba(style.color), background: rgba(style.backgroundColor), expected,
      opacity: style.opacity, fontSize: style.fontSize,
      bounds: { left: rect.left, top: rect.top, width: rect.width, height: rect.height } };
  });
  assert.equal(surface.background[3], 255, "The unknown-HP label must have an opaque surface.");
  assert.equal(surface.opacity, "1");
  assert.deepEqual(surface.foreground, surface.expected.foreground, "The label must use the card foreground.");
  assert.deepEqual(surface.background, surface.expected.background, "The label must use the card surface.");
  const luminance = channels => channels.slice(0, 3).map(value => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
  const foreground = luminance(surface.foreground), background = luminance(surface.background);
  const contrast = (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
  assert.ok(contrast >= 4.5, "The unknown-HP label must meet normal-text contrast in each theme.");
  const pixel = [...await sharp(pixels).extract({ left: 8, top: Math.floor(pixels.readUInt32BE(20) / 2), width: 1, height: 1 }).ensureAlpha().raw().toBuffer()];
  const capturedBackground = luminance(pixel);
  const capturedContrast = (Math.max(foreground, capturedBackground) + 0.05) / (Math.min(foreground, capturedBackground) + 0.05);
  console.log(`[import-check] preview label ${JSON.stringify({ ...surface, contrast, pixel, capturedContrast })}`);
}

async function verifyReplayCollection(db, userId, original) {
  checkpoint("check replay paging, unavailable logs and account ownership");
  const rows = Array.from({ length: 31 }, (_, index) => ({ ...original, id: randomUUID(),
    date: original.date,
    created_at: new Date(Date.UTC(2025, 0, index + 1)).toISOString(),
    imported_at: new Date(Date.UTC(2025, 0, index + 1)).toISOString(),
    linked_deck_id: null, linked_deck_list_id: null, sections: [], raw_log: "Synthetic unsupported replay" }));
  const ids = rows.map(row => row.id);
  rows[0].raw_log = "Synthetic source-evidenced replay for card and discard inspection";
  rows[0].sections = [
    { title: "Setup", player: "", prizesAfterTurn: {}, actions: [
      { title: "E2ETrainer drew 7 cards for the opening hand.", details: ["• Dreepy, Munkidori, Torchic, Basic Fire Energy"] },
      { title: "FixtureOpponent drew 7 cards for the opening hand.", details: [] },
      { title: "E2ETrainer played Dreepy to the Active Spot.", details: [] },
      { title: "E2ETrainer played Munkidori to the Bench.", details: [] },
      { title: "FixtureOpponent played Torchic to the Active Spot.", details: [] }
    ] },
    { title: "E2ETrainer's Turn", player: "E2ETrainer", prizesAfterTurn: {}, actions: [
      { title: "E2ETrainer discarded a card.", details: ["• Basic Fire Energy"] },
      { title: "E2ETrainer's Dreepy is now Poisoned.", details: [] },
      { title: "E2ETrainer's Dreepy is now Burned.", details: [] },
      { title: "E2ETrainer rearranged unknown cards in their hand.", details: [] }
    ] }
  ];
  rows[2].raw_log = "Synthetic verified card-definition replay";
  rows[2].sections = [{ title: "Setup", player: "", prizesAfterTurn: {}, actions: [
    { title: "E2ETrainer played Seedling to the Active Spot.", details: [] },
    { title: "FixtureOpponent played Rival to the Active Spot.", details: [] },
  ] }, { title: "E2ETrainer's Turn", player: "E2ETrainer", prizesAfterTurn: {}, actions: [
    { title: "E2ETrainer attached Fixture Charm to Seedling in the Active Spot.", details: [] },
  ] }];
  const definitionGeneration = randomUUID();
  let definitionsCreated = false;
  let otherUserId;
  try {
    await query(db.from("logs").insert(rows));
    await page.goto(`${baseUrl}/replays/e2e-log-win-charizard`);
    const scrubber = page.getByRole("slider", { name: "Scrub through battle replay", exact: true });
    await scrubber.waitFor();
    assert.ok(Number(await scrubber.getAttribute("max")) > 0, "Existing text-ID Battle Logs must remain replayable.");
    await page.goto(`${baseUrl}/replays/${rows[0].id}`);
    await scrubber.waitFor();
    await scrubber.focus();
    await scrubber.press("Home");
    for (let action = 0; action < 6; action++) await scrubber.press("ArrowRight");
    await until(async () => await scrubber.inputValue() === "6");
    await captureReplay("battle-replay-discard-resolution");
    await scrubber.press("End");
    await until(async () => await scrubber.inputValue() === "9");
    assert.equal(await page.getByLabel("Poisoned", { exact: true }).count(), 1,
      "Only the explicitly poisoned Active Pokémon must receive its marker.");
    assert.equal(await page.getByLabel("Burned", { exact: true }).count(), 1,
      "Only the explicitly burned Active Pokémon must receive its marker.");
    const preview = page.getByRole("button", { name: "Preview Dreepy", exact: true });
    await preview.click();
    const cardDialog = page.getByRole("dialog", { name: "Dreepy", exact: true });
    await cardDialog.waitFor();
    await page.getByText("HP ?", { exact: true }).last().waitFor();
    for (let tab = 0; tab < 8; tab++) {
      await page.keyboard.press("Tab");
      assert.ok(await cardDialog.evaluate(element => element.contains(document.activeElement)),
        "Keyboard focus must remain inside the card preview.");
    }
    await verifyPreviewLabel(cardDialog, "battle-replay-card-preview-conditions");
    checkpoint("restore card preview focus after Escape");
    await page.keyboard.press("Escape");
    await requireRestoredFocus(preview, "Preview Dreepy");
    await page.getByRole("button", { name: "Switch to dark mode", exact: true }).click();
    await preview.click();
    await cardDialog.waitFor();
    await verifyPreviewLabel(cardDialog, "battle-replay-card-preview-conditions-dark");
    await page.keyboard.press("Escape");
    await requireRestoredFocus(preview, "Preview Dreepy");
    await page.getByRole("button", { name: "Switch to light mode", exact: true }).click();
    const discard = page.locator('section[data-actor="self"]').getByRole("button", { name: "View discard, total count unknown", exact: true });
    await discard.click();
    const gallery = page.getByRole("dialog", { name: "Your discard pile", exact: true });
    await gallery.waitFor();
    await gallery.getByText("1 known card · total unknown · identified cards, newest first", { exact: true }).waitFor();
    const discardedCard = gallery.getByRole("button", { name: "Preview Basic Fire Energy", exact: true });
    await discardedCard.waitFor();
    await captureReplay("battle-replay-discard-gallery", false);
    await discardedCard.click();
    await page.getByRole("dialog", { name: "Basic Fire Energy", exact: true }).waitFor();
    await captureReplay("battle-replay-discard-card-preview", false);
    await page.keyboard.press("Escape");
    await requireRestoredFocus(discardedCard, "Preview Basic Fire Energy in discard gallery");
    checkpoint("restore discard gallery focus after Escape");
    await page.keyboard.press("Escape");
    await requireRestoredFocus(discard, "View discard, total count unknown");
    await verifyReplayLayouts(scrubber);
    checkpoint("verify published card definitions reach replay HP and card preview");
    const syntheticDefinitions = [
      { name: "Seedling", hp: 70, category: "Pokemon", trainerType: null, rules: [] },
      { name: "Rival", hp: 80, category: "Pokemon", trainerType: null, rules: [] },
      { name: "Fixture Charm", hp: null, category: "Trainer", trainerType: "Tool", rules: ["The Pokémon this card is attached to gets +100 HP."] },
    ].map((card, index) => ({ source: "tcgdex", sourceCardId: `e2e-definition-${index}`, setId: "synthetic", localId: String(index),
      setReleaseDate: "2025-01-01", stage: card.category === "Pokemon" ? "Basic" : null, types: card.category === "Pokemon" ? ["Grass"] : null,
      evolvesFrom: null, regulationMark: null, abilities: index === 0
        ? [{ name: "Fixture Glow", text: "Once during your turn, you may draw a card.", type: "Ability" }] : [],
      attacks: card.category === "Pokemon" ? [{ name: "Tap", text: null, damage: "10", cost: ["Grass"] }] : [], sourceUpdatedAt: null,
      sourceUrl: `https://api.tcgdex.net/v2/en/cards/e2e-definition-${index}`, syncedAt: new Date().toISOString(), ...card }));
    await query(db.from("card_definition_generations").insert({ id: definitionGeneration, source: "tcgdex", expected_count: 3,
      source_manifest_hash: "synthetic-e2e", source_coverage: { scope: "tcgdex-listed-en-physical", listedPrintings: 3, unlistedSets: [] } }));
    definitionsCreated = true;
    await query(db.from("card_definition_catalog").insert(syntheticDefinitions.map(definition => ({
      generation_id: definitionGeneration, source_card_id: definition.sourceCardId, normalized_card_name: definition.name.toLowerCase(), definition,
    }))));
    await query(db.rpc("publish_card_definition_generation", { target_generation: definitionGeneration }));
    await page.goto(`${baseUrl}/replays/${rows[2].id}?position=3`);
    await page.getByRole("meter", { name: "Seedling: 170 of 170 HP remaining", exact: true }).waitFor();
    assert.equal(await page.getByRole("meter", { name: "Rival: 80 of 80 HP remaining", exact: true }).count(), 1,
      "An attached Tool must affect only its recorded physical target.");
    await page.getByLabel(`${rows[2].self_deck_name} Active Spot`, { exact: true }).getByRole("button", { name: "Preview Seedling", exact: true }).click();
    await page.getByRole("dialog", { name: "Seedling", exact: true }).getByText("170 / 170 HP", { exact: true }).waitFor();
    const definitionDialog = page.getByRole("dialog", { name: "Seedling", exact: true });
    const printedDetails = definitionDialog.getByRole("region", { name: "Card preview details", exact: true });
    assert.equal(await definitionDialog.getByText("Fixture Glow", { exact: true }).count(), 0,
      "Card previews show artwork and HP without printed Ability prose.");
    assert.equal(await definitionDialog.getByText("Tap", { exact: true }).count(), 0,
      "Card previews show artwork and HP without printed attack prose.");
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await until(() => printedDetails.evaluate(element => {
        const bounds = element.getBoundingClientRect();
        return bounds.top >= 0 && bounds.bottom <= window.innerHeight;
      }));
      const geometry = await printedDetails.evaluate(element => ({
        top: element.getBoundingClientRect().top, bottom: element.getBoundingClientRect().bottom,
        viewportHeight: window.innerHeight,
      }));
      assert.ok(geometry.top >= 0 && geometry.bottom <= geometry.viewportHeight,
        "Card artwork and HP must stay in the viewport at desktop and mobile widths.");
      const hpBounds = await definitionDialog.getByText("170 / 170 HP", { exact: true }).boundingBox();
      const regionBounds = await printedDetails.boundingBox();
      assert.ok(hpBounds && regionBounds && hpBounds.y >= regionBounds.y &&
        hpBounds.y + hpBounds.height <= regionBounds.y + regionBounds.height,
        "HP must remain visible beneath the enlarged card.");
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    const restoredPreview = await printedDetails.boundingBox();
    assert.ok(restoredPreview && restoredPreview.y >= 0 && restoredPreview.y + restoredPreview.height <= 900,
      "The details preview must remain in the viewport after restoring desktop size.");
    await captureReplay("battle-replay-verified-hp", false);
    await page.keyboard.press("Escape");
    await page.getByRole("link", { name: "Choose another game", exact: true }).click();
    const collection = page.getByRole("region", { name: "Your Battle Logs", exact: true });
    await collection.waitFor();
    assert.equal(await collection.getByRole("link").count(), 30, "The picker must bound its first page.");
    await Promise.all([
      page.waitForURL(url => url.pathname === "/replays" && url.searchParams.has("cursor")),
      page.getByRole("link", { name: "Older games", exact: true }).click()
    ]);
    await collection.waitFor();
    await until(async () => await collection.getByRole("link").count() === 2);
    assert.equal(await collection.getByRole("link").count(), 2, "The next page must contain the remaining games in this date window.");
    await page.goto(`${baseUrl}/replays/${rows[1].id}`);
    await page.getByRole("heading", { name: "This Battle Log cannot be replayed yet", exact: true }).waitFor();
    assert.equal(await page.getByRole("slider").count(), 0, "Unsupported logs must not render fabricated playback.");

    const otherUser = await db.auth.admin.createUser({ email: `replay-${randomUUID()}@pokenotes.local`, email_confirm: true });
    if (otherUser.error) throw otherUser.error;
    otherUserId = otherUser.data.user.id;
    const privateId = randomUUID();
    ids.push(privateId);
    await query(db.from("logs").insert({ ...rows[0], id: privateId, user_id: otherUserId }));
    await page.goto(`${baseUrl}/replays/${privateId}`);
    await page.getByRole("heading", { name: "Replay unavailable", exact: true }).waitFor();
    assert.equal(await page.getByRole("slider").count(), 0, "Another account's replay must not be exposed.");
    const anonymous = await browser.newContext();
    try {
      const anonymousPage = await anonymous.newPage();
      await anonymousPage.goto(`${baseUrl}/replays/${original.id}`);
      await anonymousPage.waitForURL(`${baseUrl}/login`);
    } finally { await anonymous.close(); }
  } finally {
    await query(db.from("logs").delete().in("id", ids));
    if (definitionsCreated) {
      await query(db.from("card_definition_active").delete().eq("generation_id", definitionGeneration));
      await query(db.from("card_definition_generations").delete().eq("id", definitionGeneration));
    }
    if (otherUserId) {
      const result = await db.auth.admin.deleteUser(otherUserId);
      if (result.error) throw result.error;
    }
  }
  await page.goto(`${baseUrl}/replays?cursor=${encodeURIComponent("0001-01-01")}`);
  await page.getByRole("heading", { name: "No Battle Logs to replay", exact: true }).waitFor();
  await page.goto(`${baseUrl}/replays`);
  await page.getByRole("region", { name: "Your Battle Logs", exact: true }).waitFor();
  assert.equal(await page.getByRole("region", { name: "Your Battle Logs", exact: true }).getByRole("link").count(), 1,
    "The latest date window must contain only the saved import after temporary records are removed.");
}

async function requireRestoredFocus(trigger, name) {
  try {
    await until(() => trigger.evaluate(element => document.activeElement === element), 2000);
  } catch {
    const active = await page.evaluate(() => ({ tag: document.activeElement?.tagName,
      label: document.activeElement?.getAttribute("aria-label"), text: document.activeElement?.textContent?.trim().slice(0, 100) }));
    assert.fail(`Escape must restore focus to ${name}; focused element: ${JSON.stringify(active)}`);
  }
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
