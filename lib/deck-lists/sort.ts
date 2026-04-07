import type { DeckCard } from "@/types/index";

const LIMITLESS_API_ROOT = "https://limitlesstcg.com";
const LIMITLESS_POKEDEX_API_URL = `${LIMITLESS_API_ROOT}/api/dm/pokedex`;
const LIMITLESS_SEARCH_API_URL = `${LIMITLESS_API_ROOT}/api/dm/search`;
const LIMITLESS_VERSIONS_API_URL = `${LIMITLESS_API_ROOT}/api/dm/versions`;
const LIMITLESS_EVOLUTION_STAGES = new Set([
  "stage1",
  "stage2",
  "vmax",
  "vstar",
  "mega",
  "break",
  "lvx"
]);

type LimitlessSearchResult = {
  id?: string | number | null;
  set?: string | null;
  number?: string | null;
  name?: string | null;
  card_type?: string | null;
  special?: string | null;
};

type LimitlessVersionResult = {
  data_id?: string | number | null;
  set?: string | null;
  number?: string | null;
  card_type?: string | null;
  type?: string | null;
  stage?: string | null;
  dex_number?: number | null;
  special?: string | null;
  labels?: string | null;
};

type LimitlessPokedexEntry = {
  id: number;
  evolves_from?: number | null;
};

type ResolvedDeckCard = DeckCard & {
  lookupName: string;
  lookupSet: string;
  lookupNumber: string;
  limitlessIdentity: string | null;
  cardType: string;
  resolvedTrainerType: string | null;
  stageKey: string | null;
  dexNumber: number | null;
  specialKey: string | null;
  labels: string | null;
  prints: Array<{
    set: string;
    number: string;
    count: number;
  }>;
};

type DecoratedPokemonCard = ResolvedDeckCard & {
  nameId: string;
  prevoNameId?: string;
};

const searchCache = new Map<string, Promise<LimitlessSearchResult[]>>();
const versionsCache = new Map<string, Promise<LimitlessVersionResult[]>>();
let pokedexPromise: Promise<Map<number, LimitlessPokedexEntry>> | null = null;

function normalizeCardName(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/\s+/g, " ");
}

