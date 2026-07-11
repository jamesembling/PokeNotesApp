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
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: resolve(rootDir, ".env"), quiet: true });
loadEnv({ path: resolve(rootDir, ".env.local"), override: false, quiet: true });

const agentBrowserBin = resolve(
  rootDir,
  process.platform === "win32"
    ? "node_modules/.bin/agent-browser.cmd"
    : "node_modules/.bin/agent-browser"
);
const defaultStatePath = resolve(rootDir, ".agent-browser/pokenotes-prod-auth.json");
const defaultBaseUrl = "https://poke-notes-app.vercel.app";
const defaultSession = `pokenotes-perf-${Date.now()}`;

const args = new Map();
for (const arg of process.argv.slice(2)) {
  const [key, ...rest] = arg.split("=");
  args.set(key, rest.length > 0 ? rest.join("=") : "true");
}

const baseUrl = String(args.get("--base-url") || process.env.PERF_BASE_URL || defaultBaseUrl).replace(/\/$/, "");
const baseUrlParts = new URL(baseUrl);
const baseHost = baseUrlParts.host;
const baseHostname = baseUrlParts.hostname;
const statePath = resolve(String(args.get("--state") || process.env.PERF_AUTH_STATE || defaultStatePath));
const session = String(args.get("--session") || process.env.PERF_SESSION || defaultSession);
const viewport = String(args.get("--viewport") || process.env.PERF_VIEWPORT || "1647x894");
const cold = args.get("--cold") !== "false";
const saveAuth = args.has("--save-auth");
const authWaitMs = Number(args.get("--auth-wait-ms") || process.env.PERF_AUTH_WAIT_MS || 120000);
const commandTimeoutMs = Number(args.get("--command-timeout-ms") || process.env.PERF_COMMAND_TIMEOUT_MS || 30000);
const routeWaitMs = Number(args.get("--route-wait-ms") || process.env.PERF_ROUTE_WAIT_MS || 15000);
const skipImportAction = args.has("--skip-import-action") || process.env.PERF_SKIP_IMPORT_ACTION === "1";
const onlyImportAction = args.has("--only-import-action") || process.env.PERF_ONLY_IMPORT_ACTION === "1";
const importActionUsername = String(
  args.get("--import-action-username") || process.env.PERF_IMPORT_ACTION_USERNAME || "CodexPerf"
);

const configuredRoutePath = String(args.get("--log-path") || process.env.PERF_LOG_PATH || "");

if (args.has("--help") || args.has("-h")) {
  console.log(`Usage:
  npm run perf:prod:auth
  npm run perf:prod
  npm run perf:prod -- --viewport=390x844 --session=iphone-check

Options:
  --base-url=https://poke-notes-app.vercel.app
  --log-path=/logs/<id>
  --state=.agent-browser/pokenotes-prod-auth.json
  --session=pokenotes-perf
  --viewport=1647x894
  --cold=false
  --auth-wait-ms=120000
  --command-timeout-ms=30000
  --route-wait-ms=15000
  --skip-import-action
  --only-import-action
  --import-action-username=CodexPerf
  --save-auth
`);
  process.exit(0);
}

const SAMPLE_IMPORT_LOG = `Setup
CodexPerf drew 7 cards for the opening hand
OpponentPerf drew 7 cards for the opening hand
CodexPerf won the coin toss.

Turn # 1 - CodexPerf's Turn
CodexPerf drew a card.
CodexPerf attached Basic Lightning Energy to Pikachu ex in the Active Spot.
CodexPerf used Thunderbolt for 120 damage.
OpponentPerf's Charmander took 120 damage.
CodexPerf took a Prize card.

Turn # 2 - OpponentPerf's Turn
OpponentPerf drew a card.
OpponentPerf attached Basic Fire Energy to Charmander in the Active Spot.
OpponentPerf used Ember for 30 damage.
CodexPerf's Pikachu ex took 30 damage.

Turn # 3 - CodexPerf's Turn
CodexPerf drew a card.
CodexPerf took 5 Prize cards.
OpponentPerf's Charmander was Knocked Out. CodexPerf wins.`;

