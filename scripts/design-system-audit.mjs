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
const rawColorLiteralAllowlist = new Set([
  "app/global-error.tsx",
  "app/globals.css",
  "lib/probability-calculator/index.ts"
]);
const rawColorFamilyPattern =
  /\b(?:bg|border|text|from|via|to|ring|stroke|fill)-(?:slate|amber|orange|sky)-[0-9]{2,3}(?:\/[0-9]{1,3})?\b/g;
const rawColorLiteralPattern = /(?:#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\))/g;
const rawWhiteTextPattern = /\b(?:dark:)?text-white\b/g;
const rawBlackOverlayPattern = /\bbg-black\/[0-9]{1,3}\b/g;
const emptyPageHeaderTitlePattern = /<PageHeader[\s\S]*?title=["']\s*["']/g;
const legacyPageHeaderDividerPattern = /\bshowDivider=/g;
const localPageHeaderDividerPattern = /<PageHeader[\s\S]*?\bdivider=/g;
const rawHeadingRecipePattern =
  /\b(?:text-\[2rem\]|sm:text-4xl|ui-section-title|font-display text-\[1\.(?:08|15|25)rem\]|text-\[1\.85rem\])/g;
const rawHeadingRecipeAllowlist = new Set([
  "components/ui/Typography.tsx",
  "components/ui/ImportLogDialog.tsx"
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
    pattern: /\btext-(?:win|loss|warning)(?!-strong)\b/,
    message: "Use strong semantic status tokens for normal text contrast."
  },
  {
    pattern: /\btext-destructive(?!-foreground)\b/,
    message: "Use text-loss-strong for destructive normal text contrast."
  },
  {
    pattern: /filter:\s*["']drop-shadow\(/,
    message: "Use a named shadow token instead of inline image drop shadows."
  },
  {
    pattern: /className="flex max-h-\[calc\(100dvh-[^"]*shadow-\[var\(--shadow-lg\)\]/,
    message: "Use AppDialogContent instead of copying dialog shell classes."
  },
  {
    pattern: /<ButtonGroup[^>]*className="[^"]*\bborder-t\b[^"]*"/,
    message: "Keep dialog separators on AppDialogFooter instead of button-width groups."
  },
  {
    pattern: emptyPageHeaderTitlePattern,
    message: "Do not pass empty PageHeader titles; use a shared detail header pattern instead."
  },
  {
    pattern: legacyPageHeaderDividerPattern,
    message: "Use PageHeader divider intent instead of legacy local showDivider overrides."
  },
  {
    pattern: localPageHeaderDividerPattern,
    message: "PageHeader dividers are global; do not override divider behavior locally."
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
// CSS Modules scope class names, not custom-property inheritance. Only these
// intentional replay variables may use declarations outside the global registry.
const replayCssPath = "components/battle-replay/battle-replay.module.css";
const replayCssTokens = new Set([
  "replay-pile-card-width",
  "replay-board-card-width",
  "replay-turn-angle",
  "preview-card-width",
]);
const replayInlineTokens = new Set(["pile-depth", "pile-offset"]);
const failures = [];

if (
  !/@media \(max-width: 859px\) \{[\s\S]*?input:not\(\[type="hidden"\]\),[\s\S]*?font-size: 1rem !important;/.test(
    globals
  )
) {
  failures.push("app/globals.css: Mobile editable controls must retain the 16px text safeguard.");
}

const appDialogPath = path.join(root, "components/ui/AppDialog.tsx");
const appDialogSource = fs.readFileSync(appDialogPath, "utf8");
for (const [name, nextName] of [
  ["AppDialogMobileFooter", "AppDialogFooter"],
  ["AppDialogFooter", "AppDialogBody"]
]) {
  const start = appDialogSource.indexOf(`export function ${name}(`);
  const end = appDialogSource.indexOf(`export function ${nextName}(`, start);
  const body = appDialogSource.slice(start, end < 0 ? undefined : end);
  if (start < 0 || !/border-t border-border/.test(body)) {
    failures.push(`components/ui/AppDialog.tsx: ${name} must own the full-width dialog separator.`);
  }
}

for (const filePath of files) {
  const relativePath = path.relative(root, filePath);
  const content = fs.readFileSync(filePath, "utf8");
  // Intentional local variables still need their declaration or registration.
  // A declaration in another selector does not admit arbitrary token names.
  const localCss = path.extname(filePath) === ".css" ? content.replace(/\/\*[\s\S]*?\*\//g, "") : "";
  const localTokens = new Set([
    ...[...localCss.matchAll(/--([a-zA-Z0-9-]+)\s*:/g)].map(match => match[1]),
    ...[...localCss.matchAll(/@property\s+--([a-zA-Z0-9-]+)/g)].map(match => match[1]),
  ]);

  for (const { pattern, message } of disallowedPatterns) {
    const match = pattern.exec(content);
    if (match) {
      failures.push(`${relativePath}:${getLineNumber(content, match.index)} ${message}`);
    }
    pattern.lastIndex = 0;
  }

  for (const match of content.matchAll(rawWhiteTextPattern)) {
    failures.push(`${relativePath}:${getLineNumber(content, match.index)} Use semantic text tokens instead of text-white/dark:text-white.`);
  }

  for (const match of content.matchAll(rawBlackOverlayPattern)) {
    failures.push(`${relativePath}:${getLineNumber(content, match.index)} Use overlay tokens instead of raw bg-black opacity classes.`);
  }

  for (const match of content.matchAll(rawColorFamilyPattern)) {
    failures.push(`${relativePath}:${getLineNumber(content, match.index)} Use semantic tokens/variants instead of raw Tailwind color families.`);
  }

  if (!rawColorLiteralAllowlist.has(relativePath)) {
    for (const match of content.matchAll(rawColorLiteralPattern)) {
      failures.push(`${relativePath}:${getLineNumber(content, match.index)} Use CSS tokens instead of raw color literals.`);
    }
  }

  if (!rawHeadingRecipeAllowlist.has(relativePath)) {
    for (const match of content.matchAll(rawHeadingRecipePattern)) {
      failures.push(`${relativePath}:${getLineNumber(content, match.index)} Use Typography primitives instead of local heading recipes.`);
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
    const isComponentScopedToken = componentScopedTokens.has(tokenName) ||
      relativePath === replayCssPath && (replayInlineTokens.has(tokenName) ||
        replayCssTokens.has(tokenName) && localTokens.has(tokenName));
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
