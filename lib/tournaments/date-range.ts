import { userFacingActionError } from "@/lib/server/action-errors";

export function parseIsoDate(value: FormDataEntryValue | null, fallback?: string) {
  const normalized = String(value || "").trim() || String(fallback || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw userFacingActionError("Choose a valid date.");
  }

  return normalized;
}

export function normalizeTournamentDateRange(formData: FormData) {
  const dateFrom = parseIsoDate(formData.get("dateFrom"));

  return {
    dateFrom,
    dateTo: parseIsoDate(formData.get("dateTo"), dateFrom)
  };
}