function buildJourney(routePath) {
  return [
    "/logs",
    ...(routePath ? [routePath] : []),
    "/logs",
    "/decks",
    "/tournaments",
    "/stats",
    "/calculator",
    "/logs"
  ];
}

function runAgentBrowser(commandArgs, options = {}) {
  const authDomains = saveAuth
    ? ["accounts.google.com", "*.google.com", "*.googleusercontent.com"]
    : [];
  const fullArgs = [
    "--session",
    session,
    ...(saveAuth ? ["--headed"] : []),
    "--allowed-domains",
    Array.from(new Set([
      baseHost,
      baseHostname,
      "poke-notes-app.vercel.app",
      "*.vercel.app",
      "*.supabase.co",
      "*.supabase.in",
      ...authDomains
    ])).join(","),
    ...commandArgs
  ];

  return execFileSync(agentBrowserBin, fullArgs, {
    cwd: rootDir,
    encoding: "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
    timeout: options.timeoutMs ?? commandTimeoutMs
  });
}

function runWithState(commandArgs, options = {}) {
  return runAgentBrowser(["--state", statePath, ...commandArgs], options);
}

function parseViewport(value) {
  const match = value.match(/^(\d+)x(\d+)(?:x([\d.]+))?$/);
  if (!match) {
    throw new Error(`Invalid viewport "${value}". Use WIDTHxHEIGHT, for example 1647x894.`);
  }

  return {
    height: Number(match[2]),
    scale: match[3] ? Number(match[3]) : undefined,
    width: Number(match[1])
  };
}

function evalJson(expression) {
  const output = runWithState(["eval", `JSON.stringify(${expression})`]).trim();
  const jsonLine = output.split("\n").find((line) => line.trim().startsWith("{") || line.trim().startsWith("[") || line.trim().startsWith("\""));
  if (!jsonLine) {
    return null;
  }

  const parsed = JSON.parse(jsonLine);
  return typeof parsed === "string" ? JSON.parse(parsed) : parsed;
}

function evalBrowserJson(expression, options = {}) {
  const output = runWithState(["eval", expression], options).trim();
  const jsonLine = output.split("\n").find((line) => line.trim().startsWith("{") || line.trim().startsWith("[") || line.trim().startsWith("\""));
  if (!jsonLine) {
    return null;
  }

  const parsed = JSON.parse(jsonLine);
  return typeof parsed === "string" ? JSON.parse(parsed) : parsed;
}

function waitForRouteSettled(useSavedState = true) {
  const runner = useSavedState ? runWithState : runAgentBrowser;
  runner([
    "wait",
    "--fn",
    "document.readyState === 'complete' && !document.querySelector('[data-route-loading]')"
  ]);
}

function readNavigationSnapshot() {
  try {
    return evalJson(`(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      const origin = location.origin;
      const resources = performance.getEntriesByType('resource')
        .filter((entry) => entry.name.startsWith(origin) && !new URL(entry.name).pathname.startsWith('/api/performance-events'))
        .map((entry) => ({
          duration: Math.round(entry.duration),
          path: new URL(entry.name).pathname.replace(/\\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/ig, '/:id'),
          startTime: Math.round(entry.startTime),
          transferSize: entry.transferSize || 0
        }))
        .sort((left, right) => right.duration - left.duration);
      const connection = navigator.connection || {};
      return {
        currentPath: location.pathname.replace(/\\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/ig, '/:id'),
        domContentLoadedMs: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
        durationMs: nav ? Math.round(nav.duration) : null,
        effectiveType: connection.effectiveType || null,
        loadEventMs: nav ? Math.round(nav.loadEventEnd) : null,
        resources: resources.slice(0, 5),
        rtt: typeof connection.rtt === 'number' ? connection.rtt : null,
        slowestResource: resources[0] || null,
        ttfbMs: nav ? Math.round(nav.responseStart) : null,
        viewport: \`\${innerWidth}x\${innerHeight}\`
      };
    })()`);
  } catch {
    return null;
  }
}

