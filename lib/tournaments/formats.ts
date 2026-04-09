import { cache } from "react";

const LIMITLESS_GAMES_API_URL = "https://play.limitlesstcg.com/api/games";

type LimitlessGameEntry = {
  id?: string;
  name?: string;
  formats?: Record<string, string>;
};

export type TournamentFormatOption = {
  value: string;
  label: string;
};

function normalizeFormatEntries(formats: Record<string, string>) {
  return Object.entries(formats)
    .filter(([value, label]) => String(value).trim() && String(label).trim())
    .map(([value, label]) => ({
      value: String(value).trim(),
      label: String(label).trim()
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

export const getLimitlessTournamentFormatOptions = cache(
  async (): Promise<TournamentFormatOption[]> => {
    try {
      const response = await fetch(LIMITLESS_GAMES_API_URL, {
        next: { revalidate: 86400 }
      });

      if (!response.ok) {
        return [];
      }

      const payload = (await response.json()) as unknown;
      if (!Array.isArray(payload)) {
        return [];
      }

      const ptcgEntry = (payload as LimitlessGameEntry[]).find((entry) => entry.id === "PTCG");
      if (!ptcgEntry?.formats || typeof ptcgEntry.formats !== "object") {
        return [];
      }

      return normalizeFormatEntries(ptcgEntry.formats);
    } catch {
      return [];
    }
  }
);

export async function isKnownTournamentFormat(value: string) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return false;
  }

  const options = await getLimitlessTournamentFormatOptions();
  return options.some((option) => option.value === normalized);
}

export async function getTournamentFormatLabel(value: string) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "";
  }

  const options = await getLimitlessTournamentFormatOptions();
  return options.find((option) => option.value === normalized)?.label || normalized;
}
