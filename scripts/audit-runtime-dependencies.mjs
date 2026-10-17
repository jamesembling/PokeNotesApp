#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// These roots execute only during lint/CSS compilation. Their findings remain
// visible below; they cannot exempt a package also reachable from a runtime root.
const BUILD_ONLY_ROOTS = new Set(["eslint", "eslint-config-next", "tailwindcss-animate"]);

function resolvePackage(packages, parent, name) {
  let directory = parent;
  for (;;) {
    const candidate = `${directory ? `${directory}/` : ""}node_modules/${name}`;
    if (packages[candidate]) return candidate;
    if (!directory) return null;
    directory = dirname(directory);
    if (directory === ".") directory = "";
  }
}

export function assessRuntimeAudit(lock, audit) {
  const packages = lock.packages;
  const runtime = new Set();
  const visit = (path) => {
    if (!path || runtime.has(path)) return;
    runtime.add(path);
    const entry = packages[path];
    for (const name of Object.keys({
      ...entry.dependencies,
      ...entry.optionalDependencies,
      ...entry.peerDependencies
    })) {
      visit(resolvePackage(packages, path, name));
    }
  };
  for (const name of Object.keys(packages[""].dependencies || {})) {
    if (!BUILD_ONLY_ROOTS.has(name)) visit(resolvePackage(packages, "", name));
  }
  const blocking = [];
  const buildOnly = [];
  for (const [name, finding] of Object.entries(audit.vulnerabilities || {})) {
    if (!["high", "critical"].includes(finding.severity)) continue;
    // Missing node evidence is ambiguous and therefore blocks release.
    if (!finding.nodes?.length || finding.nodes.some((node) => !packages[node] || runtime.has(node)))
      blocking.push(name);
    else buildOnly.push(name);
  }
  return { blocking, buildOnly };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const response = spawnSync(
    "npm",
    ["audit", "--omit=dev", "--json", "--fetch-retries=0", "--fetch-timeout=20000"],
    { encoding: "utf8" }
  );
  try {
    const audit = JSON.parse(response.stdout || "{}");
    if (response.error || audit.error || !audit.metadata || ![0, 1].includes(response.status)) {
      throw new Error("Dependency advisory review failed; inspect npm audit connectivity/output.");
    }
    const result = assessRuntimeAudit(JSON.parse(readFileSync("package-lock.json", "utf8")), audit);
    console.log(
      `Runtime high/critical findings: ${result.blocking.length}. Build-only high/critical findings: ${result.buildOnly.join(", ") || "none"}.`
    );
    if (result.blocking.length) {
      console.error(
        `Release blocked by runtime advisories: ${result.blocking.join(", ")}. Run npm audit for details; do not force unrelated upgrades.`
      );
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
