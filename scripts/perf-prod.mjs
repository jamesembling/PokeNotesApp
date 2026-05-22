#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
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
const testLoginSecret = String(args.get("--test-login-secret") || process.env.PERF_TEST_LOGIN_SECRET || "");

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
  --test-login-secret=<secret>
  --save-auth
`);
  process.exit(0);
}

function buildJourney(routePath) {
  return [
    "/logs",
    routePath,
    "/logs",
    "/decks",
    "/tournaments",
    "/stats",
    "/calculator",
    "/logs"
  ];
}

function runAgentBrowser(commandArgs, options = {}) {
  const fullArgs = [
    "--session",
    session,
    "--allowed-domains",
    Array.from(new Set([
      baseHost,
      baseHostname,
      "poke-notes-app.vercel.app",
      "*.vercel.app",
      "*.supabase.co",
      "*.supabase.in"
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

function discoverFirstLogPath() {
  openPath("/logs");

  const discoveredPath = runWithState([
    "eval",
    `Array.from(document.querySelectorAll('a[href^="/logs/"]'))
      .map((anchor) => anchor.getAttribute('href'))
      .find((href) => href && href !== '/logs') || ''`
  ]).trim().replace(/^"|"$/g, "");

  if (!discoveredPath) {
    throw new Error("No battle log detail link found on /logs. Pass --log-path=/logs/<id>.");
  }

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

  if (testLoginSecret) {
    const testLoginUrl = new URL("/auth/test-login", baseUrl);
    testLoginUrl.searchParams.set("secret", testLoginSecret);
    console.log(`Opening secret-gated test login with session "${session}".`);
    runAgentBrowser(["open", testLoginUrl.toString()], { stdio: "inherit" });
    waitForRouteSettled(false);
    runAgentBrowser(["state", "save", statePath], { stdio: "inherit" });
    console.log(`Saved auth state to ${statePath}`);
    return;
  }

  console.log(`Opening ${baseUrl}/logs with session "${session}". Log in if needed, then come back here.`);
  runAgentBrowser(["open", `${baseUrl}/logs`], { stdio: "inherit" });
  runAgentBrowser(["wait", String(authWaitMs)], {
    stdio: "inherit",
    timeoutMs: authWaitMs + 5000
  });
  runAgentBrowser(["state", "save", statePath], { stdio: "inherit" });
  console.log(`Saved auth state to ${statePath}`);
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

const routePath = configuredRoutePath || discoverFirstLogPath();
const journey = buildJourney(routePath);

console.log(`Production performance journey`);
console.log(`base: ${baseUrl}`);
console.log(`viewport: ${viewport}`);
console.log(`session: ${session}`);
console.log(`state: ${statePath}`);
console.log(`log path: ${routePath}`);
console.log("");

const hardLoads = [];
for (const path of ["/logs", routePath, "/calculator"]) {
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

console.log("");
console.log("Done. Fresh RUM rows should also appear in Supabase route_performance_events.");
