import { logErrorReport, type ErrorReport, type ErrorReportContext } from "@/lib/error-reporting";

export type { ErrorReport, ErrorReportContext };

export function reportError(error: unknown, context: ErrorReportContext) {
  return logErrorReport(error, context);
}
