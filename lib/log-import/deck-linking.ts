import { createClient } from "@/lib/supabase/server";
import { normalizeText } from "@/lib/log-import/normalization";

type DeckLinkCandidateRow = {
  id: string;
  deck_name: string;
  deck_pokemon: unknown;
};

function parseStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}

function getDeckLinkScore(deck: { deckName: string; deckPokemon: string[] }, identified: {
  deckName: string;
  deckSlug: string;
  sprites: string[];
}) {
  const deckNameKey = normalizeText(deck.deckName);
  const identifiedNameKey = normalizeText(identified.deckName);
  const spriteOverlap = deck.deckPokemon.filter((slug) => identified.sprites.includes(slug)).length;

  if (deckNameKey && identifiedNameKey && deckNameKey === identifiedNameKey) {
    return 220;
  }

  if (
    spriteOverlap >= 2 &&
    identified.sprites.length >= 2 &&
    spriteOverlap === Math.min(deck.deckPokemon.length, identified.sprites.length)
  ) {
    return 180 + spriteOverlap;
  }

  if (
    deckNameKey &&
    identifiedNameKey &&
    (deckNameKey.includes(identifiedNameKey) || identifiedNameKey.includes(deckNameKey))
  ) {
    return 170;
  }

  if (identified.deckSlug && deck.deckPokemon.includes(identified.deckSlug) && spriteOverlap >= 1) {
    return 150 + spriteOverlap;
  }

  return 0;
}

export async function linkDeckConservatively(args: {
  userId: string;
  identifiedDeckName: string;
  identifiedDeckSlug: string;
  identifiedSprites: string[];
}) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("decks")
    .select("id,deck_name,deck_pokemon")
    .eq("user_id", args.userId);

  if (error) {
    throw error;
  }

  const candidates = ((data ?? []) as DeckLinkCandidateRow[])
    .map((deck) => ({
      id: deck.id,
      score: getDeckLinkScore(
        {
          deckName: deck.deck_name,
          deckPokemon: parseStringArray(deck.deck_pokemon)
        },
        {
          deckName: args.identifiedDeckName,
          deckSlug: args.identifiedDeckSlug,
          sprites: args.identifiedSprites
        }
      )
    }))
    .filter((entry) => entry.score >= 170)
    .sort((left, right) => right.score - left.score);

  const best = candidates[0];
  if (!best) {
    return null;
  }

  if (candidates[1] && candidates[1].score === best.score) {
    return null;
  }

  return best.id;
}