function readPath() {
  return runWithState(["get", "url"]).trim().replace(baseUrl, "") || "/";
}

function readPathSafely() {
  try {
    return readPath();
  } catch {
    return "(unavailable)";
  }
}

function openPath(path) {
  runWithState(["open", `${baseUrl}${path}`]);
  waitForRouteSettled();
}

function readCurrentAuthUser() {
  return evalJson(`(() => {
    const authCookie = document.cookie
      .split('; ')
      .map((value) => value.split('='))
      .find(([name]) => name.startsWith('sb-') && name.endsWith('-auth-token'));
    if (!authCookie) {
      return null;
    }
    const rawValue = decodeURIComponent(authCookie.slice(1).join('='));
    const json = rawValue.startsWith('base64-') ? atob(rawValue.slice(7)) : rawValue;
    const parsed = JSON.parse(json);
    return {
      email: parsed.user?.email || '',
      id: parsed.user?.id || ''
    };
  })()`);
}

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEW_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEW_SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false
    }
  });
}

async function withImportProfileUsername(userId, username, callback) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error(
      "Missing Supabase service credentials; cannot set a temporary PTCGL username for the import action probe."
    );
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("ptcgl_username")
    .eq("id", userId)
    .single();

  if (profileError) {
    throw profileError;
  }

  const previousUsername = String(profile?.ptcgl_username || "");
  const shouldRestore = previousUsername !== username;

  if (shouldRestore) {
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ ptcgl_username: username })
      .eq("id", userId);
    if (updateError) {
      throw updateError;
    }
  }

  try {
    return await callback({ previousUsername, supabase });
  } finally {
    if (shouldRestore) {
      await supabase
        .from("profiles")
        .update({ ptcgl_username: previousUsername })
        .eq("id", userId);
    }
  }
}

async function cleanupImportedLog({ logId, supabase, userId }) {
  if (!logId) {
    return {
      cleanup: "skipped"
    };
  }

  const { error } = await supabase
    .from("logs")
    .delete()
    .eq("id", logId)
    .eq("user_id", userId);

  return {
    cleanup: error ? `failed:${error.message}` : "deleted"
  };
}

