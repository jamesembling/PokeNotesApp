#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { chromium } from "playwright";
import { parse as parseEnv } from "dotenv";
import sharp from "sharp";

const root = fileURLToPath(new URL("..", import.meta.url));
const baseUrl = "http://localhost:3010";
const secondEmail = "social-friend@pokenotes.local";
const secondPassword = `Local-social-${randomBytes(18).toString("base64url")}!9`;
const reviewOnly = process.argv.length === 3 && process.argv[2] === "--review-only";
let stage = "preflight";
let server;
let browser;
let page;
let friendPage;
let artifacts;
let environment = {};
let db;
let secondUserId;
let ownerUserId;
let cleanupPromise;
const uploadedAvatarPaths = [];

if (process.argv.includes("--help")) {
  console.log("npm run e2e:local:social\nResets only the synthetic localhost database, starts port 3010, and verifies discoverable profiles, avatars and accepted-friend privacy in one journey with two synthetic accounts. Removes its second account and closes browser/app afterward. Optional --review-only reuses the existing synthetic fixtures and captures keyboard/contrast/responsive evidence without resetting or creating an account. Port 3010 must be free. No target or credential overrides are accepted.");
  process.exit(0);
}
assert.ok(process.argv.length === 2 || reviewOnly, "This local-only command accepts no target overrides.");
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, async () => {
    await cleanup();
    process.exit(signal === "SIGINT" ? 130 : 143);
  });
}

try {
  assert.ok(existsSync(chromium.executablePath()), "Install the pinned browser first: npx playwright install chromium");
  await requireFreePort();
  checkpoint(reviewOnly ? "reuse synthetic fixtures for review" : "reset synthetic fixtures");
  if (!reviewOnly) execFileSync(process.execPath, ["scripts/local-e2e.mjs", "reset"], { cwd: root, stdio: "inherit", timeout: 180000 });
  environment = parseEnv(readFileSync(resolve(root, ".env.e2e.local")));
  const api = new URL(environment.NEXT_PUBLIC_SUPABASE_URL);
  assert.equal(environment.POKENOTES_E2E_LOCAL, "1", "Missing local-only marker.");
  assert.ok(["http://localhost:54321", "http://127.0.0.1:54321"].includes(api.origin), "Refusing a hosted database.");
  assert.equal(environment.POKE_NOTES_TEST_LOGIN_EMAIL, "e2e@pokenotes.local");
  assert.ok(environment.POKE_NOTES_LOCAL_LOGIN_CODE, "Missing synthetic pairing code.");
  db = createClient(api.origin, environment.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(10000) }) }
  });
  const owner = await db.from("decks").select("user_id").eq("id", "e2e-deck-dragapult").single();
  if (owner.error) throw owner.error;
  ownerUserId = owner.data.user_id;
  if (!reviewOnly) {
    const created = await db.auth.admin.createUser({ email: secondEmail, password: secondPassword, email_confirm: true, user_metadata: { full_name: "E2E Friend" } });
    if (created.error) throw created.error;
    assert.ok(created.data.user, "Missing second synthetic account.");
    secondUserId = created.data.user.id;
  }

  checkpoint("start isolated app");
  artifacts = mkdtempSync(resolve(tmpdir(), "pokenotes-social-"));
  const output = openSync(resolve(artifacts, "server.log"), "w", 0o600);
  server = spawn(process.execPath, ["scripts/local-e2e.mjs", "dev"], { cwd: root, detached: true, stdio: ["ignore", output, output] });
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

  checkpoint(reviewOnly ? "authenticate the synthetic review account" : "authenticate both synthetic accounts");
  browser = await chromium.launch({ headless: true });
  const context = await localContext();
  page = await context.newPage();
  await page.goto(`${baseUrl}/login`);
  await page.getByLabel("Local pairing code", { exact: true }).fill(environment.POKE_NOTES_LOCAL_LOGIN_CODE);
  await Promise.all([page.waitForURL(`${baseUrl}/dashboard`), page.getByRole("button", { name: "Sign in locally", exact: true }).click()]);

  if (reviewOnly) {
    checkpoint("inspect existing profile and friends surfaces");
    await page.goto(`${baseUrl}/players/${ownerUserId}`);
    await captureResponsive(page, "profiles-v2-player-inspection");
    await page.goto(`${baseUrl}/friends`);
    await captureResponsive(page, "profiles-v2-friends-inspection");
    await page.goto(`${baseUrl}/profile`);
    await page.getByRole("button", { name: "Save player profile", exact: true }).waitFor();
    await captureResponsive(page, "profiles-v2-account-inspection");
    console.log("PASS: targeted local responsive, keyboard-focus and computed-contrast inspection (existing synthetic fixtures, no reset).");
  } else {
    const friendContext = await localContext();
    friendPage = await friendContext.newPage();

    // Use the normal Supabase password exchange and SSR cookie adapter. The application
    // receives verified session cookies, with no injected React or application state.
    const authCookies = new Map();
    const friendAuth = createServerClient(api.origin, environment.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      cookies: { getAll: () => [...authCookies.values()].map(({ name, value }) => ({ name, value })), setAll: cookies => { for (const cookie of cookies) authCookies.set(cookie.name, cookie); } }
    });
    const signedIn = await friendAuth.auth.signInWithPassword({ email: secondEmail, password: secondPassword });
    if (signedIn.error) throw signedIn.error;
    assert.equal(signedIn.data.user?.id, secondUserId);
    await friendContext.addCookies([...authCookies.values()].map(({ name, value, options }) => ({ name, value, domain: "localhost", path: options.path || "/", httpOnly: options.httpOnly || false, secure: false, sameSite: "Lax" })));
    await friendPage.goto(`${baseUrl}/profile`);
    assert.equal(new URL(friendPage.url()).pathname, "/profile", "The second session must reach the authenticated app.");
    await friendPage.getByRole("heading", { level: 1 }).waitFor();

    await runJourney();
    console.log("PASS: automatic discovery → avatar persistence/retry → ordered showcase → request → accepted-friend privacy → access revoked (one local browser journey).");
  }
} catch (error) {
  console.error(`FAIL at ${stage}: ${redact(error.message)}`);
  if (artifacts) {
    for (const [name, currentPage] of [["owner", page], ["friend", friendPage]]) {
      if (!currentPage) continue;
      try { writeFileSync(resolve(artifacts, `${name}-browser.txt`), redact(await currentPage.locator("body").ariaSnapshot({ timeout: 3000 })), { mode: 0o600 }); } catch { /* Browser may itself be the failure. */ }
    }
    console.error(`Local diagnostics: ${artifacts}`);
  }
  process.exitCode = 1;
} finally {
  await cleanup();
  if (artifacts && !process.exitCode) rmSync(artifacts, { recursive: true, force: true });
}

