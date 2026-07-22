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

type IndexedDeckLinkCandidate = DeckLinkCandidate & {
  normalizedDeckName: string;
};

export type DeckLinkCandidateIndex = {
  deckIds: Set<string>;
  indexedCandidates: IndexedDeckLinkCandidate[];
};

export type LinkableLogDeck = {
  linkedDeckId?: string;
  selfDeckName: string;
  selfDeckSprites: string[];
};

export type PersistableLogDeck = {
  linkedDeckId?: string | null;
  linkedDeckListId?: string | null;
  selfDeckName: string;
  selfDeckSlug: string;
  selfDeckSprites: string[];
};

export type PersistableDeckLinkDecision =
  | {
      status: "already-linked";
      linkedDeckId?: string;
    }
  | {
      status: "linked";
      linkedDeckId: string;
    }
  | {
      status: "ambiguous";
    }
  | {
      status: "no-match";
    };

type CandidateDecision = Exclude<PersistableDeckLinkDecision, { status: "already-linked" }>;

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

export function buildDeckLinkCandidateIndex(candidates: DeckLinkCandidate[]): DeckLinkCandidateIndex {
  return {
    deckIds: new Set(candidates.map((candidate) => candidate.id)),
    indexedCandidates: candidates.map((candidate) => ({
      ...candidate,
      normalizedDeckName: normalizeText(candidate.deckName)
    }))
  };
}

function getDeckMatchScoreForIndexedCandidate(
  deck: IndexedDeckLinkCandidate,
  identified: {
    deckName: string;
    deckSlug?: string;
    logNames: string[];
    spriteSet: Set<string>;
    sprites: string[];
  }
) {
  const deckSprites = deck.deckPokemon;
  const logSprites = identified.sprites;
  if (deckSprites.length && logSprites.length) {
    const overlap = deckSprites.filter((slug) => identified.spriteSet.has(slug)).length;
    const requiredOverlap = Math.min(deckSprites.length, 2);

    if (overlap >= requiredOverlap) {
      return 120 + overlap;
    }
  }

  const deckKey = deck.normalizedDeckName;
  if (!deckKey) {
    return 0;
  }

  const exactMatch = identified.logNames.find((value) => value === deckKey);
  if (exactMatch) {
    return 200;
  }

  const fuzzyMatch = identified.logNames.find((value) => value.includes(deckKey) || deckKey.includes(value));
  if (fuzzyMatch) {
    return 160;
  }

  return 0;
}

function getDeckLinkScoreForIndexedCandidate(deck: IndexedDeckLinkCandidate, identified: {
  deckName: string;
  deckSlug: string;
  logNames: string[];
  spriteSet: Set<string>;
  sprites: string[];
}) {
  const baseScore = getDeckMatchScoreForIndexedCandidate(deck, identified);
  const spriteOverlap = deck.deckPokemon.filter((slug) => identified.spriteSet.has(slug)).length;

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

function getUniqueBestCandidateDecision(
  candidates: Array<{ id: string; score: number }>,
  minimumScore: number
): CandidateDecision {
  const ranked = candidates
    .filter((entry) => entry.score >= minimumScore)
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));

  const best = ranked[0];
  if (!best) {
    return {
      status: "no-match"
    };
  }

  if (ranked[1] && ranked[1].score === best.score) {
    return {
      status: "ambiguous"
    };
  }

  return {
    status: "linked",
    linkedDeckId: best.id
  };
}

function getUniqueBestCandidate(
  candidates: Array<{ id: string; score: number }>,
  minimumScore: number
) {
  const decision = getUniqueBestCandidateDecision(candidates, minimumScore);
  return decision.status === "linked" ? decision.linkedDeckId : null;
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
  const index = buildDeckLinkCandidateIndex(candidates);
  const identifiedForScoring = {
    ...identified,
    logNames: [identified.deckName, identified.deckSlug || ""]
      .map((value) => normalizeText(value))
      .filter(Boolean),
    spriteSet: new Set(identified.sprites)
  };

  return getUniqueBestCandidate(
    index.indexedCandidates.map((deck) => ({
      id: deck.id,
      score: getDeckLinkScoreForIndexedCandidate(deck, identifiedForScoring)
    })),
    170
  );
}

export function resolvePersistableLogDeckLink(
  candidates: DeckLinkCandidate[],
  log: PersistableLogDeck
): PersistableDeckLinkDecision {
  const explicitDeckId = String(log.linkedDeckId || "").trim();
  const explicitDeckListId = String(log.linkedDeckListId || "").trim();

  if (explicitDeckId || explicitDeckListId) {
    return {
      status: "already-linked",
      linkedDeckId: explicitDeckId || undefined
    };
  }

  const index = buildDeckLinkCandidateIndex(candidates);
  const identified = {
    deckName: log.selfDeckName,
    deckSlug: log.selfDeckSlug,
    logNames: [log.selfDeckName, log.selfDeckSlug || ""]
      .map((value) => normalizeText(value))
      .filter(Boolean),
    spriteSet: new Set(log.selfDeckSprites),
    sprites: log.selfDeckSprites
  };

  return getUniqueBestCandidateDecision(
    index.indexedCandidates.map((deck) => ({
      id: deck.id,
      score: getDeckLinkScoreForIndexedCandidate(deck, identified)
    })),
    170
  );
}

export function resolveLinkedDeckFromIndex(
  index: DeckLinkCandidateIndex,
  log: LinkableLogDeck
) {
  const explicitDeckId = String(log.linkedDeckId || "").trim();
  if (explicitDeckId && index.deckIds.has(explicitDeckId)) {
    return explicitDeckId;
  }

  const identified = {
    deckName: log.selfDeckName,
    logNames: [log.selfDeckName].map((value) => normalizeText(value)).filter(Boolean),
    spriteSet: new Set(log.selfDeckSprites),
    sprites: log.selfDeckSprites
  };

  return getUniqueBestCandidate(
    index.indexedCandidates.map((deck) => ({
      id: deck.id,
      score: getDeckMatchScoreForIndexedCandidate(deck, identified)
    })),
    120
  );
}

export function resolveLinkedDeck(
  decks: DeckLinkCandidate[],
  log: LinkableLogDeck
) {
  return resolveLinkedDeckFromIndex(buildDeckLinkCandidateIndex(decks), log);
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
