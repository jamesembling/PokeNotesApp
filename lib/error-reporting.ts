const MAX_MESSAGE_LENGTH = 180;
const MAX_CONTEXT_VALUE_LENGTH = 120;

export type ErrorReportContext = {
  action?: string;
  area?: string;
  boundary: string;
  deckId?: string;
  digest?: string;
  logId?: string;
  route?: string;
  shareId?: string;
  tournamentId?: string;
  userId?: string;
};

export type ErrorReport = {
  action?: string;
  area?: string;
  boundary: string;
  deckId?: string;
  digest?: string;
  error: {
    message: string;
    name: string;
    type: string;
  };
  logId?: string;
  route?: string;
  shareId?: string;
  tournamentId?: string;
  userId?: string;
};

function redactSensitiveText(value: string, sensitiveValues: string[] = []) {
  const explicitlyRedacted = sensitiveValues.reduce(
    (current, sensitiveValue) =>
      sensitiveValue ? current.split(sensitiveValue).join("[redacted-secret]") : current,
    value
  );

  return explicitlyRedacted
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/https?:\/\/\S+/gi, "[redacted-url]")
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, "[redacted-number]")
    .replace(/\b[a-z0-9_-]{24,}\b/gi, "[redacted-token]");
}

function summarizeText(value: string, maxLength: number, sensitiveValues: string[] = []) {
  const trimmed = redactSensitiveText(value, sensitiveValues).replace(/\s+/g, " ").trim();
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength - 1)}…` : trimmed;
}

function describeError(error: unknown, sensitiveValues: string[] = []) {
  if (error instanceof Error) {
    return {
      message: summarizeText(error.message || "Unknown error", MAX_MESSAGE_LENGTH, sensitiveValues),
      name: error.name || "Error",
      type: error.constructor?.name || "Error"
    };
  }

  if (typeof error === "string") {
    return {
      message: summarizeText(error, MAX_MESSAGE_LENGTH, sensitiveValues),
      name: "Error",
      type: "String"
    };
  }

  if (typeof error === "object" && error !== null) {
    return {
      message: "[non-error thrown value]",
      name: "Error",
      type: error.constructor?.name || "Object"
    };
  }

  return {
    message: summarizeText(String(error), MAX_MESSAGE_LENGTH, sensitiveValues),
    name: "Error",
    type: typeof error
  };
}

export function createErrorReport(error: unknown, context: ErrorReportContext): ErrorReport {
  const sensitiveValues = context.shareId ? [context.shareId] : [];

  return {
    action: context.action
      ? summarizeText(context.action, MAX_CONTEXT_VALUE_LENGTH, sensitiveValues)
      : undefined,
    area: context.area
      ? summarizeText(context.area, MAX_CONTEXT_VALUE_LENGTH, sensitiveValues)
      : undefined,
    boundary: summarizeText(context.boundary, MAX_CONTEXT_VALUE_LENGTH, sensitiveValues),
    deckId: context.deckId
      ? summarizeText(context.deckId, MAX_CONTEXT_VALUE_LENGTH, sensitiveValues)
      : undefined,
    digest: context.digest
      ? summarizeText(context.digest, MAX_CONTEXT_VALUE_LENGTH, sensitiveValues)
      : undefined,
    error: describeError(error, sensitiveValues),
    logId: context.logId
      ? summarizeText(context.logId, MAX_CONTEXT_VALUE_LENGTH, sensitiveValues)
      : undefined,
    route: context.route
      ? summarizeText(context.route, MAX_CONTEXT_VALUE_LENGTH, sensitiveValues)
      : undefined,
    // Share IDs are bearer credentials. Their current compact form is shorter
    // than the generic token detector, so never include the raw value in logs.
    shareId: context.shareId ? "[redacted-share-token]" : undefined,
    tournamentId: context.tournamentId
      ? summarizeText(context.tournamentId, MAX_CONTEXT_VALUE_LENGTH, sensitiveValues)
      : undefined,
    userId: context.userId
      ? summarizeText(context.userId, MAX_CONTEXT_VALUE_LENGTH, sensitiveValues)
      : undefined
  };
}

export function logErrorReport(error: unknown, context: ErrorReportContext) {
  const report = createErrorReport(error, context);

  console.error("[pokenotes:error]", report);

  return report;
}
