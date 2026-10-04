import { open, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import reviewedCaptures from "./reviewed-captures.json" with { type: "json" };
import { isProducedCardDefinition } from "./source.mjs";
import { selectRetainedCardDefinitions } from "./retention.mjs";
import { readSavedFormatInventory, publishCardDefinitionGeneration } from "./publication.mjs";

const MAX_BYTES = 25 * 1024 * 1024;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const hash = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const instant = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

/** This authored allowlist approves complete normalized data, not arbitrary
 * operator JSON or a claim that every historical enrichment can be replayed. */
export function getReviewedCardDefinitionCapture(snapshotId) {
  const entries = reviewedCaptures.filter((capture) => capture.id === snapshotId);
  if (entries.length !== 1) throw new Error("Unknown or duplicate reviewed capture.");
  const capture = entries[0];
  if (capture.source !== "tcgdex" || !hash(capture.sha256) || !hash(capture.sourceManifestHash)
    || !Number.isSafeInteger(capture.bytes) || capture.bytes <= 0 || capture.bytes > MAX_BYTES
    || !Number.isSafeInteger(capture.printings) || capture.printings <= 0 || capture.printings > 100000
    || !instant(capture.syncedAt) || !instant(capture.expiresAt)
    || Date.parse(capture.expiresAt) !== Date.parse(capture.syncedAt) + 24 * 60 * 60 * 1000
    || !hash(capture.approval?.receiptSha256) || !hash(capture.approval?.sourceClosurePinSha256)
    || !hash(capture.approval?.rawCaptureIndexSha256)
    || !capture.acceptance || !Array.isArray(capture.acceptance.savedFormats) || !capture.acceptance.savedFormats.length
    || capture.acceptance.savedFormats.some((format) => typeof format !== "string" || format !== format.trim())
    || new Set(capture.acceptance.savedFormats).size !== capture.acceptance.savedFormats.length
    || !hash(capture.acceptance.retainedSha256) || !hash(capture.acceptance.sourceCoverageSha256)
    || !capture.asset || typeof capture.asset.repository !== "string" || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(capture.asset.repository)
    || typeof capture.asset.releaseTag !== "string" || !/^[A-Za-z0-9_.-]+$/.test(capture.asset.releaseTag)
    || typeof capture.asset.name !== "string" || !/^[A-Za-z0-9_.-]+\.json$/.test(capture.asset.name)
    || ["id", "releaseId"].some((key) => capture.asset[key] !== undefined && (!Number.isSafeInteger(capture.asset[key]) || capture.asset[key] <= 0))
    || !Array.isArray(capture.unlistedSets) || new Set(capture.unlistedSets.map((set) => set?.setId)).size !== capture.unlistedSets.length
    || capture.unlistedSets.some((set) => !set || typeof set.setId !== "string" || !/^[A-Za-z0-9_.-]+$/.test(set.setId)
      || !Number.isSafeInteger(set.listed) || set.listed < 0 || !Number.isSafeInteger(set.physicalTotal) || set.physicalTotal < set.listed))
    throw new Error("Malformed reviewed capture approval.");
  return structuredClone(capture);
}
function validTime(capture, now) {
  if (!Number.isFinite(now) || now < Date.parse(capture.syncedAt) || now >= Date.parse(capture.expiresAt))
    throw new Error("Reviewed capture is future-dated or expired.");
}

/** Bound bytes and approve their exact identity before parsing or creating a
 * client. Neither normalization nor enrichment rewrites the approved rows. */
export async function readReviewedCardDefinitionCapture(snapshotId, capturePath, { now = Date.now() } = {}) {
  const capture = getReviewedCardDefinitionCapture(snapshotId);
  validTime(capture, now);
  const file = await open(capturePath, "r");
  let bytes;
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size !== capture.bytes || stat.size > MAX_BYTES) throw new Error("Reviewed capture size mismatch.");
    bytes = Buffer.alloc(capture.bytes);
    let offset = 0;
    while (offset < bytes.length) {
      const result = await file.read(bytes, offset, bytes.length - offset, offset);
      if (!result.bytesRead) throw new Error("Incomplete reviewed capture file.");
      offset += result.bytesRead;
    }
    const tail = Buffer.alloc(1);
    if ((await file.read(tail, 0, 1, bytes.length)).bytesRead) throw new Error("Reviewed capture grew during reading.");
  } finally { await file.close(); }
  if (sha256(bytes) !== capture.sha256) throw new Error("Reviewed capture hash mismatch.");
  const definitions = JSON.parse(bytes.toString("utf8"));
  if (!Array.isArray(definitions) || definitions.length !== capture.printings || definitions.some((card) => !isProducedCardDefinition(card))
    || new Set(definitions.map((card) => card.sourceCardId)).size !== definitions.length
    || definitions.some((card) => card.syncedAt !== capture.syncedAt)
    || sha256([...definitions.map((card) => card.sourceCardId)].sort().join("\n")) !== capture.sourceManifestHash)
    throw new Error("Invalid reviewed full capture.");
  return { capture, definitions };
}