async function runJourney() {
  const ownerName = "E2E Showcase Trainer";
  const friendName = "E2E Friend";
  const profilePath = `${baseUrl}/players/${ownerUserId}`;
  checkpoint("existing and new accounts are discoverable without showcase rows");
  const initialRows = await db.from("trainer_profiles").select("user_id").in("user_id", [ownerUserId, secondUserId]);
  if (initialRows.error) throw initialRows.error;
  assert.deepEqual(initialRows.data, [], "Both accounts must begin without a trainer showcase row.");
  await page.goto(profilePath);
  await page.getByRole("heading", { name: "Battle Log record", exact: true }).waitFor();
  const initialOwnerName = await page.getByRole("heading", { level: 1 }).textContent();
  assert.ok(initialOwnerName?.trim(), "An existing account must have a discoverable trainer identity immediately.");
  await friendPage.goto(`${baseUrl}/players/${secondUserId}`);
  await friendPage.getByRole("heading", { name: "Battle Log record", exact: true }).waitFor();
  const initialFriendName = await friendPage.getByRole("heading", { level: 1 }).textContent();
  assert.ok(initialFriendName?.trim(), "A fresh account must have a discoverable trainer identity immediately.");
  await findPlayer(page, initialFriendName);
  await page.getByRole("link", { name: initialFriendName, exact: true }).waitFor();
  await findPlayer(friendPage, initialOwnerName);
  await friendPage.getByRole("link", { name: initialOwnerName, exact: true }).click();
  await friendPage.waitForURL(profilePath);
  await assertPrivateRecord(friendPage);
  await assertFriendBadge(page, 0);
  await assertFriendBadge(friendPage, 0);
  await friendPage.getByRole("button", { name: `Add friend: ${initialOwnerName}`, exact: true }).click();
  await friendPage.getByRole("button", { name: `Cancel request: ${initialOwnerName}`, exact: true }).waitFor();
  await assertFriendBadge(friendPage, 0);
  await page.goto(`${baseUrl}/friends`);
  await assertFriendBadge(page, 1);
  await page.getByRole("button", { name: `Decline: ${initialFriendName}`, exact: true }).click();
  await page.getByRole("button", { name: `Decline: ${initialFriendName}`, exact: true }).waitFor({ state: "hidden" });
  await assertFriendBadge(page, 0);
  await friendPage.reload();
  await friendPage.getByRole("button", { name: `Add friend: ${initialOwnerName}`, exact: true }).click();
  await friendPage.getByRole("button", { name: `Cancel request: ${initialOwnerName}`, exact: true }).click();
  await friendPage.getByRole("button", { name: `Add friend: ${initialOwnerName}`, exact: true }).waitFor();

  checkpoint("personalize two already discoverable profiles with last-login consent off");
  await friendPage.goto(`${baseUrl}/profile`);
  assert.equal(await friendPage.getByRole("checkbox", { name: /^Enable my player profile/ }).count(), 0, "Discovery must have no opt-in control.");
  assert.equal(await friendPage.getByRole("checkbox", { name: /^Share last login with friends/ }).isChecked(), false, "Fresh accounts must not share last login.");
  await friendPage.getByLabel("Trainer name", { exact: true }).fill(friendName);
  await saveShowcase(friendPage);
  await page.goto(`${baseUrl}/profile`);
  assert.equal(await page.getByRole("checkbox", { name: /^Enable my player profile/ }).count(), 0);
  assert.equal(await page.getByRole("checkbox", { name: /^Share last login with friends/ }).isChecked(), false);
  await page.getByLabel("Trainer name", { exact: true }).fill(ownerName);
  await saveShowcase(page);
  await verifyAvatarJourney(page);

  checkpoint("save and reload a favourite Pokémon and three ordered artworks");
  await page.getByLabel("Favourite Pokémon", { exact: true }).fill("Dragapult");
  await page.getByRole("button", { name: /^Dragapult(?: Dragapult)?$/ }).click();
  const response = await responseFor(page, response => new URL(response.url()).pathname === "/api/card-art-options" && new URL(response.url()).searchParams.get("q") === "Charizard", () => page.getByLabel("Favourite card art", { exact: true }).fill("Charizard"));
  assert.equal(response.status(), 200, "The real public artwork provider must be available.");
  const { options } = await response.json();
  assert.ok(Array.isArray(options) && options.length >= 3, "Public artwork search must offer at least three distinct Charizard printings.");
  // Public Scarlet/Violet print identities are stable journey inputs; arbitrary
  // newest search results can include a forthcoming printing with no artwork yet.
  const selected = [["PAF", "234"], ["MEW", "199"], ["OBF", "223"]].map(([set, number]) => options.find(card => card.set === set && card.number === number));
  assert.ok(selected.every(Boolean), "Public artwork search must include the three known Charizard ex printings.");
  assert.equal(new Set(selected.map(card => `${card.set}/${card.number}`)).size, 3);
  for (const card of selected) await page.getByRole("button", { name: `Choose ${card.name}, ${card.set} ${card.number}`, exact: true }).click();
  const last = selected[2];
  await page.getByRole("button", { name: `Move ${last.name}, ${last.set} ${last.number} earlier`, exact: true }).click();
  await page.getByRole("button", { name: `Move ${last.name}, ${last.set} ${last.number} earlier`, exact: true }).click();
  const expected = [selected[2], selected[0], selected[1]];
  await saveShowcase(page);
  await page.reload();
  assert.equal(await page.getByRole("checkbox", { name: /^Share last login with friends/ }).isChecked(), false);
  assert.equal(await page.getByRole("button", { name: "Remove favourite Pokémon", exact: true }).count(), 1, "The favourite Pokémon must survive reload.");
  const savedCards = JSON.parse(await page.locator('input[name="favouriteCards"]').inputValue());
  assert.deepEqual(savedCards, expected, "The selected artwork order must survive reload.");

  checkpoint("find the player and verify stranger and pending-request privacy");
  await findPlayer(friendPage, ownerName);
  await friendPage.getByRole("link", { name: ownerName, exact: true }).click();
  await friendPage.waitForURL(profilePath);
  await assertPrivateRecord(friendPage);
  await friendPage.getByText("Favourite Pokémon · Dragapult", { exact: true }).waitFor();
  assert.deepEqual(await friendPage.locator('figure a[aria-label^="View "]').evaluateAll(links => links.map(link => link.getAttribute("aria-label"))), expected.map(card => `View ${card.name}, ${card.set} ${card.number} on Limitless`));
  assert.equal(await friendPage.getByText("e2e@pokenotes.local", { exact: false }).count(), 0, "Another member's email must remain private.");
  await friendPage.getByRole("button", { name: `Add friend: ${ownerName}`, exact: true }).click();
  await friendPage.getByRole("button", { name: `Cancel request: ${ownerName}`, exact: true }).waitFor();
  await assertFriendBadge(friendPage, 0);
  await friendPage.reload();
  await assertPrivateRecord(friendPage);

  checkpoint("accept the request and expose only the shared Battle Log summary");
  await page.goto(`${baseUrl}/friends`);
  await assertFriendBadge(page, 1);
  await captureIncomingBadge(page);
  await page.getByRole("button", { name: `Accept request: ${friendName}`, exact: true }).click();
  await page.getByRole("button", { name: `Remove friend: ${friendName}`, exact: true }).waitFor();
  await assertFriendBadge(page, 0);
  await friendPage.reload();
  const record = friendPage.locator("section").filter({ has: friendPage.getByRole("heading", { name: "Battle Log record", exact: true }) });
  await record.locator("dl").first().waitFor();
  for (const [label, expectedValue] of [["Wins", "2"], ["Losses", "1"], ["Games logged", "3"]]) {
    assert.equal(await record.locator("dl > div").filter({ has: friendPage.getByText(label, { exact: true }) }).locator("dd").textContent(), expectedValue);
  }
  assert.equal(await record.locator("time").count(), 0, "Acceptance alone must not turn on last-login sharing.");
  assert.equal(await record.getByText("All saved Battle Logs. Win rate uses wins and losses. Tournament rounds are separate.", { exact: true }).count(), 0, "The removed explanatory sentence must stay absent.");

  checkpoint("explicitly enable last-login sharing and verify it for the accepted friend");
  await page.goto(`${baseUrl}/profile`);
  await page.getByRole("checkbox", { name: /^Share last login with friends/ }).check();
  await saveShowcase(page);
  await friendPage.reload();
  const login = record.locator("dl > div").filter({ has: friendPage.getByText("Last login", { exact: true }) });
  await login.locator("dd time[datetime]").waitFor();
  assert.match(await login.locator("dd time span").textContent(), /London time/, "Shared last login must have a separate time row.");
  assert.ok(Number.isFinite(Date.parse(await record.locator("time").getAttribute("datetime"))), "Shared last-login timestamps must be valid.");
  await until(() => friendPage.locator("figure").evaluateAll(figures => figures.length === 3 && figures.every(figure => {
    const image = figure.querySelector("img");
    return image ? image.complete && image.naturalWidth > 0 : figure.textContent.includes("Artwork unavailable");
  })), 20000);
  await captureResponsive(friendPage, "profiles-v2-player");
  await page.goto(`${baseUrl}/friends`);
  await captureResponsive(page, "profiles-v2-friends");

  await page.goto(`${baseUrl}/profile`);
  await captureResponsive(page, "profiles-v2-account");
  await page.goto(`${baseUrl}/friends`);

  checkpoint("remove the friendship and revoke both stats and last-login access");
  await page.getByRole("button", { name: `Remove friend: ${friendName}`, exact: true }).click();
  await page.getByText("No friends yet. Find a player and send a friend request to get started.", { exact: true }).waitFor();
  await friendPage.reload();
  await friendPage.getByRole("button", { name: `Add friend: ${ownerName}`, exact: true }).waitFor();
  await assertPrivateRecord(friendPage);

  checkpoint("replace the uploaded avatar with a preset and persist it");
  await page.goto(`${baseUrl}/profile`);
  await page.getByRole("button", { name: "Change profile picture", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Profile picture", exact: true });
  const presetSaved = await responseFor(page, response => response.request().method() === "POST" && new URL(response.url()).pathname === "/profile", () => dialog.getByText("green", { exact: true }).click());
  assert.equal(presetSaved.status(), 200);
  await until(() => dialog.getByRole("radio", { name: "green", exact: true }).isEnabled());
  await page.keyboard.press("Escape");
  await page.reload();
  await until(() => page.getByRole("button", { name: "Change profile picture", exact: true }).locator("img").evaluateAll(images => images.length === 1 && images[0].src.endsWith("/profile-icons/poke-ball-icon-green.svg") && images[0].complete && images[0].naturalWidth > 0));

}

async function verifyAvatarJourney(currentPage) {
  checkpoint("keyboard avatar dialog and preset persistence");
  const open = currentPage.getByRole("button", { name: "Change profile picture", exact: true, includeHidden: true });
  await open.focus();
  await currentPage.keyboard.press("Enter");
  const dialog = currentPage.getByRole("dialog", { name: "Profile picture", exact: true });
  await dialog.waitFor();
  for (let index = 0; index < 12; index += 1) {
    await currentPage.keyboard.press("Tab");
    assert.equal(await dialog.evaluate(element => element.contains(document.activeElement)), true, "Avatar dialog must retain keyboard focus.");
  }
  const reviewDirectory = resolve(root, ".impeccable/review");
  mkdirSync(reviewDirectory, { recursive: true });
  await dialog.screenshot({ path: resolve(reviewDirectory, "profiles-v2-avatar-keyboard-desktop.png"), animations: "disabled" });
  await currentPage.setViewportSize({ width: 390, height: 844 });
  const mobileDialog = await dialog.evaluate(element => {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height, viewportWidth: window.innerWidth, viewportHeight: window.innerHeight, clientHeight: element.clientHeight, scrollHeight: element.scrollHeight, overflowY: style.overflowY };
  });
  assert.ok(mobileDialog.left >= 0 && mobileDialog.right <= mobileDialog.viewportWidth && mobileDialog.top >= 0 && mobileDialog.bottom <= mobileDialog.viewportHeight, "The avatar chooser must fit within the mobile viewport.");
  assert.ok(mobileDialog.scrollHeight <= mobileDialog.clientHeight || ["auto", "scroll"].includes(mobileDialog.overflowY), "Overflowing avatar chooser content must remain scrollable.");
  await currentPage.keyboard.press("Tab");
  assert.equal(await dialog.evaluate(element => element.contains(document.activeElement)), true, "The mobile avatar chooser must retain keyboard focus.");
  console.log(`Avatar mobile dialog inspection: ${JSON.stringify(mobileDialog)}`);
  await currentPage.setViewportSize({ width: 1280, height: 900 });
  await currentPage.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  assert.equal(await open.evaluate(element => element === document.activeElement), true, "Closing the dialog must restore focus to the hero avatar.");
  console.log("Avatar keyboard inspection: Enter opens, 12 Tabs stay in dialog, Escape restores hero focus.");
  await currentPage.keyboard.press("Enter");
  const presetSaved = await responseFor(currentPage, response => response.request().method() === "POST" && new URL(response.url()).pathname === "/profile", () => dialog.getByText("blue", { exact: true }).click());
  assert.equal(presetSaved.status(), 200);
  await until(() => dialog.getByRole("radio", { name: "blue", exact: true }).isEnabled());
  await currentPage.keyboard.press("Escape");
  await currentPage.reload();
  await until(() => open.locator("img").evaluateAll(images => images.length === 1 && images[0].src.endsWith("/profile-icons/poke-ball-icon-blue.svg") && images[0].complete && images[0].naturalWidth > 0));
  await saveAccountDetails(currentPage);
  await currentPage.reload();
  await until(() => open.locator("img").evaluateAll(images => images.length === 1 && images[0].src.endsWith("/profile-icons/poke-ball-icon-blue.svg") && images[0].complete && images[0].naturalWidth > 0));

  checkpoint("custom avatar upload failure is visible and retry persists");
  const fixture = resolve(artifacts, "synthetic-avatar.png");
  await sharp({ create: { width: 24, height: 24, channels: 3, background: { r: 28, g: 91, b: 160 } } }).png().toFile(fixture);
  await open.click();
  const file = dialog.getByLabel("Upload profile image", { exact: true });
  const failedUpload = route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Synthetic upload unavailable. Try again." }) });
  await currentPage.route("**/api/profile/avatar", failedUpload);
  await file.setInputFiles(fixture);
  await dialog.getByRole("button", { name: "Save picture", exact: true }).click();
  await dialog.getByRole("alert").filter({ hasText: "Synthetic upload unavailable. Try again." }).waitFor();
  assert.equal(await open.locator("img").getAttribute("src"), "/profile-icons/poke-ball-icon-blue.svg", "A failed upload must preserve the saved preset.");
  await currentPage.unroute("**/api/profile/avatar", failedUpload);
  const response = await responseFor(currentPage, response => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/profile/avatar", () => dialog.getByRole("button", { name: "Save picture", exact: true }).click());
  const result = await response.json();
  assert.equal(response.status(), 200, `The retry must save a real PNG through the upload API. ${result.error || ""}`);
  assert.ok(result.avatarPath?.startsWith(`${ownerUserId}/`), "Uploaded avatar paths must belong to the synthetic owner.");
  assert.ok(result.avatarUrl);
  uploadedAvatarPaths.push(result.avatarPath);
  await currentPage.keyboard.press("Escape");
  await currentPage.reload();
  await until(() => open.locator("img").evaluateAll((images, source) => images.length === 1 && images[0].src === source && images[0].complete && images[0].naturalWidth > 0 && images[0].naturalWidth === images[0].naturalHeight && images[0].naturalWidth <= 512, result.avatarUrl));
  await saveAccountDetails(currentPage);
  await currentPage.reload();
  await until(() => open.locator("img").evaluateAll((images, source) => images.length === 1 && images[0].src === source && images[0].complete && images[0].naturalWidth > 0, result.avatarUrl));
  await friendPage.goto(`${baseUrl}/players/${ownerUserId}`);
  await until(() => friendPage.locator("main img").evaluateAll((images, source) => images.some(image => image.src === source && image.complete && image.naturalWidth > 0), result.avatarUrl));
}

async function responseFor(currentPage, predicate, interact) {
  // Both branches are observed immediately so an interaction failure cannot leave
  // a response timeout unhandled and bypass the runner's resource cleanup.
  const [response, interaction] = await Promise.allSettled([currentPage.waitForResponse(predicate), interact()]);
  if (interaction.status === "rejected") throw interaction.reason;
  if (response.status === "rejected") throw response.reason;
  return response.value;
}

async function saveAccountDetails(currentPage) {
  checkpoint("account save preserves the selected avatar");
  await currentPage.locator("summary").filter({ hasText: "Edit account details" }).click();
  const saved = await responseFor(currentPage, response => response.request().method() === "POST" && new URL(response.url()).pathname === "/profile", () => currentPage.getByRole("button", { name: "Save Profile", exact: true }).click());
  assert.equal(saved.status(), 200);
  await currentPage.getByRole("status").filter({ hasText: /^Profile saved\.$/ }).waitFor();
}

async function saveShowcase(currentPage) {
  const status = currentPage.getByRole("status").filter({ hasText: /^Player profile saved\.$/ });
  // Existing success text can remain mounted through another save. Wait for the
  // actual server-action response, then check its visible outcome.
  const saved = await responseFor(currentPage, response => response.request().method() === "POST" && new URL(response.url()).pathname === "/profile", () => currentPage.getByRole("button", { name: "Save player profile", exact: true }).click());
  assert.equal(saved.status(), 200);
  await status.waitFor();
  await until(() => currentPage.getByRole("button", { name: "Save player profile", exact: true }).isEnabled());
}

async function findPlayer(currentPage, trainerName) {
  await currentPage.goto(`${baseUrl}/friends`);
  await currentPage.getByLabel("Trainer name", { exact: true }).fill(trainerName);
  await Promise.all([currentPage.waitForURL(url => url.pathname === "/friends" && url.searchParams.get("q") === trainerName), currentPage.getByRole("button", { name: "Search players", exact: true }).click()]);
}

async function assertPrivateRecord(currentPage) {
  const section = currentPage.locator("section").filter({ has: currentPage.getByRole("heading", { name: "Battle Log record", exact: true }) });
  await section.getByText("Battle Log totals are shared with accepted friends. Individual logs and deck information remain private.", { exact: true }).waitFor();
  assert.equal(await section.locator("dl").count(), 0, "Unaccepted members must not see stats.");
  assert.equal(await section.locator("time").count(), 0, "Unaccepted members must not see last login.");
}

async function captureResponsive(currentPage, name) {
  const directory = resolve(root, ".impeccable/review");
  mkdirSync(directory, { recursive: true });
  const pathName = new URL(currentPage.url()).pathname;
  if (pathName.startsWith("/players/")) {
    await currentPage.getByRole("heading", { name: "Battle Log record", exact: true }).waitFor();
    await until(() => currentPage.locator("figure").evaluateAll(figures => figures.every(figure => {
      const image = figure.querySelector("img");
      return image ? image.complete && image.naturalWidth > 0 : figure.textContent.includes("Artwork unavailable");
    })));
  } else if (pathName === "/friends") {
    await currentPage.getByRole("button", { name: "Search players", exact: true }).waitFor();
  } else if (pathName === "/profile") {
    await currentPage.getByRole("button", { name: "Save player profile", exact: true }).waitFor();
    await currentPage.getByText("Loading Pokémon…", { exact: true }).waitFor({ state: "hidden" });
  }
  for (const theme of ["light", "dark"]) {
    const toggle = currentPage.locator("main").getByRole("button", { name: theme === "light" ? "Switch to light mode" : "Switch to dark mode", exact: true });
    if (await toggle.count()) await toggle.click();
    await currentPage.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await until(() => currentPage.evaluate(() => !document.getAnimations().some(animation => animation.playState === "running" && animation.effect?.getTiming().iterations !== Infinity)), 3000);
    for (const [label, viewport] of [["desktop", { width: 1280, height: 900 }], ["mobile", { width: 390, height: 844 }], ["iab", { width: 1233, height: 860 }]]) {
      await currentPage.setViewportSize(viewport);
      await currentPage.evaluate(() => document.fonts.ready);
      assert.equal(await currentPage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, `${name} must not overflow at ${label} width.`);
      await readyImages(currentPage);
      const controls = pathName === "/friends" ? await searchControlHeights(currentPage) : null;
      const visibleCaptions = pathName.startsWith("/players/") ? await currentPage.locator("figure figcaption").evaluateAll(captions => captions.filter(caption => {
        const box = caption.getBoundingClientRect();
        return box.width > 2 && box.height > 2 && getComputedStyle(caption).visibility !== "hidden";
      }).map(caption => caption.textContent)) : [];
      assert.deepEqual(visibleCaptions, [], "Favourite artworks must not display card-name captions.");
      const focus = await inspectKeyboardFocus(currentPage);
      assert.equal(focus.missing, undefined, "Keyboard inspection must reach a visible social control.");
      assert.equal(focus.focusVisible && focus.visibleIndicator, true, "Keyboard focus must have a visible indicator in both themes.");
      const contrast = await inspectContrast(currentPage);
      const unavailableArtworks = await currentPage.getByText("Artwork unavailable", { exact: true }).count();
      console.log(`Review inspection: ${JSON.stringify({ surface: name, theme, viewport, overflow: false, controls, visibleCaptions, focus, contrast, unavailableArtworks })}`);
      const path = resolve(directory, `${name}-${theme === "light" ? "" : "dark-"}${label}.png`);
      await currentPage.screenshot({ path, fullPage: true, animations: "disabled", style: "nextjs-portal { display: none !important; }" });
      console.log(`Review screenshot: ${path}`);
    }
  }
  await currentPage.setViewportSize({ width: 1280, height: 900 });
  await currentPage.locator("main").getByRole("button", { name: "Switch to light mode", exact: true }).click();
}

async function assertFriendBadge(currentPage, expected) {
  const response = await currentPage.request.get(`${baseUrl}/api/friend-requests/count`);
  assert.equal(response.status(), 200, "The local authenticated request-count endpoint must be available.");
  assert.deepEqual(await response.json(), { count: expected }, "Only incoming pending requests must count.");
  const link = currentPage.locator('a[data-sidebar="menu-button"][href="/friends"]:visible').first();
  await link.waitFor();
  await until(() => link.locator("[data-friend-request-indicator]").count().then(count => count === (expected ? 1 : 0)));
  const description = await link.getAttribute("aria-describedby");
  if (expected) {
    assert.ok(description);
    assert.equal(await currentPage.locator(`[id="${description}"]`).textContent(), `${expected} pending friend request`);
    const dot = await link.locator("[data-friend-request-indicator]").evaluate(element => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return { width: box.width, height: box.height, background: style.backgroundColor, radius: style.borderRadius, display: style.display, shadow: style.boxShadow, rowBackground: getComputedStyle(element.closest("a")).backgroundColor };
    });
    assert.equal(dot.display === "none", false, "The notification circle must remain visible.");
    assert.equal(dot.width, 8);
    assert.equal(dot.height, 8);
    assert.ok(dot.background !== dot.rowBackground || (dot.shadow !== "none" && !dot.shadow.includes(dot.background)), "The red notification circle must remain distinguishable from the active Friends row.");
    console.log(`Incoming request indicator: ${JSON.stringify(dot)}`);
  } else assert.equal(description, null, "No incoming request must leave no badge description.");
}

async function captureIncomingBadge(currentPage) {
  const directory = resolve(root, ".impeccable/review");
  mkdirSync(directory, { recursive: true });
  const light = currentPage.locator("main").getByRole("button", { name: "Switch to light mode", exact: true });
  if (await light.count()) await light.click();
  await readyImages(currentPage);
  await currentPage.screenshot({ path: resolve(directory, "profiles-v2-friends-incoming-desktop.png"), fullPage: true, animations: "disabled", style: "nextjs-portal { display: none !important; }" });
  await currentPage.locator("main").getByRole("button", { name: "Toggle Sidebar", exact: true }).click();
  await settleFiniteAnimations(currentPage);
  await assertFriendBadge(currentPage, 1);
  await currentPage.screenshot({ path: resolve(directory, "profiles-v2-friends-incoming-collapsed.png"), fullPage: true, animations: "disabled", style: "nextjs-portal { display: none !important; }" });
  await currentPage.locator("main").getByRole("button", { name: "Toggle Sidebar", exact: true }).click();
  await currentPage.setViewportSize({ width: 390, height: 844 });
  await currentPage.getByRole("button", { name: "Open navigation menu", exact: true }).click();
  await settleFiniteAnimations(currentPage);
  await assertFriendBadge(currentPage, 1);
  await currentPage.screenshot({ path: resolve(directory, "profiles-v2-friends-incoming-mobile.png"), fullPage: true, animations: "disabled", style: "nextjs-portal { display: none !important; }" });
  await currentPage.getByRole("button", { name: "Close navigation menu", exact: true }).click();
  await currentPage.setViewportSize({ width: 1280, height: 900 });
  await settleFiniteAnimations(currentPage);
}

async function searchControlHeights(currentPage) {
  const input = await currentPage.getByLabel("Trainer name", { exact: true }).boundingBox();
  const button = await currentPage.getByRole("button", { name: "Search players", exact: true }).boundingBox();
  assert.ok(input && button, "Search controls must be visible.");
  assert.ok(Math.abs(input.height - button.height) <= 1, "The Friends search input and button must have equal rendered heights.");
  return { input: input.height, button: button.height };
}

async function readyImages(currentPage) {
  const images = currentPage.locator("main img");
  for (const image of await images.all()) {
    if (await image.isVisible()) await image.scrollIntoViewIfNeeded();
  }
  await until(() => images.evaluateAll(elements => elements.every(image => image.complete && image.naturalWidth > 0)));
  await currentPage.evaluate(() => window.scrollTo(0, 0));
}

async function inspectKeyboardFocus(currentPage) {
  const checkbox = currentPage.getByRole("checkbox", { name: /^Share last login with friends/ });
  const editLink = currentPage.getByRole("link", { name: /^Edit (?:player )?profile$/ }).first();
  const relationshipButton = currentPage.getByRole("button", { name: /^(?:Add|Remove) friend:/ }).first();
  const target = await checkbox.count() ? checkbox : await editLink.count() ? editLink : relationshipButton;
  if (!await target.count()) return { missing: "No social control was available for keyboard inspection." };
  const startingControl = await target.evaluate(element => ({ label: element.getAttribute("aria-label") || element.getAttribute("name") || element.textContent.trim(), tabIndex: element.tabIndex, disabled: element.hasAttribute("disabled"), inert: !!element.closest("[inert]") }));
  await target.focus();
  await settleFiniteAnimations(currentPage);
  // Measure after the starting control owns focus so a control left focused
  // by the previous viewport cannot become its own misleading baseline.
  const baseline = await currentPage.locator("main button, main a, main input, main summary").evaluateAll(elements => elements.map(element => getComputedStyle(element).borderColor));
  await currentPage.keyboard.press("Tab");
  await settleFiniteAnimations(currentPage);
  const focus = await currentPage.evaluate(baseline => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !active.closest("main") || active.closest("nav")) return null;
    const label = active.getAttribute("aria-label") || active.labels?.[0]?.textContent?.trim() || active.textContent?.trim() || active.getAttribute("name") || active.tagName;
    const style = getComputedStyle(active);
    const opaqueOutline = parseFloat(style.outlineWidth) > 0 && style.outlineStyle !== "none" && !/rgba\([^)]*,\s*0\)$/.test(style.outlineColor);
    const index = [...document.querySelectorAll("main button, main a, main input, main summary")].indexOf(active);
    const baselineBorder = baseline[index];
    const changedBorder = parseFloat(style.borderWidth) > 0 && baselineBorder && baselineBorder !== style.borderColor;
    return { label: label.slice(0, 80), focusVisible: active.matches(":focus-visible"), outline: style.outline, shadow: style.boxShadow, border: style.borderColor, baselineBorder, visibleIndicator: Boolean(opaqueOutline || style.boxShadow !== "none" || changedBorder) };
  }, baseline);
  return focus ? { startingControl, tabs: 1, ...focus } : { startingControl, missing: "Tab did not reach another social control; the global development shell focus order needs separate inspection." };
}

