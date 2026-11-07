import { userFacingActionError } from "@/lib/server/action-errors";

function parseIsoDate(value: FormDataEntryValue | null, fallback?: string) {
  const normalized = String(value || "").trim() || String(fallback || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw userFacingActionError("Choose a valid date.");
  }

  return normalized;
}

export function normalizeTournamentDateRange(formData: FormData) {
  const dateFrom = parseIsoDate(formData.get("dateFrom"));
  const dateTo = parseIsoDate(formData.get("dateTo"), dateFrom);

  if (dateTo < dateFrom) {
    throw userFacingActionError("Choose an end date on or after the start date.");
  }

  return {
    dateFrom,
    dateTo
  };
}

export function isTournamentMultiDay(dateFrom?: string, dateTo?: string) {
  const normalizedDateFrom = String(dateFrom || "").trim();
  const normalizedDateTo = String(dateTo || "").trim();

  return Boolean(normalizedDateFrom && normalizedDateTo && normalizedDateFrom !== normalizedDateTo);
}
