import { getBattleLogDeckDisplayName } from "@/lib/battle-log/display";
import { buildDeckArchetypeId } from "@/lib/decks/archetype";
import { compactMap } from "@/lib/array";
import type { IdentificationCatalog } from "@/lib/log-import/types";

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

type LearnedArchetypeCatalogClient = {
  from(table: "archetype_catalog"): unknown;
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
  ["dudunsparce,greninja-mega", ["greninja-mega", "dudunsparce"]],
  ["hydrapple,ogerpon", ["hydrapple", "ogerpon"]]
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

function uniqueStrings(values: string[]) {
  return Array.from(new Set(compactMap(values, (value) => String(value || "").trim())));
}

function buildLearnedArchetypeCatalogId(userId: string, archetypeId: string) {
  return `learned:${userId}:${archetypeId}`;
}

function buildPokemonFamilyGroup(slug: string, catalog: IdentificationCatalog) {
  return uniqueStrings([slug, ...(catalog.pokemon.slugToAncestors.get(slug) ?? [])]);
}

export function buildLearnedSelfArchetypeCatalogRow(args: {
  userId: string;
  sprites: string[];
  matchCount: number;
  catalog: IdentificationCatalog;
}) {
  const learnedArchetype = buildLearnedSelfArchetype(args.sprites, args.matchCount);
  if (!learnedArchetype || !args.userId) {
    return null;
  }

  const requiredMatchGroups = learnedArchetype.sprites.map((sprite) =>
    buildPokemonFamilyGroup(sprite, args.catalog)
  );
  const detectionSprites = uniqueStrings(requiredMatchGroups.flat());

  return {
    id: buildLearnedArchetypeCatalogId(args.userId, learnedArchetype.archetypeId),
    canonical_id: learnedArchetype.archetypeId,
    label: learnedArchetype.label,
    sprites: learnedArchetype.sprites,
    detection_sprites: detectionSprites.length > 0 ? detectionSprites : learnedArchetype.sprites,
    required_match_groups: requiredMatchGroups,
    is_excluded: false,
    source: "learned" as const,
    user_id: args.userId,
    learned_match_count: learnedArchetype.matchCount
  };
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

export async function promoteLearnedSelfArchetype(args: {
  supabase: LogsClient & LearnedArchetypeCatalogClient;
  userId: string;
  sprites: string[];
  catalog: IdentificationCatalog;
  minimumExistingMatches?: number;
}): Promise<LearnedSelfArchetype | null> {
  const minimumExistingMatches = args.minimumExistingMatches ?? LEARNED_SELF_ARCHETYPE_THRESHOLD;
  const candidateArchetype = buildLearnedSelfArchetype(args.sprites, 0);
  if (!candidateArchetype || args.catalog.archetypes.byId.has(candidateArchetype.archetypeId)) {
    return null;
  }

  const learnedArchetype = await resolveLearnedSelfArchetype({
    supabase: args.supabase,
    userId: args.userId,
    sprites: args.sprites,
    minimumExistingMatches
  });

  if (!learnedArchetype) {
    return null;
  }

  const row = buildLearnedSelfArchetypeCatalogRow({
    userId: args.userId,
    sprites: learnedArchetype.sprites,
    matchCount: minimumExistingMatches + 1,
    catalog: args.catalog
  });

  if (!row) {
    return null;
  }

  const archetypeCatalog = args.supabase.from("archetype_catalog") as {
    upsert(
      value: typeof row,
      options: { onConflict: string }
    ): PromiseLike<{ error: unknown }>;
  };
  const { error } = await archetypeCatalog.upsert(row, {
    onConflict: "id"
  });

  if (error) {
    throw error;
  }

  return {
    ...learnedArchetype,
    matchCount: row.learned_match_count
  };
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