async function settleFiniteAnimations(currentPage) {
  await currentPage.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await until(() => currentPage.evaluate(() => !document.getAnimations().some(animation => animation.playState === "running" && animation.effect?.getTiming().iterations !== Infinity)), 3000);
}

async function inspectContrast(currentPage) {
  return currentPage.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const rgba = color => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data].map((value, index) => index === 3 ? value / 255 : value);
    };
    const blend = (foreground, background) => foreground.slice(0, 3).map((channel, index) => channel * foreground[3] + background[index] * (1 - foreground[3]));
    const luminance = color => color.map(channel => { const value = channel / 255; return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4; }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    const measurements = [...document.querySelectorAll("main h1, main h2, main p, main dt, main figcaption")].filter(element => element.getBoundingClientRect().width > 0).map(element => {
      const style = getComputedStyle(element);
      const ancestors = [];
      for (let current = element; current; current = current.parentElement) ancestors.unshift(current);
      let background = [255, 255, 255];
      for (const ancestor of ancestors) background = blend(rgba(getComputedStyle(ancestor).backgroundColor), background);
      const foreground = blend(rgba(style.color), background);
      const luminances = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
      const ratio = (luminances[0] + 0.05) / (luminances[1] + 0.05);
      const large = parseFloat(style.fontSize) >= 24 || (parseFloat(style.fontSize) >= 18.66 && parseInt(style.fontWeight) >= 700);
      return { text: element.textContent.trim().slice(0, 70), ratio: Math.round(ratio * 100) / 100, required: large ? 3 : 4.5, foreground: foreground.map(Math.round), background: background.map(Math.round) };
    });
    const failures = measurements.filter(item => item.ratio < item.required);
    return { sampled: measurements.length, minimum: Math.min(...measurements.map(item => item.ratio)), failures };
  });
}