/** Only the deferred live-client factory may load environment/credentials.
 * Fresh UUID describes publication; retainedOn remains the original source time. */
export async function publishReviewedCardDefinitionCapture({ snapshotId, capturePath, outputPath, dryRun = true, createClient }) {
  if (typeof outputPath !== "string" || !outputPath || typeof capturePath !== "string" || typeof dryRun !== "boolean") throw new Error("Capture publication requires valid paths and mode.");
  if ([outputPath, `${outputPath}.generation.json`, `${outputPath}.recovery.json`].some((output) => resolve(output) === resolve(capturePath)))
    throw new Error("Capture output must not overwrite the approved source file.");
  const { capture, definitions } = await readReviewedCardDefinitionCapture(snapshotId, capturePath, { now: Date.now() });
  const generationId = randomUUID();
  let phase = "validated", client;
  const receipt = { snapshotId: capture.id, sourceSha256: capture.sha256, sourceBytes: capture.bytes,
    originalSyncedAt: capture.syncedAt, expiresAt: capture.expiresAt, sourceManifestHash: capture.sourceManifestHash,
    upstreamPrintings: definitions.length, generationId, approval: capture.approval, acceptance: capture.acceptance, asset: capture.asset,
    workflowRunId: /^\d+$/.test(process.env.GITHUB_RUN_ID ?? "") ? process.env.GITHUB_RUN_ID : null,
    workflowRunAttempt: /^\d+$/.test(process.env.GITHUB_RUN_ATTEMPT ?? "") ? process.env.GITHUB_RUN_ATTEMPT : null, status: "validated" };
  try {
    let savedFormats = capture.acceptance.savedFormats;
    if (!dryRun) {
      validTime(capture, Date.now());
      phase = "client_initialization";
      if (typeof createClient !== "function") throw new Error("Live capture publication requires a client factory.");
      client = await createClient();
      phase = "saved_format_inventory";
      savedFormats = await readSavedFormatInventory(client);
      if (JSON.stringify([...savedFormats].sort()) !== JSON.stringify([...capture.acceptance.savedFormats].sort()))
        throw new Error("Saved format inventory differs from the approved acceptance scope.");
    }
    validTime(capture, Date.now());
    phase = "retention_selection";
    const retained = selectRetainedCardDefinitions(definitions, { savedFormats, retainedOn: capture.syncedAt,
      sourceManifestHash: capture.sourceManifestHash, unlistedSets: capture.unlistedSets });
    phase = "acceptance_validation";
    if (sha256(JSON.stringify(retained.definitions)) !== capture.acceptance.retainedSha256
      || sha256(JSON.stringify(retained.sourceCoverage)) !== capture.acceptance.sourceCoverageSha256)
      throw new Error("Derived capture differs from the approved retained rows or scope.");
    phase = "artifact_write";
    await writeFile(outputPath, JSON.stringify(retained.definitions));
    await writeFile(`${outputPath}.generation.json`, JSON.stringify({ generationId, sourceManifestHash: capture.sourceManifestHash, sourceCoverage: retained.sourceCoverage }));
    Object.assign(receipt, { retainedPrintings: retained.definitions.length, sourceCoverage: retained.sourceCoverage });
    await writeFile(`${outputPath}.recovery.json`, JSON.stringify(receipt, null, 2));
    validTime(capture, Date.now());
    if (!dryRun) {
      phase = "publication";
      await publishCardDefinitionGeneration(client, { generationId, sourceManifestHash: capture.sourceManifestHash,
        sourceCoverage: retained.sourceCoverage, definitions: retained.definitions, upstreamDefinitions: definitions, expectedSavedFormats: savedFormats });
      receipt.status = "published";
    } else receipt.status = "dry_run_validated";
    return receipt;
  } catch (error) {
    receipt.status = "failed";
    receipt.failurePhase = error?.code === "REFERENCE_PUBLICATION_REGRESSION" ? "pre_staging_guard" : phase;
    receipt.errorClass = ["Error", "TypeError", "RangeError", "SyntaxError", "AbortError"].includes(error?.name) ? error.name : "Error";
    throw error;
  } finally { await writeFile(`${outputPath}.recovery.json`, JSON.stringify(receipt, null, 2)); }
}
