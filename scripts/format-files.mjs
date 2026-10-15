#!/usr/bin/env node

import { readFile, realpath, stat, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import * as prettier from "prettier";

const root = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
const [mode, ...files] = process.argv.slice(2);
const extensions = new Set([
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".css",
  ".md",
  ".mdx",
  ".json",
  ".yml",
  ".yaml"
]);

try {
  if (!["check", "write"].includes(mode) || files.length === 0) {
    throw new Error("Name authored files explicitly: npm run format[:check] -- path/to/file.ts");
  }

  // Preflight and parse every input before writing any file in the batch.
  const prepared = new Map();
  for (const name of files) {
    if (name.startsWith("-") || isAbsolute(name) || /[*?{}]/.test(name)) {
      throw new Error(
        `${name}: use an explicit repository-relative file path, without globs/options`
      );
    }
    const path = resolve(root, name);
    const inside = relative(root, path);
    if (inside === ".." || inside.startsWith(`..${sep}`) || !inside) {
      throw new Error(`${name}: path must stay inside the repository`);
    }
    if (!extensions.has(extname(path))) {
      throw new Error(
        `${name}: unsupported file kind; SQL and non-authored asset formats are excluded`
      );
    }
    const info = await prettier.getFileInfo(path, {
      ignorePath: [resolve(root, ".prettierignore"), resolve(root, ".gitignore")],
      resolveConfig: false
    });
    if (info.ignored || !info.inferredParser) {
      throw new Error(`${name}: ignored/generated file or unsupported parser; no files written`);
    }
    if (!(await stat(path)).isFile() || (await realpath(path)) !== path) {
      throw new Error(`${name}: expected a regular file without symbolic links`);
    }
    const source = await readFile(path, "utf8");
    const config = await prettier.resolveConfig(resolve(root, ".prettierrc.json"));
    const formatted = await prettier.format(source, { ...config, filepath: path });
    prepared.set(path, { name, source, formatted });
  }

  let changed = 0;
  for (const [path, { name, source, formatted }] of prepared) {
    if (source === formatted) continue;
    changed += 1;
    if (mode === "write") await writeFile(path, formatted);
    console.log(`${mode === "write" ? "Formatted" : "Needs formatting"}: ${name}`);
  }
  console.log(`${prepared.size} explicit file(s) ${mode === "check" ? "checked" : "processed"}.`);
  if (mode === "check" && changed > 0) process.exitCode = 1;
} catch (error) {
  console.error(`Formatting failed: ${error.message}`);
  process.exitCode = 1;
}