function checkpoint(value) { stage = value; console.log(`[social-check] ${value}`); }

async function localContext() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  context.setDefaultTimeout(20000);
  await context.route("**/*", route => {
    const url = new URL(route.request().url());
    const local = ["localhost", "127.0.0.1"].includes(url.hostname);
    const publicArtwork = url.protocol === "https:" && ["limitlesstcg.nyc3.cdn.digitaloceanspaces.com", "r2.limitlesstcg.net"].includes(url.hostname);
    return local || publicArtwork ? route.continue() : route.abort();
  });
  return context;
}

async function until(predicate, timeout = 20000) {
  const deadline = Date.now() + timeout;
  do { if (await predicate()) return; await delay(200); } while (Date.now() < deadline);
  throw new Error(`Expected checkpoint was not reached within ${timeout / 1000} seconds.`);
}

async function requireFreePort() {
  for (const host of ["0.0.0.0", "::"]) {
    await new Promise((accept, reject) => {
      const probe = createServer();
      probe.once("error", error => error.code === "EAFNOSUPPORT" ? accept() : reject(new Error("Port 3010 is occupied. Stop dev:e2e before the self-contained social check.")));
      probe.listen(3010, host, () => probe.close(accept));
    });
  }
}

function redact(message) {
  let result = String(message).replaceAll(secondPassword, "<redacted>");
  for (const [key, value] of Object.entries(environment)) if (/KEY|PASSWORD|CODE/.test(key) && value) result = result.replaceAll(value, "<redacted>");
  return result;
}

