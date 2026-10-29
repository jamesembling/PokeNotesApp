#!/usr/bin/env node

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";

// Stage only redacted text, including when the journey was killed before its finally block.
export function collectSocialFailureDiagnostics({
  tempRoot = process.env.RUNNER_TEMP || tmpdir(),
  outputRoot = resolve(".agent-browser/social-check"),
  environmentPath = resolve(".env.e2e.local")
} = {}) {
  const environment = {
    ...process.env,
    ...(existsSync(environmentPath) ? parse(readFileSync(environmentPath)) : {})
  };
  const credentials = Object.entries(environment)
    .filter(([key, value]) => /KEY|PASSWORD|CODE|SECRET|TOKEN/i.test(key) && value)
    .map(([, value]) => value)
    .sort((a, b) => b.length - a.length);
  const redact = (text) => {
    for (const value of credentials) text = text.replaceAll(value, "<redacted>");
    return text
      .replace(/Local-social-[A-Za-z0-9_-]+!9/g, "<redacted password>")
      .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "<redacted JWT>")
      .split("\n")
      .map((line) =>
        /(?:authorization|set-cookie|cookie|access_token|refresh_token)\s*["']?\s*[:=]/i.test(line)
          ? "<redacted credential line>"
          : line
      )
      .join("\n");
  };

  let count = 0;
  for (const directory of readdirSync(tempRoot, { withFileTypes: true })) {
    if (!directory.isDirectory() || !directory.name.startsWith("pokenotes-social-")) continue;
    for (const name of ["server.log", "owner-browser.txt", "friend-browser.txt"]) {
      const source = join(tempRoot, directory.name, name);
      if (!existsSync(source) || !lstatSync(source).isFile()) continue;
      const destination = join(outputRoot, directory.name);
      mkdirSync(destination, { recursive: true });
      writeFileSync(join(destination, name), redact(readFileSync(source, "utf8")), { mode: 0o600 });
      count += 1;
    }
  }
  return count;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Staged ${collectSocialFailureDiagnostics()} redacted social diagnostic file(s).`);
}
