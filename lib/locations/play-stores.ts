import ukPlayStores from "./data/uk-play-stores.json";

type PlayStoreRecord = {
  id: string;
  leagueId: string;
  name: string;
  address: string;
};

export type PlayStoreSuggestion = PlayStoreRecord & {
  city: string;
  label: string;
};

const UK_PLAY_STORES = ukPlayStores satisfies PlayStoreRecord[];
const UK_POSTCODE = /\b(?:GIR\s?0AA|[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2})\b/i;
const NON_CITY_PARTS = new Set([
  "ENGLAND",
  "GREAT BRITAIN",
  "NORTHERN IRELAND",
  "SCOTLAND",
  "UK",
  "UNITED KINGDOM",
  "WALES"
]);
const ADDRESS_ENDINGS =
  /\b(?:ARCADE|BUILDING|CENTRE|CENTER|CLOSE|COURT|DRIVE|ESTATE|LANE|MALL|MARKET|PARK|ROAD|SQUARE|STREET|WAY)\.?$/i;

function normalizeSearchValue(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-GB")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function extractUkCity(address: string) {
  const parts = address
    .replace(/,?\s*(?:GB|UK)\s*$/i, "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const candidate = parts[index]
      .replace(UK_POSTCODE, "")
      .replace(/^GB-[A-Z]{2,3}\s*/i, "")
      .trim();
    const normalizedCandidate = candidate.toLocaleUpperCase("en-GB");

    if (
      !candidate ||
      NON_CITY_PARTS.has(normalizedCandidate) ||
      /\d/.test(candidate) ||
      /^(?:ARCH|FLOOR|SHOP|SUITE|UNIT)\b/i.test(candidate) ||
      ADDRESS_ENDINGS.test(candidate)
    ) {
      continue;
    }

    return candidate;
  }

  return "";
}

function buildPlayStoreLabel(store: PlayStoreRecord) {
  const city = extractUkCity(store.address);
  const normalizedName = normalizeSearchValue(store.name);
  const normalizedCity = normalizeSearchValue(city);

  return {
    city,
    label:
      city && !normalizedName.includes(normalizedCity) ? `${store.name}, ${city}` : store.name
  };
}

function matchRank(store: PlayStoreSuggestion, normalizedQuery: string) {
  const name = normalizeSearchValue(store.name);
  const label = normalizeSearchValue(store.label);
  const address = normalizeSearchValue(store.address);
  const leagueId = normalizeSearchValue(store.leagueId);
  const terms = normalizedQuery.split(" ").filter(Boolean);

  if (name === normalizedQuery) return 0;
  if (name.startsWith(normalizedQuery)) return 1;
  if (name.includes(normalizedQuery)) return 2;
  if (terms.every((term) => name.includes(term))) return 3;
  if (label.includes(normalizedQuery)) return 4;
  if (leagueId.startsWith(normalizedQuery)) return 5;
  if (address.includes(normalizedQuery)) return 6;
  if (terms.every((term) => `${label} ${address}`.includes(term))) return 7;

  return null;
}

export function searchUkPlayStores(query: string, limit = 10): PlayStoreSuggestion[] {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery || limit <= 0) {
    return [];
  }

  return UK_PLAY_STORES.flatMap((store) => {
    const suggestion = { ...store, ...buildPlayStoreLabel(store) };
    const rank = matchRank(suggestion, normalizedQuery);
    return rank === null ? [] : [{ rank, store: suggestion }];
  })
    .sort(
      (left, right) =>
        left.rank - right.rank || left.store.name.localeCompare(right.store.name, "en-GB")
    )
    .slice(0, limit)
    .map(({ store }) => store);
}

export const UK_PLAY_STORE_SNAPSHOT = {
  count: UK_PLAY_STORES.length,
  source: "https://events.pokemon.com/EventLocator/",
  retrievedAt: "2026-09-16"
} as const;
