import { reportError } from "@/lib/server/report-error";

export class UserFacingActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFacingActionError";
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

export function userFacingActionError(message: string) {
  return new UserFacingActionError(message);
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
