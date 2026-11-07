import type { CardDefinition, CardDefinitionSourceCoverage } from "./types";
export type ReviewedCardDefinitionCapture = {
  id: string; source: "tcgdex"; sha256: string; bytes: number; printings: number;
  syncedAt: string; expiresAt: string; sourceManifestHash: string;
  unlistedSets: { setId: string; listed: number; physicalTotal: number }[];
  approval: { receiptSha256: string; sourceClosurePinSha256: string; rawCaptureIndexSha256: string };
  acceptance: { savedFormats: string[]; retainedSha256: string; sourceCoverageSha256: string };
  asset: { repository: string; releaseTag: string; name: string; id?: number; releaseId?: number };
};
export type ReviewedCapturePublicationReceipt = {
  snapshotId: string; sourceSha256: string; sourceBytes: number; originalSyncedAt: string; expiresAt: string;
  sourceManifestHash: string; upstreamPrintings: number; generationId: string;
  approval: ReviewedCardDefinitionCapture["approval"]; acceptance: ReviewedCardDefinitionCapture["acceptance"];
  asset: ReviewedCardDefinitionCapture["asset"]; workflowRunId: string | null; workflowRunAttempt: string | null; status: "validated" | "dry_run_validated" | "published" | "failed";
  retainedPrintings?: number; sourceCoverage?: CardDefinitionSourceCoverage; failurePhase?: string; errorClass?: string;
};
export function getReviewedCardDefinitionCapture(snapshotId: string): ReviewedCardDefinitionCapture;
export function publishReviewedCardDefinitionCapture(options: { snapshotId: string; capturePath: string; outputPath: string; dryRun?: boolean; createClient?: () => unknown | Promise<unknown> }): Promise<ReviewedCapturePublicationReceipt>;