async function measureImportAction() {
  openPath("/logs");
  const authUser = readCurrentAuthUser();
  if (!authUser?.id) {
    throw new Error("Could not read the authenticated production user from the browser session.");
  }

  return await withImportProfileUsername(authUser.id, importActionUsername, async ({ supabase }) => {
    const actionResult = evalBrowserJson(`(async () => {
      const rawLog = ${JSON.stringify(SAMPLE_IMPORT_LOG.replaceAll("CodexPerf", importActionUsername))};
      const isVisible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      };
      const findVisibleButton = (label) => Array.from(document.querySelectorAll('button'))
        .find((candidate) => isVisible(candidate) && candidate.textContent.trim().includes(label));
      const clickButton = (label) => {
        const button = findVisibleButton(label);
        if (!button) {
          throw new Error(\`No visible "\${label}" button found.\`);
        }
        button.click();
      };
      const waitUntil = (predicate, label, timeoutMs = 30000) =>
        new Promise((resolve, reject) => {
          const deadline = performance.now() + timeoutMs;
          const tick = () => {
            try {
              if (predicate()) {
                resolve(true);
                return;
              }
            } catch {
              // Keep waiting until timeout; transient missing nodes are expected.
            }
            if (performance.now() > deadline) {
              reject(new Error(\`Timed out waiting for \${label}.\`));
              return;
            }
            requestAnimationFrame(tick);
          };
          tick();
        });
      const latestImportDataEntry = () => performance.getEntriesByType('resource')
        .filter((resource) => {
          try {
            return new URL(resource.name).pathname === '/api/import-dialog-data';
          } catch {
            return false;
          }
        })
        .toSorted((left, right) => right.startTime - left.startTime)[0] || null;
      const readDetailLogId = () => location.pathname.match(/^\\/logs\\/([0-9a-f-]{36})$/i)?.[1] || '';
      const readSavedListLogId = () => Array.from(document.querySelectorAll('a[href^="/logs/"]'))
        .map((anchor) => ({
          href: anchor.getAttribute('href') || '',
          text: anchor.textContent || ''
        }))
        .find((anchor) =>
          /OpponentPerf/.test(anchor.text) &&
          /^\\/logs\\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(anchor.href)
        )
        ?.href.match(/\\/logs\\/([0-9a-f-]{36})/i)?.[1] || '';

      performance.clearResourceTimings();
      const openStartedAt = performance.now();
      clickButton('Import PTCGL Log');
      await waitUntil(() => document.querySelector('#battle-log'), 'battle log textarea');
      await waitUntil(() => latestImportDataEntry(), 'import dialog data');
      await waitUntil(
        () => !Array.from(document.querySelectorAll('button')).some((button) => button.textContent.includes('Loading...')),
        'import dialog data state'
      );
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const openMs = Math.round(performance.now() - openStartedAt);
      const importData = latestImportDataEntry();

      const textarea = document.querySelector('#battle-log');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      if (setter) {
        setter.call(textarea, rawLog);
      } else {
        textarea.value = rawLog;
      }
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
      await waitUntil(() => findVisibleButton('Review PTCGL Log'), 'review button');

      const parseStartedAt = performance.now();
      clickButton('Review PTCGL Log');
      await waitUntil(
        () => document.body.textContent.includes('Review Battle Log') && findVisibleButton('Save Log'),
        'review stage'
      );
      const parseMs = Math.round(performance.now() - parseStartedAt);

      const saveStartedAt = performance.now();
      clickButton('Save Log');
      await waitUntil(
        () =>
          readDetailLogId() ||
          (readSavedListLogId() &&
            performance.now() - saveStartedAt > 2000 &&
            !document.querySelector('[data-route-loading]')),
        'saved log completion',
        45000
      );
      const saveMs = Math.round(performance.now() - saveStartedAt);
      const detailLogId = readDetailLogId();
      const listLogId = readSavedListLogId();
      const logId = detailLogId || listLogId;

      return JSON.stringify({
        detailPath: detailLogId ? '/logs/:id' : location.pathname,
        importDataMs: importData ? Math.round(importData.duration) : '-',
        importDataTransferSize: importData?.transferSize || '-',
        logId,
        openMs,
        parseMs,
        saveMs,
        status: detailLogId ? 'ok' : listLogId ? 'saved-without-navigation' : 'missing-log-id'
      });
    })()`, {
      timeoutMs: Math.max(commandTimeoutMs, 90000)
    });
    const logId = actionResult?.logId ?? "";
    const cleanup = await cleanupImportedLog({
      logId,
      supabase,
      userId: authUser.id
    });

    return {
      cleanup: cleanup.cleanup,
      detailPath: actionResult?.detailPath ?? "",
      importDataMs: actionResult?.importDataMs ?? "-",
      importDataTransferSize: actionResult?.importDataTransferSize ?? "-",
      openMs: actionResult?.openMs ?? "-",
      parseMs: actionResult?.parseMs ?? "-",
      saveMs: actionResult?.saveMs ?? "-",
      status: actionResult?.status ?? "missing-result"
    };
  });
}

function printImportActionResult(importAction) {
  console.log(`open dialog: ${importAction.openMs} ms`);
  console.log(`import data: ${importAction.importDataMs} ms (${importAction.importDataTransferSize} bytes)`);
  console.log(`review parse: ${importAction.parseMs} ms`);
  console.log(`save completion: ${importAction.saveMs} ms`);
  console.log(`status: ${importAction.status}; cleanup: ${importAction.cleanup}`);
}

function discoverFirstLogPath() {
  openPath("/logs");

  const discoveredPath = runWithState([
    "eval",
    `Array.from(document.querySelectorAll('a[href^="/logs/"]'))
      .map((anchor) => anchor.getAttribute('href'))
      .find((href) => href && /^\\/logs\\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(href)) || ''`
  ]).trim().replace(/^"|"$/g, "");

  return discoveredPath;
}

