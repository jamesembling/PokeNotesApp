export type BulkLogMutationResult = {
  affectedIds: string[];
  missingIds: string[];
};

// Missing owner-scoped rows are an idempotent result, not a failed transaction.
export function completeBulkLogMutation(
  requestedIds: string[],
  rows: Array<{ id: string }> | null,
  invalidate: () => void
): BulkLogMutationResult {
  const affectedIds = (rows ?? []).map((row) => row.id);
  const affected = new Set(affectedIds);
  invalidate();
  return {
    affectedIds,
    missingIds: requestedIds.filter((id) => !affected.has(id))
  };
}
