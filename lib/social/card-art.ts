import { parseFavouriteCards, SocialValidationError } from "./validation";
import type { FavouriteCardArt } from "./types";

const CARD_SEARCH_URL = "https://limitlesstcg.com/api/dm/search";

/** Read trusted print identities; image URLs are derived locally from set/number. */
export async function searchCardArtPrints(query: string): Promise<FavouriteCardArt[]> {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length < 2 || normalizedQuery.length > 120) return [];
  const response = await fetch(`${CARD_SEARCH_URL}?${new URLSearchParams({ q: normalizedQuery, lang: "en" })}`, {
    next: { revalidate: 86400 },
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error("Card artwork search is unavailable.");
  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) throw new Error("Card artwork search returned an invalid response.");
  const seen = new Set<string>();
  const prints: FavouriteCardArt[] = [];
  for (const entry of payload) {
    try {
      const [card] = parseFavouriteCards([entry]);
      const key = `${card.set}/${card.number}`;
      if (!seen.has(key)) { seen.add(key); prints.push(card); }
    } catch { /* A provider entry that isn't an English print is not an option. */ }
  }
  return prints;
}

export async function validateCardArtPrints(cards: FavouriteCardArt[], savedCards: FavouriteCardArt[] = []): Promise<FavouriteCardArt[]> {
  const validated = parseFavouriteCards(cards);
  // Saved identities came from the current owner's database row, never a client claim.
  const alreadySaved = (card: FavouriteCardArt) => savedCards.some((saved) => saved.set === card.set && saved.number === card.number && saved.name === card.name);
  const names = [...new Set(validated.filter((card) => !alreadySaved(card)).map((card) => card.name))];
  const resultSets = await Promise.all(names.map(searchCardArtPrints));
  const byName = new Map(names.map((name, index) => [name, resultSets[index]]));
  return validated.map((card) => {
    if (alreadySaved(card)) return card;
    const match = byName.get(card.name)?.find((entry) => entry.set === card.set && entry.number === card.number && entry.name === card.name);
    if (!match) throw new SocialValidationError(`Choose ${card.name} again from the artwork search results.`);
    return match;
  });
}
