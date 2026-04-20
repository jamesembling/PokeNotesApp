import type { PokemonOption } from "@/types/index";

export function normalizePokemonSearchValue(value: string) {
  return value.trim().toLowerCase();
}

function compactPokemonSearchValue(value: string) {
  return normalizePokemonSearchValue(value).replace(/[^a-z0-9]/g, "");
}

export function getPokemonSearchRank(option: PokemonOption, normalizedQuery: string) {
  if (!normalizedQuery) {
    return null;
  }

  const normalizedLabel = option.label.toLowerCase();
  const normalizedSlug = option.slug.replace(/-/g, " ").toLowerCase();
  const normalizedCompactSlug = option.slug.toLowerCase();
  const compactLabel = compactPokemonSearchValue(option.label);
  const compactSlug = compactPokemonSearchValue(option.slug);
  const compactQuery = compactPokemonSearchValue(normalizedQuery);

  if (
    normalizedLabel === normalizedQuery ||
    normalizedSlug === normalizedQuery ||
    normalizedCompactSlug === normalizedQuery ||
    compactLabel === compactQuery ||
    compactSlug === compactQuery
  ) {
    return 0;
  }

  if (
    normalizedLabel.startsWith(normalizedQuery) ||
    normalizedSlug.startsWith(normalizedQuery) ||
    normalizedCompactSlug.startsWith(normalizedQuery) ||
    compactLabel.startsWith(compactQuery) ||
    compactSlug.startsWith(compactQuery)
  ) {
    return 1;
  }

  if (
    normalizedLabel.split(/\s+/).some((part) => part.startsWith(normalizedQuery)) ||
    normalizedSlug.split(/\s+/).some((part) => part.startsWith(normalizedQuery))
  ) {
    return 2;
  }

  if (
    normalizedLabel.includes(normalizedQuery) ||
    normalizedSlug.includes(normalizedQuery) ||
    normalizedCompactSlug.includes(normalizedQuery) ||
    compactLabel.includes(compactQuery) ||
    compactSlug.includes(compactQuery)
  ) {
    return 3;
  }

  return null;
}

export function findPokemonSearchMatches(options: PokemonOption[], query: string, limit = 8) {
  const normalizedQuery = normalizePokemonSearchValue(query);

  if (!normalizedQuery) {
    return [];
  }

  return options
    .map((option) => ({
      option,
      rank: getPokemonSearchRank(option, normalizedQuery)
    }))
    .filter(
      (entry): entry is { option: PokemonOption; rank: number } => entry.rank !== null
    )
    .sort((left, right) => {
      if (left.rank !== right.rank) {
        return left.rank - right.rank;
      }

      return left.option.label.localeCompare(right.option.label);
    })
    .slice(0, limit)
    .map((entry) => entry.option);
}

export function findBestPokemonSearchMatch(options: PokemonOption[], query: string) {
  const normalizedQuery = normalizePokemonSearchValue(query);
  if (!normalizedQuery) {
    return null;
  }

  const compactQuery = compactPokemonSearchValue(normalizedQuery);

  const exactMatch =
    options.find((option) => normalizePokemonSearchValue(option.label) === normalizedQuery) ??
    options.find(
      (option) => normalizePokemonSearchValue(option.slug.replace(/-/g, " ")) === normalizedQuery
    ) ??
    options.find((option) => normalizePokemonSearchValue(option.slug) === normalizedQuery) ??
    options.find((option) => compactPokemonSearchValue(option.label) === compactQuery) ??
    options.find((option) => compactPokemonSearchValue(option.slug) === compactQuery);

  if (exactMatch) {
    return exactMatch;
  }

  const filteredOptions = options.filter(
    (option) => getPokemonSearchRank(option, normalizedQuery) !== null
  );
  return filteredOptions.length === 1 ? filteredOptions[0] : null;
}
