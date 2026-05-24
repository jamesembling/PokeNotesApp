import { NextResponse } from "next/server";
import { PRIVATE_NO_STORE_HEADERS } from "@/lib/server/no-store";
import { reportError } from "@/lib/server/report-error";
import type { ErrorReportContext } from "@/lib/server/report-error";

export function privateJson<T>(body: T, init: ResponseInit = {}) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...PRIVATE_NO_STORE_HEADERS,
      ...init.headers
    }
  });
}

export function privateError(message: string, status: number) {
  return privateJson({ error: message }, { status });
}

export function reportApiError(error: unknown, context: ErrorReportContext, message: string) {
  reportError(error, context);
  return privateError(message, 500);
}
