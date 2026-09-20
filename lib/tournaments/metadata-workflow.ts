import { userFacingActionError } from "@/lib/server/action-errors";

export type TournamentCommandStatus = "committed" | "idempotent";
export type TournamentCommandFailureCode =
  | "validation"
  | "stale"
  | "ownership"
  | "retryable";

export type TournamentCommandResult = {
  status: TournamentCommandStatus;
  tournamentId: string;
  requestId: string;
  updatedAt?: string;
};

export function getTournamentMetadataRequestId(
  formData: FormData,
  operation: "create" | "update",
  fallbackId = crypto.randomUUID()
) {
  const key = operation === "create" ? "creationKey" : "commandKey";
  return String(formData.get(key) || "").trim() || fallbackId;
}

export function parseTournamentCommandResult(
  value: unknown,
  requestId: string,
  fallbackTournamentId: string
): TournamentCommandResult {
  const result = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const status = result.status;
  const tournamentId = String(result.tournamentId || fallbackTournamentId).trim();
  if ((status !== "committed" && status !== "idempotent") || !tournamentId) {
    throw new Error("Tournament metadata command returned an unexpected result.");
  }
  const parsed: TournamentCommandResult = {
    status,
    tournamentId,
    requestId: String(result.requestId || requestId)
  };
  if (typeof result.updatedAt === "string") {
    parsed.updatedAt = result.updatedAt;
  }
  return parsed;
}

export function toTournamentCommandError(
  error: { code?: string | null; message?: string | null }
) {
  const message = String(error.message || "");
  if (error.code === "P0001" && /Tournament (?:changed|could not|request)|associating its Strategy|metadata/i.test(message)) {
    return userFacingActionError(
      "This Tournament changed in another tab. Refresh the page and try again.",
      { code: "stale" satisfies TournamentCommandFailureCode }
    );
  }
  if (error.code === "42501" || /not owned|belongs to a different account|permission/i.test(message)) {
    return userFacingActionError(
      "That Tournament or linked Deck List is not owned by this account.",
      { code: "ownership" satisfies TournamentCommandFailureCode }
    );
  }
  if (error.code === "22023" || error.code === "23503" || /required|invalid|must /i.test(message)) {
    return userFacingActionError(
      message || "Check the Tournament details and try again.",
      { code: "validation" satisfies TournamentCommandFailureCode }
    );
  }
  if (
    (error.code === "23505" && /metadata|creation identity|Strategy creation identity/i.test(message))
  ) {
    return userFacingActionError(
      "That creation identity was already used with different values. Start a new save or refresh before retrying.",
      { code: "validation" satisfies TournamentCommandFailureCode }
    );
  }
  if (
    error.code === "40001"
    || error.code === "55P03"
  ) {
    return userFacingActionError(
      "That Tournament save could not be committed safely. Refresh and try again.",
      { code: "retryable" satisfies TournamentCommandFailureCode }
    );
  }
  return null;
}