function cleanup() {
  cleanupPromise ??= cleanupResources();
  return cleanupPromise;
}

async function cleanupResources() {
  const ownedBrowser = browser;
  browser = undefined;
  try { await ownedBrowser?.close(); } finally {
    if (uploadedAvatarPaths.length && db && ownerUserId) {
      const restored = await db.from("profiles").update({ avatar_path: null }).eq("id", ownerUserId);
      const removed = await db.storage.from("profile-avatars").remove(uploadedAvatarPaths);
      if (restored.error || removed.error) {
        console.error(`Synthetic avatar cleanup failed: ${redact((restored.error || removed.error).message)}`);
        process.exitCode = 1;
      }
    }
    if (secondUserId && db) {
      const result = await db.auth.admin.deleteUser(secondUserId);
      if (result.error) { console.error(`Synthetic account cleanup failed: ${redact(result.error.message)}`); process.exitCode = 1; }
      if (!result.error) console.log("Removed the journey-created synthetic friend account.");
      secondUserId = undefined;
    }
    if (server?.pid) {
      const ownedServer = server;
      try { process.kill(-ownedServer.pid, "SIGTERM"); } catch (error) { if (error.code !== "ESRCH") throw error; }
      server = undefined;
      await Promise.race([new Promise(resolve => ownedServer.once("exit", resolve)), delay(2000)]);
      if (ownedServer.exitCode === null && ownedServer.signalCode === null) {
        try { process.kill(-ownedServer.pid, "SIGKILL"); } catch (error) { if (error.code !== "ESRCH") throw error; }
      }
    }
  }
}
