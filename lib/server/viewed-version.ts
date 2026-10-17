import { userFacingActionError } from "@/lib/server/action-errors";

/** Retain the editor's timestamp precision and offset for the atomic comparison. */
export function requireViewedVersion(value: unknown, recordLabel: string): string {
  const version = String(value || "").trim();
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(version) ||
    !Number.isFinite(Date.parse(version))
  ) {
    throw userFacingActionError(
      `Refresh this ${recordLabel} before saving. Your unsaved changes have been kept.`
    );
  }
  return version;
}
