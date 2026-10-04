import nextEnv from "@next/env";
import { syncCardDefinitionCatalog } from "./lib/card-definition-catalog/sync.mjs";
const args = Object.freeze(process.argv.slice(2));
const dryRun = args.includes("--dry-run");
const paths = new Map();
const usage = "Usage: node sync-card-definition-catalog.mjs [--dry-run] [--output retained-path] [--upstream-output private-path]";
for (let index = 0; index < args.length; index++) {
  const option = args[index];
  if (option === "--dry-run") continue;
  if (option !== "--output" && option !== "--upstream-output") throw new Error(usage);
  const output = args[index + 1];
  if (!output || output.startsWith("-")) throw new Error(`Missing path for ${option}. ${usage}`);
  if (paths.has(option)) throw new Error(`Duplicate option ${option}. ${usage}`);
  paths.set(option, output);
  index++;
}
nextEnv.loadEnvConfig(process.cwd());
await syncCardDefinitionCatalog({ dryRun, outputPath: paths.get("--output"), upstreamOutputPath: paths.get("--upstream-output") });