function normalizeSetCode(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

function normalizeLookupNumber(value: string | null | undefined) {
  const compact = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");

  if (!compact) {
    return "";
  }

  const mixedMatch = compact.match(/^([A-Z]*)(\d+)([A-Z]*)$/);
  if (mixedMatch) {
    const [, prefix, digits, suffix] = mixedMatch;
    return `${prefix}${String(Number.parseInt(digits, 10))}${suffix}`;
  }

  return compact.replace(/^0+/, "") || "0";
}

function getDeckListCardTypeFallback(category: string | undefined) {
  const normalized = String(category ?? "")
    .trim()
    .toLowerCase();

  if (normalized === "pokemon") {
    return "pokemon";
  }

  if (normalized === "trainer") {
    return "trainer";
  }

  if (normalized === "energy") {
    return "energy";
  }

  return "unknown";
}

function findMatchingLimitlessSearchResult(results: LimitlessSearchResult[], card: ResolvedDeckCard) {
  const exactNameMatches = results.filter(
    (entry) => normalizeCardName(entry.name) === card.lookupName
  );

  return (
    exactNameMatches.find(
      (entry) =>
        normalizeSetCode(entry.set) === card.lookupSet &&
        normalizeLookupNumber(entry.number) === card.lookupNumber
    ) ||
    exactNameMatches.find((entry) => normalizeSetCode(entry.set) === card.lookupSet) ||
    exactNameMatches.find(
      (entry) => normalizeLookupNumber(entry.number) === card.lookupNumber
    ) ||
    exactNameMatches[0] ||
    results.find(
      (entry) =>
        normalizeSetCode(entry.set) === card.lookupSet &&
        normalizeLookupNumber(entry.number) === card.lookupNumber
    ) ||
    null
  );
}

function findMatchingLimitlessVersion(versions: LimitlessVersionResult[], card: ResolvedDeckCard) {
  return (
    versions.find(
      (entry) =>
        normalizeSetCode(entry.set) === card.lookupSet &&
        normalizeLookupNumber(entry.number) === card.lookupNumber
    ) ?? null
  );
}

async function fetchLimitlessSearchResults(query: string) {
  const normalizedQuery = String(query ?? "").trim();

  if (!normalizedQuery) {
    return [];
  }

  if (!searchCache.has(normalizedQuery)) {
    const request = fetch(
      `${LIMITLESS_SEARCH_API_URL}?${new URLSearchParams({ q: normalizedQuery, lang: "en" })}`,
      { next: { revalidate: 86400 } }
    )
      .then(async (response) => (response.ok ? ((await response.json()) as unknown) : []))
      .then((payload) => (Array.isArray(payload) ? (payload as LimitlessSearchResult[]) : []))
      .catch(() => []);

    searchCache.set(normalizedQuery, request);
  }

  return searchCache.get(normalizedQuery) ?? [];
}

async function fetchLimitlessVersions(id: string) {
  const normalizedId = String(id ?? "").trim();

  if (!normalizedId) {
    return [];
  }

  if (!versionsCache.has(normalizedId)) {
    const request = fetch(
      `${LIMITLESS_VERSIONS_API_URL}?${new URLSearchParams({ id: normalizedId, lang: "en" })}`,
      { next: { revalidate: 86400 } }
    )
      .then(async (response) => (response.ok ? ((await response.json()) as unknown) : []))
      .then((payload) => (Array.isArray(payload) ? (payload as LimitlessVersionResult[]) : []))
      .catch(() => []);

    versionsCache.set(normalizedId, request);
  }

  return versionsCache.get(normalizedId) ?? [];
}

async function fetchLimitlessPokedexMap() {
  if (!pokedexPromise) {
    pokedexPromise = fetch(LIMITLESS_POKEDEX_API_URL, { next: { revalidate: 86400 } })
      .then(async (response) => (response.ok ? ((await response.json()) as unknown) : []))
      .then((payload) => {
        const entries = Array.isArray(payload) ? payload : [];
        return new Map(
          entries
            .filter(
              (entry): entry is LimitlessPokedexEntry =>
                !!entry &&
                typeof entry === "object" &&
                Number.isInteger((entry as { id?: unknown }).id)
            )
            .map((entry) => [entry.id, entry])
        );
      })
      .catch(() => new Map<number, LimitlessPokedexEntry>());
  }

  return pokedexPromise;
}

async function resolveDeckListCardMetadata(card: DeckCard): Promise<ResolvedDeckCard> {
  const baseCard: ResolvedDeckCard = {
    ...card,
    lookupName: normalizeCardName(card.name),
    lookupSet: normalizeSetCode(card.set),
    lookupNumber: normalizeLookupNumber(card.number),
    limitlessIdentity: null,
    cardType: getDeckListCardTypeFallback(card.category),
    resolvedTrainerType: null,
    stageKey: null,
    dexNumber: null,
    specialKey: null,
    labels: null,
    prints: [
      {
        set: card.set,
        number: card.number,
        count: card.count
      }
    ]
  };

  const queries = [
    baseCard.lookupSet ? `${card.name} set:${baseCard.lookupSet}` : "",
    `${card.name} ${card.number}`,
    card.name
  ].filter(Boolean);

  let searchMatch: LimitlessSearchResult | null = null;

  for (const query of queries) {
    const results = await fetchLimitlessSearchResults(query);
    searchMatch = findMatchingLimitlessSearchResult(results, baseCard);
    if (searchMatch) {
      break;
    }
  }

  if (!searchMatch?.id) {
    return baseCard;
  }

  const versions = await fetchLimitlessVersions(String(searchMatch.id));
  const versionMatch = findMatchingLimitlessVersion(versions, baseCard);
  const metadata = versionMatch ?? null;
  const limitlessIdentity =
    metadata?.data_id != null
      ? String(metadata.data_id)
      : searchMatch.id != null
        ? String(searchMatch.id)
        : null;

  return {
    ...baseCard,
    limitlessIdentity,
    cardType: String(metadata?.card_type ?? searchMatch.card_type ?? baseCard.cardType)
      .trim()
      .toLowerCase() || baseCard.cardType,
    resolvedTrainerType:
      String(metadata?.type ?? "")
        .trim()
        .toLowerCase() || null,
    stageKey:
      String(metadata?.stage ?? "")
        .trim()
        .toLowerCase() || null,
    dexNumber:
      typeof metadata?.dex_number === "number" && Number.isInteger(metadata.dex_number)
        ? metadata.dex_number
        : null,
    specialKey:
      typeof metadata?.special === "string" && metadata.special.trim()
        ? metadata.special.trim().toLowerCase()
        : typeof searchMatch.special === "string" && searchMatch.special.trim()
          ? searchMatch.special.trim().toLowerCase()
          : null,
    labels:
      typeof metadata?.labels === "string" && metadata.labels.trim()
        ? metadata.labels.trim().toLowerCase()
        : null
  };
}

function mergeDeckListPrints(
  existingPrints: ResolvedDeckCard["prints"],
  card: Pick<DeckCard, "set" | "number" | "count">
) {
  const nextPrints = existingPrints.map((print) => ({ ...print }));
  const match = nextPrints.find(
    (print) =>
      normalizeSetCode(print.set) === normalizeSetCode(card.set) &&
      normalizeLookupNumber(print.number) === normalizeLookupNumber(card.number)
  );

  if (match) {
    match.count += card.count;
    return nextPrints;
  }

  nextPrints.push({
    set: card.set,
    number: card.number,
    count: card.count
  });

  return nextPrints;
}

function combineResolvedDeckListCardsByIdentity(cards: ResolvedDeckCard[]) {
  const groupedCards: ResolvedDeckCard[] = [];
  const cardsByIdentity = new Map<string, ResolvedDeckCard>();

  cards.forEach((card) => {
    const identity = String(card.limitlessIdentity ?? "").trim();

    if (!identity) {
      groupedCards.push(card);
      return;
    }

    const existingCard = cardsByIdentity.get(identity);
    if (!existingCard) {
      cardsByIdentity.set(identity, card);
      groupedCards.push(card);
      return;
    }

    existingCard.count += card.count;
    existingCard.prints = mergeDeckListPrints(existingCard.prints, card);
  });

  return groupedCards;
}

function splitDeckListCardsByKey<T extends ResolvedDeckCard, K extends string>(
  cards: T[],
  groups: readonly K[],
  property: keyof T
): Record<K | "err", T[]> {
  const buckets = Object.fromEntries(groups.map((group) => [group, [] as T[]])) as Record<K, T[]>;
  const remainder: T[] = [];

  cards.forEach((card) => {
    const key = String(card[property] ?? "").toLowerCase();

    if (groups.includes(key as K)) {
      buckets[key as K].push(card);
      return;
    }

    remainder.push(card);
  });

  return {
    ...buckets,
    err: remainder
  };
}

function sortDeckListCardsByCount(cards: ResolvedDeckCard[]) {
  cards.sort((left, right) => (left.count > right.count ? -1 : left.count < right.count ? 1 : 0));
}

function isLimitlessEvolutionCard(card: ResolvedDeckCard) {
  return card.stageKey != null && LIMITLESS_EVOLUTION_STAGES.has(card.stageKey);
}

function getLimitlessPokemonNameId(card: ResolvedDeckCard) {
  let identifier = `${card.dexNumber}`;

  if (card.stageKey === "vstar") {
    identifier += "_vstar";
  } else if (card.stageKey === "vmax") {
    identifier += "_vmax";
  } else if (card.stageKey === "mega") {
    identifier += "_ucex_mega";
  } else if (card.stageKey === "break") {
    identifier += "_break";
  } else if (card.stageKey === "lvx") {
    identifier += "_lvx";
  }

  if (card.specialKey) {
    identifier += `_${card.specialKey}`;
  }

  return identifier;
}

function getLimitlessPokemonPrevoNameId(
  card: ResolvedDeckCard,
  pokedexMap: Map<number, LimitlessPokedexEntry>
) {
  if (card.dexNumber == null) {
    return undefined;
  }

  const pokedexEntry = pokedexMap.get(card.dexNumber);
  if (!pokedexEntry) {
    return undefined;
  }

  if (card.labels === "mega") {
    const evolvesFrom =
      pokedexEntry.evolves_from == null ? undefined : pokedexMap.get(pokedexEntry.evolves_from);
    return evolvesFrom?.evolves_from == null ? undefined : `${evolvesFrom.evolves_from}`;
  }

  if (card.stageKey === "stage1" || card.stageKey === "stage2") {
    return pokedexEntry.evolves_from == null ? undefined : `${pokedexEntry.evolves_from}`;
  }

  if (card.stageKey === "vstar" || card.stageKey === "vmax") {
    return `${pokedexEntry.id}_v`;
  }

  if (card.stageKey === "break" || card.stageKey === "lvx") {
    return `${pokedexEntry.id}`;
  }

  if (card.stageKey === "mega") {
    return pokedexEntry.evolves_from == null ? undefined : `${pokedexEntry.evolves_from}_ucex`;
  }

  return undefined;
}

function isSkippedStageTwoFromBasic(
  basicCard: DecoratedPokemonCard,
  evolvedCard: DecoratedPokemonCard,
  pokedexMap: Map<number, LimitlessPokedexEntry>
) {
  if (
    !(
      evolvedCard.stageKey === "stage2" &&
      basicCard.stageKey === "basic" &&
      !basicCard.specialKey &&
      basicCard.dexNumber != null &&
      evolvedCard.dexNumber != null
    )
  ) {
    return false;
  }

  const evolvedEntry = pokedexMap.get(evolvedCard.dexNumber);
  if (!evolvedEntry?.evolves_from) {
    return false;
  }

  const middleEntry = pokedexMap.get(evolvedEntry.evolves_from);
  return Boolean(middleEntry && middleEntry.evolves_from === basicCard.dexNumber);
}

function sortPokemonCardsLikeLimitless(
  cards: ResolvedDeckCard[],
  pokedexMap: Map<number, LimitlessPokedexEntry>
) {
  const pending: DecoratedPokemonCard[] = cards.map((card) => ({
    ...card,
    nameId: getLimitlessPokemonNameId(card),
    prevoNameId: getLimitlessPokemonPrevoNameId(card, pokedexMap)
  }));
  const familyCounts = new Map<string, number>();
  const hasPreEvolutionInDeck = new Map<string, boolean>();
  const preEvolutionTargets: string[] = [];

  pending.forEach((card) => {
    const familyId = card.nameId;
    familyCounts.set(familyId, (familyCounts.get(familyId) ?? 0) + card.count);

    if (hasPreEvolutionInDeck.has(familyId)) {
      return;
    }

    let foundPreEvolution = false;
    if (isLimitlessEvolutionCard(card)) {
      for (const candidate of pending) {
        if (
          candidate.nameId === card.prevoNameId ||
          isSkippedStageTwoFromBasic(candidate, card, pokedexMap)
        ) {
          foundPreEvolution = true;
          preEvolutionTargets.push(candidate.nameId);
          break;
        }
      }
    }

    hasPreEvolutionInDeck.set(familyId, foundPreEvolution);
  });

  const sorted: ResolvedDeckCard[] = [];
  let previousCard: DecoratedPokemonCard | null = null;

  while (pending.length > 0) {
    let bestIndex = 0;
    let bestPriority = 6;

    for (let index = 0; index < pending.length; index += 1) {
      const candidate = pending[index];
      const familyId = candidate.nameId;
      let priority = 5;

      if (previousCard?.nameId === familyId) {
        priority = 0;
      } else if (
        hasPreEvolutionInDeck.get(familyId) &&
        previousCard?.prevoNameId === candidate.prevoNameId
      ) {
        priority = 1;
      } else if (
        hasPreEvolutionInDeck.get(familyId) &&
        previousCard?.nameId === candidate.prevoNameId
      ) {
        priority = 2;
      } else if (
        hasPreEvolutionInDeck.get(familyId) &&
        previousCard &&
        isSkippedStageTwoFromBasic(previousCard, candidate, pokedexMap)
      ) {
        priority = 3;
      } else if (!hasPreEvolutionInDeck.get(familyId)) {
        priority = 4;
      }

      let shouldReplace = priority < bestPriority;

      if (priority === 4 && bestPriority === 4) {
        const currentBest = pending[bestIndex];
        const currentBestFamilyId = currentBest.nameId;
        const hasHigherCount =
          (familyCounts.get(familyId) ?? 0) > (familyCounts.get(currentBestFamilyId) ?? 0);
        const hasEqualCount =
          (familyCounts.get(familyId) ?? 0) === (familyCounts.get(currentBestFamilyId) ?? 0);
        const candidateFeedsEvolution =
          preEvolutionTargets.includes(familyId) &&
          !preEvolutionTargets.includes(currentBestFamilyId);
        const bothFeedEvolution =
          preEvolutionTargets.includes(familyId) &&
          preEvolutionTargets.includes(currentBestFamilyId);
        const candidateIsSpecial = Boolean(candidate.specialKey && !currentBest.specialKey);

        if (
          hasHigherCount ||
          (hasEqualCount && (candidateFeedsEvolution || (bothFeedEvolution && candidateIsSpecial)))
        ) {
          shouldReplace = true;
        }
      }

      if (shouldReplace) {
        bestIndex = index;
        bestPriority = priority;
      }

      if (bestPriority === 0) {
        break;
      }
    }

    const [nextCard] = pending.splice(bestIndex, 1);
    previousCard = nextCard;
    sorted.push(nextCard);
  }

  return sorted;
}

function sortDeckListCardsLikeLimitless(
  cards: ResolvedDeckCard[],
  pokedexMap: Map<number, LimitlessPokedexEntry>
) {
  const grouped = splitDeckListCardsByKey(cards, ["pokemon", "trainer", "energy"] as const, "cardType");
  const trainers = splitDeckListCardsByKey(
    grouped.trainer,
    ["supporter", "item", "tool", "stadium"] as const,
    "resolvedTrainerType"
  );

  Object.keys(trainers).forEach((key) => {
    sortDeckListCardsByCount(trainers[key as keyof typeof trainers] as ResolvedDeckCard[]);
  });
  sortDeckListCardsByCount(grouped.energy);
  sortDeckListCardsByCount(grouped.pokemon);

  return [
    ...sortPokemonCardsLikeLimitless(grouped.pokemon, pokedexMap),
    ...trainers.supporter,
    ...trainers.item,
    ...trainers.tool,
    ...trainers.stadium,
    ...trainers.err,
    ...grouped.energy,
    ...grouped.err
  ];
}

export async function sortDeckListCards(cards: DeckCard[]) {
  if (cards.length === 0) {
    return [];
  }

  const [pokedexMap, resolvedCards] = await Promise.all([
    fetchLimitlessPokedexMap(),
    Promise.all(cards.map((card) => resolveDeckListCardMetadata(card)))
  ]);

  return sortDeckListCardsLikeLimitless(
    combineResolvedDeckListCardsByIdentity(resolvedCards),
    pokedexMap
  ).map(
    ({
      prints,
      lookupName,
      lookupSet,
      lookupNumber,
      limitlessIdentity,
      cardType,
      resolvedTrainerType,
      stageKey,
      dexNumber,
      specialKey,
      labels,
      ...card
    }) => card
  );
}
