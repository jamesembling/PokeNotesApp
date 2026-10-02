import { normalizeLimitlessSetCode } from "@/lib/deck-lists/limitless";
import type { FavouriteCardArt, FriendshipOperation, ShowcaseInput } from "./types";

export class SocialValidationError extends Error {}

export function parseFavouriteCards(value: unknown): FavouriteCardArt[] {
  if (!Array.isArray(value) || value.length > 3) {
    throw new SocialValidationError("Choose up to three favourite card artworks.");
  }
  const seen = new Set<string>();
  return value.map((entry) => {
    if (!entry || typeof entry !== "object") throw new SocialValidationError("Choose a valid card artwork.");
    const card = entry as Record<string, unknown>;
    if (typeof card.set !== "string" || typeof card.number !== "string" || typeof card.name !== "string") {
      throw new SocialValidationError("Choose a valid card artwork.");
    }
    const set = normalizeLimitlessSetCode(card.set);
    const number = card.number.trim().toUpperCase().replace(/^([A-Z]*?)0+(\d)/, "$1$2");
    const name = card.name.trim();
    if (!/^[A-Z0-9-]{1,12}$/.test(set) || !/^[A-Z]*\d+[A-Z]*$/.test(number) || number.length > 12 || !name || name.length > 120) {
      throw new SocialValidationError("Choose a valid card artwork from the search results.");
    }
    const key = `${set}/${number}`;
    if (seen.has(key)) throw new SocialValidationError("Choose three different card artworks.");
    seen.add(key);
    return { set, number, name };
  });
}

export function parseShowcaseForm(form: FormData): ShowcaseInput {
  const trainerName = String(form.get("trainerName") ?? "").trim();
  if (trainerName.length > 40 || trainerName.length < 2 || /[\u0000-\u001f\u007f]/.test(trainerName)) {
    throw new SocialValidationError("Choose a trainer name between 2 and 40 characters.");
  }
  const favouritePokemonSlug = String(form.get("favouritePokemonSlug") ?? "").trim() || null;
  if (favouritePokemonSlug && !/^[a-z0-9-]{1,100}$/.test(favouritePokemonSlug)) {
    throw new SocialValidationError("Choose a favourite Pokémon from the search results.");
  }
  let cards: unknown;
  const serializedCards = String(form.get("favouriteCards") ?? "[]");
  if (serializedCards.length > 2000) throw new SocialValidationError("Choose up to three favourite card artworks.");
  try { cards = JSON.parse(serializedCards); } catch { throw new SocialValidationError("Choose your favourite card artworks again."); }
  return { enabled: true, trainerName, favouritePokemonSlug, favouriteCards: parseFavouriteCards(cards), shareLastLogin: form.get("shareLastLogin") === "on" };
}

export function parseFriendshipForm(form: FormData): { targetUserId: string; operation: FriendshipOperation } {
  const targetUserId = String(form.get("targetUserId") ?? "");
  const operation = String(form.get("operation") ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetUserId) || !["request", "accept", "decline", "cancel", "remove", "block", "unblock"].includes(operation)) {
    throw new SocialValidationError("Choose a valid player and friendship action.");
  }
  return { targetUserId, operation: operation as FriendshipOperation };
}