function clickPath(path) {
  const selector = `a[href="${path}"]`;
  let countOutput = "";
  try {
    countOutput = runWithState(["get", "count", selector]).trim();
  } catch (countError) {
    return {
      currentPath: readPathSafely().replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/ig, "/:id"),
      durationMs: 0,
      error: countError instanceof Error ? countError.message.split("\n")[0] : String(countError),
      status: "count-error"
    };
  }
  const count = Number(countOutput.match(/\d+/)?.[0] ?? 0);

  if (count < 1) {
    throw new Error(`No link found for ${path} from ${readPath()}.`);
  }

  const startedAt = performance.now();
  try {
    runWithState(["click", selector]);
  } catch (clickError) {
    const endedAt = performance.now();
    return {
      currentPath: readPathSafely().replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/ig, "/:id"),
      durationMs: Math.round(endedAt - startedAt),
      error: clickError instanceof Error ? clickError.message.split("\n")[0] : String(clickError),
      status: "click-error"
    };
  }
  let status = "ok";
  let error = "";

  try {
    runWithState(["wait", "--fn", `location.pathname === ${JSON.stringify(path)}`], {
      timeoutMs: routeWaitMs
    });
    waitForRouteSettled();
  } catch (routeError) {
    status = "wait-timeout";
    error = routeError instanceof Error ? routeError.message.split("\n")[0] : String(routeError);
  }

  const endedAt = performance.now();

  return {
    currentPath: readPathSafely().replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/ig, "/:id"),
    durationMs: Math.round(endedAt - startedAt),
    error,
    status
  };
}

function printTable(rows) {
  const widths = {
    from: Math.max(4, ...rows.map((row) => row.from.length)),
    to: Math.max(2, ...rows.map((row) => row.to.length)),
    duration: Math.max(8, ...rows.map((row) => String(row.durationMs).length)),
    slowest: Math.max(7, ...rows.map((row) => row.slowest.length)),
    slowestMs: Math.max(9, ...rows.map((row) => String(row.slowestMs).length)),
    status: Math.max(6, ...rows.map((row) => String(row.status ?? "ok").length))
  };

  console.log([
    "from".padEnd(widths.from),
    "to".padEnd(widths.to),
    "duration".padStart(widths.duration),
    "slowest".padEnd(widths.slowest),
    "slowest ms".padStart(widths.slowestMs),
    "status".padEnd(widths.status)
  ].join("  "));
  console.log("-".repeat(widths.from + widths.to + widths.duration + widths.slowest + widths.slowestMs + widths.status + 10));
  for (const row of rows) {
    console.log([
      row.from.padEnd(widths.from),
      row.to.padEnd(widths.to),
      String(row.durationMs).padStart(widths.duration),
      row.slowest.padEnd(widths.slowest),
      String(row.slowestMs).padStart(widths.slowestMs),
      String(row.status ?? "ok").padEnd(widths.status)
    ].join("  "));
  }
}

function saveAuthState() {
  mkdirSync(dirname(statePath), { recursive: true });

  console.log(
    `Opening ${baseUrl}/logs with session "${session}". Complete Google sign-in in the opened browser.`
  );
  runAgentBrowser(["open", `${baseUrl}/logs`], { stdio: "inherit" });
  runAgentBrowser(["wait", "--url", "**/logs**", "--timeout", String(authWaitMs)], {
    stdio: "inherit",
    timeoutMs: authWaitMs + 5000
  });

  const authenticatedUrl = new URL(runAgentBrowser(["get", "url"]).trim());
  if (authenticatedUrl.hostname !== baseHostname || authenticatedUrl.pathname === "/login") {
    throw new Error("Production authentication was not completed; auth state was not saved.");
  }

  runAgentBrowser(["state", "save", statePath], { stdio: "inherit" });
  sanitizeAuthState();
  chmodSync(statePath, 0o600);
  console.log(`Saved auth state to ${statePath}`);
}

