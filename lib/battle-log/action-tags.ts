import { classifyBattleLogActionTitle, type BattleLogActionTag } from "@/lib/battle-log/display";
import type { LogSection } from "@/types/index";

const LIMITLESS_API_ROOT = "https://limitlesstcg.com";
const LIMITLESS_SEARCH_API_URL = `${LIMITLESS_API_ROOT}/api/dm/search`;
const LIMITLESS_VERSIONS_API_URL = `${LIMITLESS_API_ROOT}/api/dm/versions`;

const RESOLVABLE_TAGS = new Set<BattleLogActionTag>(["supporter", "item", "tool", "stadium"]);

type LimitlessSearchResult = {
  id?: string | number | null;
  name?: string | null;
};

type LimitlessVersionResult = {
  type?: string | null;
};

export type BattleLogResolvedActionTag = {
  label: string;
  tag: BattleLogActionTag;
};

export type BattleLogActionTagOverrides = Array<Array<BattleLogResolvedActionTag | null>>;

const cardLookupCache = new Map<string, Promise<BattleLogResolvedActionTag | null>>();

export function resetBattleLogActionTagOverrideCache() {
  cardLookupCache.clear();
}

function normalizeValue(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/\s+/g, " ");
}

function getResolvedTagLabel(tag: BattleLogActionTag) {
  switch (tag) {
    case "supporter":
      return "Supporter";
    case "item":
      return "Item";
    case "tool":
      return "Tool";
    case "stadium":
      return "Stadium";
    default:
      return "Action";
  }
}

function buildResolvedCardTag(tag: BattleLogActionTag): BattleLogResolvedActionTag {
  return {
    tag,
    label: getResolvedTagLabel(tag)
  };
}

function mapTrainerTypeToTag(value: string | null | undefined): BattleLogActionTag | null {
  const normalized = normalizeValue(value);

  if (normalized === "supporter" || normalized === "item" || normalized === "tool" || normalized === "stadium") {
    return normalized;
  }

  return null;
}

function isResolvableActionTitle(title: string) {
  const tag = classifyBattleLogActionTitle(title);
  if (RESOLVABLE_TAGS.has(tag)) {
    return false;
  }

  const normalized = normalizeValue(title);
  return /\bplayed\b/.test(normalized) || /\battached\b/.test(normalized);
}

export function extractBattleLogActionCardCandidate(title: string) {
  const trimmed = String(title || "").trim();
  if (!trimmed) {
    return null;
  }

  const playedMatch = trimmed.match(/\bplayed\s+(.+?)(?=\s*(?:->|→)\s*|\.$|$)/i);
  if (playedMatch?.[1]) {
    return sanitizeCardCandidate(playedMatch[1]);
  }

  const attachedMatch = trimmed.match(/\battached\s+(.+?)(?=\s+to\b|\.$|$)/i);
  if (attachedMatch?.[1]) {
    return sanitizeCardCandidate(attachedMatch[1]);
  }

  return null;
}

function sanitizeCardCandidate(value: string) {
  const candidate = String(value || "")
    .trim()
    .replace(/^(?:a|an|the)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!candidate) {
    return null;
  }

  const normalized = normalizeValue(candidate);
  if (
    normalized === "card" ||
    normalized.endsWith(" card") ||
    normalized === "energy" ||
    normalized.endsWith(" energy")
  ) {
    return null;
  }

  return candidate;
}

async function fetchLimitlessSearchResults(query: string) {
  const normalizedQuery = String(query || "").trim();
  if (!normalizedQuery) {
    return [];
  }

  const response = await fetch(
    `${LIMITLESS_SEARCH_API_URL}?${new URLSearchParams({ q: normalizedQuery, lang: "en" })}`,
    { next: { revalidate: 86400 } }
  ).catch(() => null);

  if (!response?.ok) {
    return [];
  }

  const payload = (await response.json().catch(() => [])) as unknown;
  return Array.isArray(payload) ? (payload as LimitlessSearchResult[]) : [];
}

async function fetchLimitlessVersions(id: string) {
  const normalizedId = String(id || "").trim();
  if (!normalizedId) {
    return [];
  }

  const response = await fetch(
    `${LIMITLESS_VERSIONS_API_URL}?${new URLSearchParams({ id: normalizedId, lang: "en" })}`,
    { next: { revalidate: 86400 } }
  ).catch(() => null);

  if (!response?.ok) {
    return [];
  }

  const payload = (await response.json().catch(() => [])) as unknown;
  return Array.isArray(payload) ? (payload as LimitlessVersionResult[]) : [];
}

function selectSearchMatch(results: LimitlessSearchResult[], candidateName: string) {
  const normalizedCandidate = normalizeValue(candidateName);
  const exactMatches = results.filter((entry) => normalizeValue(entry.name) === normalizedCandidate);

  return exactMatches[0] ?? null;
}

async function resolveCardCandidateTag(candidateName: string): Promise<BattleLogResolvedActionTag | null> {
  const normalizedCandidate = normalizeValue(candidateName);
  if (!normalizedCandidate) {
    return null;
  }

  if (!cardLookupCache.has(normalizedCandidate)) {
    const lookupPromise = (async () => {
      const searchResults = await fetchLimitlessSearchResults(candidateName);
      const searchMatch = selectSearchMatch(searchResults, candidateName);
      if (!searchMatch?.id) {
        return null;
      }

      const versions = await fetchLimitlessVersions(String(searchMatch.id));
      const resolvedTags = Array.from(
        new Set(
          versions
            .map((entry) => mapTrainerTypeToTag(entry.type))
            .filter((value): value is BattleLogActionTag => value !== null)
        )
      );

      if (resolvedTags.length === 1) {
        return buildResolvedCardTag(resolvedTags[0]);
      }

      return null;
    })();

    cardLookupCache.set(normalizedCandidate, lookupPromise);
    void lookupPromise.then((result) => {
      if (!result) {
        cardLookupCache.delete(normalizedCandidate);
      }
    });
  }

  return cardLookupCache.get(normalizedCandidate) ?? null;
}

export async function resolveBattleLogActionTagOverride(title: string) {
  if (!isResolvableActionTitle(title)) {
    return null;
  }

  const candidateName = extractBattleLogActionCardCandidate(title);
  if (!candidateName) {
    return null;
  }

  return resolveCardCandidateTag(candidateName);
}

export async function resolveBattleLogActionTagOverrides(sections: LogSection[]) {
  const titles = Array.from(
    new Set(
      sections.flatMap((section) =>
        section.actions
          .map((action) => String(action.title || "").trim())
          .filter(Boolean)
      )
    )
  );

  const overrides = await Promise.all(
    titles.map(async (title) => {
      const resolved = await resolveBattleLogActionTagOverride(title);
      return resolved ? ([title, resolved] as const) : null;
    })
  );
  const overridesByTitle = new Map(
    overrides.filter((entry): entry is readonly [string, BattleLogResolvedActionTag] => entry !== null)
  );

  return sections.map((section) =>
    section.actions
      .filter((action) => normalizeValue(action.title) !== "setup")
      .map((action) => {
        const title = String(action.title || "").trim();
        return overridesByTitle.get(title) ?? null;
      })
  );
}
