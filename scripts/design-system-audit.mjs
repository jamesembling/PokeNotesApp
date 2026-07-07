import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sourceRoots = ["app", "components", "lib"];
const sourceExtensions = new Set([".css", ".ts", ".tsx"]);
const allowedDirectPrimitiveFiles = new Set([
  "components/shadcn/dialog.tsx",
  "components/shadcn/tabs.tsx",
  "components/ui/AppDialog.tsx",
  "components/ui/SegmentedControl.tsx"
]);

const disallowedPatterns = [
  {
    pattern: /hover:brightness-\[0\.98\]/,
    message: "Use rolloverStyles instead of inline hover brightness."
  },
  {
    pattern: /(?:lg:)?hover:-translate-y-0\.5/,
    message: "Use rolloverStyles instead of inline hover lift."
  },
  {
    pattern: /lg:hover:shadow-\[var\(--shadow-sm\)\]/,
    message: "Use rolloverStyles instead of inline hover shadow."
  },
  {
    pattern: /group-hover:text-primary/,
    message: "Keep rollover utilities container-only; do not change child text color on row/card hover."
  },
  {
    pattern: /hover:bg-white/,
    message: "Use button or background tokens instead of hardcoded white hover backgrounds."
  },
  {
    pattern: /filter:\s*["']drop-shadow\(/,
    message: "Use a named shadow token instead of inline image drop shadows."
  },
  {
    pattern: /className="flex max-h-\[calc\(100dvh-[^"]*shadow-\[var\(--shadow-lg\)\]/,
    message: "Use AppDialogContent instead of copying dialog shell classes."
  }
];

function walk(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") {
        return [];
      }
      return walk(fullPath);
    }

    return sourceExtensions.has(path.extname(entry.name)) ? [fullPath] : [];
  });
}

function getLineNumber(content, index) {
  return content.slice(0, index).split("\n").length;
}

const files = sourceRoots.flatMap((sourceRoot) => walk(path.join(root, sourceRoot)));
const globalsPath = path.join(root, "app/globals.css");
const globals = fs.readFileSync(globalsPath, "utf8");
const definedTokens = new Set([...globals.matchAll(/--([a-zA-Z0-9-]+)\s*:/g)].map((match) => match[1]));
const dynamicTokenPrefixes = ["radix-"];
const componentScopedTokens = new Set([
  "cell-radius",
  "cell-size",
  "radius-md",
  "sidebar-width",
  "sidebar-width-icon",
  "skeleton-width"
]);
const failures = [];

for (const filePath of files) {
  const relativePath = path.relative(root, filePath);
  const content = fs.readFileSync(filePath, "utf8");

  for (const { pattern, message } of disallowedPatterns) {
    const match = pattern.exec(content);
    if (match) {
      failures.push(`${relativePath}:${getLineNumber(content, match.index)} ${message}`);
    }
  }

  if (!allowedDirectPrimitiveFiles.has(relativePath)) {
    if (/\bDialogContent\b/.test(content)) {
      failures.push(`${relativePath}: Use AppDialogContent instead of direct DialogContent.`);
    }
    if (/\bTabsList\b|\bTabsTrigger\b/.test(content)) {
      failures.push(`${relativePath}: Use SegmentedControl instead of direct TabsList/TabsTrigger.`);
    }
  }

  for (const match of content.matchAll(/var\(--([a-zA-Z0-9-]+)\)/g)) {
    const tokenName = match[1];
    const isDynamicToken = dynamicTokenPrefixes.some((prefix) => tokenName.startsWith(prefix));
    const isComponentScopedToken = componentScopedTokens.has(tokenName);
    if (!definedTokens.has(tokenName) && !isDynamicToken && !isComponentScopedToken) {
      failures.push(`${relativePath}:${getLineNumber(content, match.index)} Undefined CSS token --${tokenName}.`);
    }
  }
}

if (failures.length > 0) {
  console.error("Design-system audit failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Design-system audit passed.");
