import type { PokemonOption } from "@/types/index";

type PokemonSearchEntry = {
  compactLabel: string;
  compactSlug: string;
  normalizedCompactSlug: string;
  normalizedLabel: string;
  normalizedLabelParts: string[];
  normalizedSlug: string;
  normalizedSlugParts: string[];
  option: PokemonOption;
};

export type PokemonSearchIndex = {
  entries: PokemonSearchEntry[];
  optionsBySlug: Map<string, PokemonOption>;
};

export function normalizePokemonSearchValue(value: string) {
  return value.trim().toLowerCase();
}

function compactPokemonSearchValue(value: string) {
  return normalizePokemonSearchValue(value).replace(/[^a-z0-9]/g, "");
}

export function buildPokemonSearchIndex(options: PokemonOption[]): PokemonSearchIndex {
  return {
    entries: options.map((option) => {
      const normalizedLabel = option.label.toLowerCase();
      const normalizedSlug = option.slug.replace(/-/g, " ").toLowerCase();

      return {
        compactLabel: compactPokemonSearchValue(option.label),
        compactSlug: compactPokemonSearchValue(option.slug),
        normalizedCompactSlug: option.slug.toLowerCase(),
        normalizedLabel,
        normalizedLabelParts: normalizedLabel.split(/\s+/),
        normalizedSlug,
        normalizedSlugParts: normalizedSlug.split(/\s+/),
        option
      };
    }),
    optionsBySlug: new Map(options.map((option) => [option.slug, option] as const))
  };
}

function getPokemonSearchEntryRank(
  entry: PokemonSearchEntry,
  normalizedQuery: string,
  compactQuery: string
) {
  if (!normalizedQuery) {
    return null;
  }

  if (
    entry.normalizedLabel === normalizedQuery ||
    entry.normalizedSlug === normalizedQuery ||
    entry.normalizedCompactSlug === normalizedQuery ||
    entry.compactLabel === compactQuery ||
    entry.compactSlug === compactQuery
  ) {
    return 0;
  }

  if (
    entry.normalizedLabel.startsWith(normalizedQuery) ||
    entry.normalizedSlug.startsWith(normalizedQuery) ||
    entry.normalizedCompactSlug.startsWith(normalizedQuery) ||
    entry.compactLabel.startsWith(compactQuery) ||
    entry.compactSlug.startsWith(compactQuery)
  ) {
    return 1;
  }

  if (
    entry.normalizedLabelParts.some((part) => part.startsWith(normalizedQuery)) ||
    entry.normalizedSlugParts.some((part) => part.startsWith(normalizedQuery))
  ) {
    return 2;
  }

  if (
    entry.normalizedLabel.includes(normalizedQuery) ||
    entry.normalizedSlug.includes(normalizedQuery) ||
    entry.normalizedCompactSlug.includes(normalizedQuery) ||
    entry.compactLabel.includes(compactQuery) ||
    entry.compactSlug.includes(compactQuery)
  ) {
    return 3;
  }

  return null;
}

export function getPokemonSearchRank(option: PokemonOption, normalizedQuery: string) {
  const index = buildPokemonSearchIndex([option]);
  return getPokemonSearchEntryRank(
    index.entries[0],
    normalizedQuery,
    compactPokemonSearchValue(normalizedQuery)
  );
}

export function findPokemonSearchMatches(options: PokemonOption[], query: string, limit = 8) {
  return findPokemonSearchMatchesInIndex(buildPokemonSearchIndex(options), query, limit);
}

export function findPokemonSearchMatchesInIndex(index: PokemonSearchIndex, query: string, limit = 8) {
  const normalizedQuery = normalizePokemonSearchValue(query);

  if (!normalizedQuery) {
    return [];
  }

  const compactQuery = compactPokemonSearchValue(normalizedQuery);

  return index.entries
    .map((entry) => ({
      entry,
      rank: getPokemonSearchEntryRank(entry, normalizedQuery, compactQuery)
    }))
    .filter(
      (entry): entry is { entry: PokemonSearchEntry; rank: number } => entry.rank !== null
    )
    .sort((left, right) => {
      if (left.rank !== right.rank) {
        return left.rank - right.rank;
      }

      return left.entry.option.label.localeCompare(right.entry.option.label);
    })
    .slice(0, limit)
    .map((entry) => entry.entry.option);
}

export function findBestPokemonSearchMatch(options: PokemonOption[], query: string) {
  return findBestPokemonSearchMatchInIndex(buildPokemonSearchIndex(options), query);
}

export function findBestPokemonSearchMatchInIndex(index: PokemonSearchIndex, query: string) {
  const normalizedQuery = normalizePokemonSearchValue(query);
  if (!normalizedQuery) {
    return null;
  }

  const compactQuery = compactPokemonSearchValue(normalizedQuery);

  const exactMatch =
    index.entries.find((entry) => entry.normalizedLabel === normalizedQuery)?.option ??
    index.entries.find((entry) => entry.normalizedSlug === normalizedQuery)?.option ??
    index.entries.find((entry) => entry.normalizedCompactSlug === normalizedQuery)?.option ??
    index.entries.find((entry) => entry.compactLabel === compactQuery)?.option ??
    index.entries.find((entry) => entry.compactSlug === compactQuery)?.option;

  if (exactMatch) {
    return exactMatch;
  }

  let singleMatch: PokemonOption | null = null;
  for (const entry of index.entries) {
    if (getPokemonSearchEntryRank(entry, normalizedQuery, compactQuery) === null) {
      continue;
    }

    if (singleMatch) {
      return null;
    }

    singleMatch = entry.option;
  }

  return singleMatch;
}
