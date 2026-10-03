import nextEnv from "@next/env";
import { syncCardDefinitionCatalog } from "./lib/card-definition-catalog/sync.mjs";
nextEnv.loadEnvConfig(process.cwd());
const args = process.argv.slice(2);
const outputIndex = args.indexOf("--output");
const outputPath = outputIndex >= 0 ? args[outputIndex + 1] : undefined;
const remaining = outputIndex >= 0 ? args.filter((_, i) => i !== outputIndex && i !== outputIndex + 1) : args;
if ((outputIndex >= 0 && !outputPath) || remaining.some((arg) => arg !== "--dry-run")) throw new Error("Usage: node sync-card-definition-catalog.mjs [--dry-run] [--output path]");
await syncCardDefinitionCatalog({ dryRun: args.includes("--dry-run"), outputPath });
