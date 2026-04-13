import { createClient } from "@/lib/supabase/server";
import { normalizeText } from "@/lib/log-import/normalization";

type DeckLinkCandidateRow = {
  id: string;
  deck_name: string;
  deck_pokemon: unknown;
};

export type DeckLinkCandidate = {
  id: string;
  deckName: string;
  deckPokemon: string[];
};

export type LinkableLogDeck = {
  linkedDeckId?: string;
  selfDeckName: string;
  selfDeckSprites: string[];
};

function parseStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}

function mapDeckLinkCandidate(row: DeckLinkCandidateRow): DeckLinkCandidate {
  return {
    id: row.id,
    deckName: row.deck_name,
    deckPokemon: parseStringArray(row.deck_pokemon)
  };
}

export function getDeckMatchScore(deck: DeckLinkCandidate, identified: {
  deckName: string;
  deckSlug?: string;
  sprites: string[];
}) {
  const deckSprites = deck.deckPokemon;
  const logSprites = identified.sprites;
  if (deckSprites.length && logSprites.length) {
    const overlap = deckSprites.filter((slug) => logSprites.includes(slug)).length;
    const requiredOverlap = Math.min(deckSprites.length, 2);

    if (overlap >= requiredOverlap) {
      return 120 + overlap;
    }
  }

  const deckKey = normalizeText(deck.deckName);
  if (!deckKey) {
    return 0;
  }

  const logNames = [identified.deckName, identified.deckSlug || ""]
    .map((value) => normalizeText(value))
    .filter(Boolean);

  const exactMatch = logNames.find((value) => value === deckKey);
  if (exactMatch) {
    return 200;
  }

  const fuzzyMatch = logNames.find((value) => value.includes(deckKey) || deckKey.includes(value));
  if (fuzzyMatch) {
    return 160;
  }

  return 0;
}

function getDeckLinkScore(deck: DeckLinkCandidate, identified: {
  deckName: string;
  deckSlug: string;
  sprites: string[];
}) {
  const baseScore = getDeckMatchScore(deck, identified);
  const spriteOverlap = deck.deckPokemon.filter((slug) => identified.sprites.includes(slug)).length;

  if (baseScore >= 200) {
    return 220;
  }

  if (
    spriteOverlap >= 2 &&
    identified.sprites.length >= 2 &&
    spriteOverlap === Math.min(deck.deckPokemon.length, identified.sprites.length)
  ) {
    return 180 + spriteOverlap;
  }

  if (baseScore >= 160) {
    return 170;
  }

  if (identified.deckSlug && deck.deckPokemon.includes(identified.deckSlug) && spriteOverlap >= 1) {
    return 150 + spriteOverlap;
  }

  return baseScore;
}

function getUniqueBestCandidate(
  candidates: Array<{ id: string; score: number }>,
  minimumScore: number
) {
  const ranked = candidates
    .filter((entry) => entry.score >= minimumScore)
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));

  const best = ranked[0];
  if (!best) {
    return null;
  }

  if (ranked[1] && ranked[1].score === best.score) {
    return null;
  }

  return best.id;
}

export async function getDeckLinkCandidates(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("decks")
    .select("id,deck_name,deck_pokemon")
    .eq("user_id", userId);

  if (error) {
    throw error;
  }

  return ((data ?? []) as DeckLinkCandidateRow[]).map(mapDeckLinkCandidate);
}

export function resolveConservativeDeckLink(
  candidates: DeckLinkCandidate[],
  identified: {
    deckName: string;
    deckSlug: string;
    sprites: string[];
  }
) {
  return getUniqueBestCandidate(
    candidates.map((deck) => ({
      id: deck.id,
      score: getDeckLinkScore(deck, identified)
    })),
    170
  );
}

export function resolveLinkedDeck(
  decks: DeckLinkCandidate[],
  log: LinkableLogDeck
) {
  const explicitDeckId = String(log.linkedDeckId || "").trim();
  if (explicitDeckId && decks.some((deck) => deck.id === explicitDeckId)) {
    return explicitDeckId;
  }

  return getUniqueBestCandidate(
    decks.map((deck) => ({
      id: deck.id,
      score: getDeckMatchScore(deck, {
        deckName: log.selfDeckName,
        sprites: log.selfDeckSprites
      })
    })),
    120
  );
}

export async function linkDeckConservatively(args: {
  userId: string;
  identifiedDeckName: string;
  identifiedDeckSlug: string;
  identifiedSprites: string[];
}) {
  const candidates = await getDeckLinkCandidates(args.userId);
  return resolveConservativeDeckLink(candidates, {
    deckName: args.identifiedDeckName,
    deckSlug: args.identifiedDeckSlug,
    sprites: args.identifiedSprites
  });
}
