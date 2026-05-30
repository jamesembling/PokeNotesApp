import { getBattleLogDeckDisplayName } from "@/lib/battle-log/display";
import { buildDeckArchetypeId } from "@/lib/decks/archetype";
import { compactMap } from "@/lib/array";

export const LEARNED_SELF_ARCHETYPE_THRESHOLD = 3;

type QueryResult = {
  data: Array<{ id?: unknown }> | null;
  error: unknown;
};

type SpriteQueryResult = {
  data: Array<{ self_deck_sprites?: unknown }> | null;
  error: unknown;
};

type LogsClient = {
  from(table: "logs"): unknown;
};

export type LearnedSelfArchetype = {
  archetypeId: string;
  label: string;
  sprites: string[];
  matchCount: number;
};

function normalizeSprite(value: string) {
  return String(value || "").trim().toLowerCase();
}

const PREFERRED_LEARNED_SPRITE_ORDERS = new Map<string, string[]>([
  ["dudunsparce,greninja-mega", ["greninja-mega", "dudunsparce"]]
]);

export function normalizeLearnedSelfDeckSprites(sprites: string[]) {
  const normalizedSprites = Array.from(new Set(compactMap(sprites, normalizeSprite))).slice(0, 2);
  const sortedKey = normalizedSprites.toSorted((left, right) => left.localeCompare(right)).join(",");

  return PREFERRED_LEARNED_SPRITE_ORDERS.get(sortedKey) ?? normalizedSprites;
}

function buildStoredSpriteVariants(sprites: string[]) {
  const normalizedSprites = normalizeLearnedSelfDeckSprites(sprites);
  if (normalizedSprites.length === 0) {
    return [];
  }

  if (normalizedSprites.length === 1) {
    return [normalizedSprites[0]];
  }

  const [first, second] = normalizedSprites;
  return [`${first},${second}`, `${second},${first}`];
}

function uniqueSpriteCandidates(candidates: string[][]) {
  const seen = new Set<string>();
  const normalizedCandidates: string[][] = [];

  candidates.forEach((candidate) => {
    const normalized = normalizeLearnedSelfDeckSprites(candidate);
    const key = normalized.join(",");
    if (!key || seen.has(key)) {
      return;
    }

    seen.add(key);
    normalizedCandidates.push(normalized);
  });

  return normalizedCandidates;
}

export function buildLearnedSelfArchetype(sprites: string[], matchCount: number): LearnedSelfArchetype | null {
  const normalizedSprites = normalizeLearnedSelfDeckSprites(sprites);
  const archetypeId = buildDeckArchetypeId(normalizedSprites);

  if (!archetypeId) {
    return null;
  }

  return {
    archetypeId,
    label: getBattleLogDeckDisplayName("", normalizedSprites),
    sprites: normalizedSprites,
    matchCount
  };
}

export async function resolveLearnedSelfArchetype(args: {
  supabase: LogsClient;
  userId: string;
  sprites: string[];
  minimumExistingMatches?: number;
}): Promise<LearnedSelfArchetype | null> {
  const minimumExistingMatches = args.minimumExistingMatches ?? LEARNED_SELF_ARCHETYPE_THRESHOLD;
  const storedSpriteVariants = buildStoredSpriteVariants(args.sprites);

  if (!args.userId || storedSpriteVariants.length === 0 || minimumExistingMatches < 1) {
    return null;
  }

  const logsTable = args.supabase.from("logs") as {
    select(value: string): {
      eq(column: string, value: unknown): {
        in(column: string, values: unknown[]): {
          limit(count: number): PromiseLike<QueryResult>;
        };
      };
    };
  };
  const query = logsTable
    .select("id")
    .eq("user_id", args.userId)
    .in("self_deck_sprites", storedSpriteVariants)
    .limit(minimumExistingMatches);
  const { data, error } = await query;

  if (error) {
    throw error;
  }

  const matchCount = data?.length ?? 0;
  if (matchCount < minimumExistingMatches) {
    return null;
  }

  return buildLearnedSelfArchetype(args.sprites, matchCount);
}

export async function resolveLearnedSelfArchetypeFromCandidates(args: {
  supabase: LogsClient;
  userId: string;
  candidates: string[][];
  minimumExistingMatches?: number;
}): Promise<LearnedSelfArchetype | null> {
  const minimumExistingMatches = args.minimumExistingMatches ?? LEARNED_SELF_ARCHETYPE_THRESHOLD;
  const normalizedCandidates = uniqueSpriteCandidates(args.candidates);
  const candidateVariants = normalizedCandidates.flatMap((candidate) => buildStoredSpriteVariants(candidate));
  const storedSpriteVariants = Array.from(new Set(candidateVariants));

  if (!args.userId || storedSpriteVariants.length === 0 || minimumExistingMatches < 1) {
    return null;
  }

  const logsTable = args.supabase.from("logs") as {
    select(value: string): {
      eq(column: string, value: unknown): {
        in(column: string, values: unknown[]): {
          limit(count: number): PromiseLike<SpriteQueryResult>;
        };
      };
    };
  };
  const query = logsTable
    .select("self_deck_sprites")
    .eq("user_id", args.userId)
    .in("self_deck_sprites", storedSpriteVariants)
    .limit(Math.min(storedSpriteVariants.length * minimumExistingMatches, 500));
  const { data, error } = await query;

  if (error) {
    throw error;
  }

  const matchCounts = new Map<string, number>();
  (data ?? []).forEach((row) => {
    const storedSprites = String(row.self_deck_sprites ?? "").trim();
    if (!storedSprites) {
      return;
    }

    matchCounts.set(storedSprites, (matchCounts.get(storedSprites) ?? 0) + 1);
  });

  for (const candidate of normalizedCandidates) {
    const matchCount = buildStoredSpriteVariants(candidate).reduce(
      (sum, variant) => sum + (matchCounts.get(variant) ?? 0),
      0
    );

    if (matchCount >= minimumExistingMatches) {
      return buildLearnedSelfArchetype(candidate, matchCount);
    }
  }

  return null;
}
