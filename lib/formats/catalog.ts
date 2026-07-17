import { unstable_cache } from "next/cache";
import { CACHE_TAGS } from "@/lib/server/cache";
import { SITE_FORMAT_OPTIONS, getDefaultSiteFormat as getFallbackSiteFormat } from "@/lib/formats/options";

const LIMITLESS_STANDARD_TOURNAMENTS_URL =
  "https://play.limitlesstcg.com/api/tournaments?game=PTCG&format=STANDARD";
const FORMAT_CODE_PATTERN = /\b([A-Z]{3}-[A-Z]{3}(?:\/[A-Z]{3})?)\b/g;
const SAMPLE_TOURNAMENT_COUNT = 20;
const SITE_FORMATS_CACHE_VERSION = "v4";
const SITE_FORMATS_REVALIDATE_SECONDS = 60 * 60 * 6;

type LimitlessTournamentSummary = {
  date?: string;
  id?: string;
};

export type SiteFormatsCatalog = {
  defaultFormat: string;
  options: string[];
  source: "limitless" | "fallback";
};

export function getInitialSiteFormats(): SiteFormatsCatalog {
  return {
    defaultFormat: getFallbackSiteFormat(),
    options: [...SITE_FORMAT_OPTIONS],
    source: "fallback"
  };
}

function dedupeFormats(formats: string[]) {
  const seen = new Set<string>();
  const uniqueFormats: string[] = [];

  formats.forEach((format) => {
    const normalized = String(format || "").trim();
    if (!normalized || seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    uniqueFormats.push(normalized);
  });

  return uniqueFormats;
}

function extractFormatCodesFromTournamentPage(html: string) {
  const matches = [...html.matchAll(FORMAT_CODE_PATTERN)].map((match) => match[1]);
  return dedupeFormats(matches);
}

async function fetchRecentStandardTournaments() {
  const response = await fetch(LIMITLESS_STANDARD_TOURNAMENTS_URL, {
    next: {
      revalidate: SITE_FORMATS_REVALIDATE_SECONDS,
      tags: [CACHE_TAGS.siteFormats]
    }
  });

  if (!response.ok) {
    throw new Error(`Limitless tournaments request failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as LimitlessTournamentSummary[];
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload
    .filter((tournament) => typeof tournament.id === "string" && tournament.id)
    .sort((left, right) => {
      const leftTime = left.date ? Date.parse(left.date) : 0;
      const rightTime = right.date ? Date.parse(right.date) : 0;
      return rightTime - leftTime;
    })
    .slice(0, SAMPLE_TOURNAMENT_COUNT);
}

async function fetchRecentFormatCodesFromLimitless() {
  const tournaments = await fetchRecentStandardTournaments();
  if (tournaments.length === 0) {
    return [];
  }

  const pages = await Promise.all(
    tournaments.map(async (tournament) => {
      const response = await fetch(`https://play.limitlesstcg.com/tournament/${tournament.id}/details`, {
        next: {
          revalidate: SITE_FORMATS_REVALIDATE_SECONDS,
          tags: [CACHE_TAGS.siteFormats]
        }
      });

      if (!response.ok) {
        return "";
      }

      return await response.text();
    })
  );

  return dedupeFormats(pages.flatMap((pageHtml) => extractFormatCodesFromTournamentPage(pageHtml)));
}

const getSiteFormatsCached = unstable_cache(
  async (): Promise<SiteFormatsCatalog> => {
    try {
      const limitlessFormats = await fetchRecentFormatCodesFromLimitless();
      const defaultFormat = limitlessFormats[0];

      if (defaultFormat) {
        return {
          defaultFormat,
          options: dedupeFormats([...limitlessFormats, ...SITE_FORMAT_OPTIONS]),
          source: "limitless"
        };
      }
    } catch {}

    return {
      defaultFormat: getFallbackSiteFormat(),
      options: [...SITE_FORMAT_OPTIONS],
      source: "fallback"
    };
  },
  ["site-formats", SITE_FORMATS_CACHE_VERSION],
  {
    revalidate: SITE_FORMATS_REVALIDATE_SECONDS,
    tags: [CACHE_TAGS.siteFormats]
  }
);

export async function getSiteFormats() {
  return await getSiteFormatsCached();
}

export async function getDefaultSyncedSiteFormat() {
  const siteFormats = await getSiteFormats();
  return siteFormats.defaultFormat;
}

export async function isKnownSyncedSiteFormat(value: string) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return false;
  }

  const siteFormats = await getSiteFormats();
  return siteFormats.options.includes(normalized);
}
