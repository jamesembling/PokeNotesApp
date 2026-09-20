import { unstable_rethrow } from "next/navigation";
import { reportError } from "@/lib/server/report-error";

export class UserFacingActionError extends Error {
  readonly code?: string;
  readonly httpStatus?: number;

  constructor(message: string, options: { code?: string; httpStatus?: number } = {}) {
    super(message);
    this.name = "UserFacingActionError";
    this.code = options.code;
    this.httpStatus = options.httpStatus;
  }
}

type ActionErrorContext = {
  action: string;
  area: string;
  boundary?: string;
  deckId?: string;
  fallbackMessage: string;
  logId?: string;
  route: string;
  shareId?: string;
  tournamentId?: string;
  userId?: string;
};

export type FailedActionResult = {
  ok: false;
  message: string;
  code?: string;
};

export function userFacingActionError(
  message: string,
  options: { code?: string; httpStatus?: number } = {}
) {
  return new UserFacingActionError(message, options);
}

export function isUserFacingActionError(error: unknown): error is UserFacingActionError {
  return error instanceof UserFacingActionError;
}

export function resolveActionFailure(error: unknown, context: ActionErrorContext) {
  if (isUserFacingActionError(error)) {
    return error;
  }

  reportError(error, {
    action: context.action,
    area: context.area,
    boundary: context.boundary ?? `${context.area}-actions`,
    deckId: context.deckId,
    logId: context.logId,
    route: context.route,
    shareId: context.shareId,
    tournamentId: context.tournamentId,
    userId: context.userId
  });

  return userFacingActionError(context.fallbackMessage);
}

export function toActionFailureResult(
  error: unknown,
  context: ActionErrorContext
): FailedActionResult {
  unstable_rethrow(error);

  const resolved = resolveActionFailure(error, context);
  return resolved.code
    ? { ok: false, message: resolved.message, code: resolved.code }
    : { ok: false, message: resolved.message };
}