function sanitizeAuthState() {
  let state;
  try {
    state = JSON.parse(readFileSync(statePath, "utf8"));
  } catch (error) {
    rmSync(statePath, { force: true });
    throw new Error("Saved production auth state could not be sanitized and was removed.", {
      cause: error
    });
  }
  const expectedHostname = baseHostname.toLowerCase();
  const expectedOrigin = baseUrlParts.origin;

  state.cookies = Array.isArray(state.cookies)
    ? state.cookies.filter(
        (cookie) =>
          String(cookie?.domain || "").replace(/^\./, "").toLowerCase() === expectedHostname
      )
    : [];
  state.origins = Array.isArray(state.origins)
    ? state.origins.filter((entry) => entry?.origin === expectedOrigin)
    : [];

  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}

if (saveAuth) {
  saveAuthState();
  process.exit(0);
}

if (!existsSync(statePath)) {
  console.error(`Missing auth state: ${statePath}`);
  console.error("Run: npm run perf:prod:auth");
  process.exit(1);
}

const parsedViewport = parseViewport(viewport);
if (cold) {
  rmSync(resolve(rootDir, `.agent-browser/perf-session-${session}`), {
    force: true,
    recursive: true
  });
}

runWithState(["set", "viewport", String(parsedViewport.width), String(parsedViewport.height), String(parsedViewport.scale ?? 1)]);

if (onlyImportAction) {
  console.log(`Production import action performance`);
  console.log(`base: ${baseUrl}`);
  console.log(`viewport: ${viewport}`);
  console.log(`session: ${session}`);
  console.log(`state: ${statePath}`);
  console.log("");
  try {
    printImportActionResult(await measureImportAction());
  } catch (error) {
    console.log(`status: failed`);
    console.log(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
  process.exit();
}

const routePath = configuredRoutePath || discoverFirstLogPath();
const journey = buildJourney(routePath);

console.log(`Production performance journey`);
console.log(`base: ${baseUrl}`);
console.log(`viewport: ${viewport}`);
console.log(`session: ${session}`);
console.log(`state: ${statePath}`);
console.log(`log path: ${routePath || "(none found; skipping detail leg)"}`);
console.log("");

const hardLoads = [];
for (const path of ["/logs", ...(routePath ? [routePath] : []), "/calculator"]) {
  openPath(path);
  hardLoads.push({
    path,
    status: "ok",
    snapshot: readNavigationSnapshot()
  });
}

openPath(journey[0]);
const routeRows = [];
for (const to of journey.slice(1)) {
  const from = readPathSafely().replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/ig, "/:id");
  const clickResult = clickPath(to);
  const snapshot = readNavigationSnapshot();
  const normalizedTo = to.replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/ig, "/:id");
  routeRows.push({
    durationMs: clickResult.durationMs,
    from,
    slowest: snapshot?.slowestResource?.path ?? "-",
    slowestMs: snapshot?.slowestResource?.duration ?? "-",
    status: clickResult.status === "ok" ? "ok" : `${clickResult.status}:${clickResult.currentPath}`,
    to: normalizedTo
  });
}

console.log("Hard loads");
printTable(
  hardLoads.map(({ path, snapshot, status }) => ({
    durationMs: snapshot?.durationMs ?? "-",
    from: "hard-load",
    slowest: snapshot?.slowestResource?.path ?? "-",
    slowestMs: snapshot?.slowestResource?.duration ?? "-",
    status,
    to: path.replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/ig, "/:id")
  }))
);

console.log("");
console.log("Route clicks");
printTable(routeRows);

if (!skipImportAction) {
  console.log("");
  console.log("Import action");
  try {
    printImportActionResult(await measureImportAction());
  } catch (error) {
    console.log(`status: failed`);
    console.log(error instanceof Error ? error.message : String(error));
  }
} else {
  console.log("");
  console.log("Import action");
  console.log("skipped (--skip-import-action)");
}

console.log("");
console.log("Done. Fresh RUM rows should also appear in Supabase route_performance_events.");
