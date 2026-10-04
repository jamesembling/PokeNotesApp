import { publishReviewedCardDefinitionCapture, getReviewedCardDefinitionCapture } from "./lib/card-definition-catalog/capture-publication.mjs";

// Parse original immutable arguments before environment loading or client setup.
const args = Object.freeze(process.argv.slice(2));
const dryRun = args.includes("--dry-run"), values = new Map();
const usage = "Usage: node publish-card-definition-capture.mjs --snapshot-id reviewed-id --capture capture-path --output retained-path [--dry-run]";
try {
  for (let index = 0; index < args.length; index++) {
    const option = args[index];
    if (option === "--dry-run") continue;
    if (!["--snapshot-id", "--capture", "--output"].includes(option)) throw new Error(usage);
    const value = args[++index];
    if (!value || value.startsWith("-") || values.has(option)) throw new Error(usage);
    values.set(option, value);
  }
  if (values.size !== 3) throw new Error(usage);
  const result = await publishReviewedCardDefinitionCapture({ snapshotId: values.get("--snapshot-id"), capturePath: values.get("--capture"),
    outputPath: values.get("--output"), dryRun, createClient: async () => {
      const approved = getReviewedCardDefinitionCapture(values.get("--snapshot-id"));
      if (process.env.GITHUB_ACTIONS !== "true" || process.env.GITHUB_REF !== "refs/heads/main"
        || process.env.GITHUB_REPOSITORY !== approved.asset.repository
        || process.env.GITHUB_WORKFLOW !== "Publish reviewed card reference capture")
        throw new Error("Live capture publication requires the controlled main workflow.");
      const nextEnv = await import("@next/env");
      nextEnv.default.loadEnvConfig(process.cwd());
      const { createClient } = await import("@supabase/supabase-js");
      const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !key) throw new Error("Missing publication configuration.");
      return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    } });
  console.log(JSON.stringify({ snapshotId: result.snapshotId, generationId: result.generationId, status: result.status,
    originalSyncedAt: result.originalSyncedAt, expiresAt: result.expiresAt, sourceManifestHash: result.sourceManifestHash,
    upstreamPrintings: result.upstreamPrintings, retainedPrintings: result.retainedPrintings }));
} catch {
  // Never serialize arbitrary environment/client errors, messages or properties.
  console.error("Reviewed capture publication failed. Check the approved capture, expiry and controlled operation receipt.");
  process.exitCode = 1;
}
