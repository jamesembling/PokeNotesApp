import { userFacingActionError } from "@/lib/server/action-errors";

export function requireCasMutationResult<T>(
  row: T | null | undefined,
  message: string
) {
  if (!row) {
    throw userFacingActionError(message, { code: "stale" });
  }
  return row;
}
