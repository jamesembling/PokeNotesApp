import { cache } from "react";
import { unstable_cache } from "next/cache";
import { compactMap } from "@/lib/array";
import { buildPokemonNameVariants, normalizeText } from "@/lib/log-import/normalization";
import { CACHE_TAGS } from "@/lib/server/cache";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { createPublicClient } from "@/lib/supabase/public";
import type {
  ArchetypeCatalogRow,
  IdentificationCatalog,
  PokemonCatalogRow
} from "@/lib/log-import/types";

type CachedIdentificationCatalogRows = {
  archetypeRows: ArchetypeCatalogRow[];
  pokemonRows: PokemonCatalogRow[];
};

const IDENTIFICATION_CATALOG_CACHE_VERSION = "v13";

type ArchetypeRowsClient = {
  from(table: "archetype_catalog"): unknown;
};

type ArchetypeRangeBuilder<T> = {
  eq(column: string, value: unknown): ArchetypeRangeBuilder<T>;
  range(from: number, to: number): PromiseLike<{ data: T[] | null; error: unknown }>;
};

type ArchetypeSelectBuilder<T> = {
  select(value: string): ArchetypeRangeBuilder<T>;
};

function archetypeTable<T>(supabase: ArchetypeRowsClient) {
  return supabase.from("archetype_catalog") as ArchetypeSelectBuilder<T>;
}

function parseStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}

function parseStringMatrix(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return compactMap(value, (entry) => {
    const parsedEntry = parseStringArray(entry);
    return parsedEntry.length > 0 ? parsedEntry : null;
  });
}

function includesSpriteOrAncestor(
  group: string[],
  sprite: string,
  pokemonIndex: ReturnType<typeof buildPokemonIndex>
) {
  if (group.includes(sprite)) {
    return true;
  }

  const ancestors = pokemonIndex.slugToAncestors.get(sprite) ?? [];
  return ancestors.some((ancestor) => group.includes(ancestor));
}

function completeRequiredMatchGroups(args: {
  sprites: string[];
  requiredMatchGroups: string[][];
  pokemonIndex: ReturnType<typeof buildPokemonIndex>;
}) {
  if (args.sprites.length < 2 || args.requiredMatchGroups.length === 0) {
    return args.requiredMatchGroups;
  }

  const completedGroups = args.requiredMatchGroups.map((group) => [...group]);

  args.sprites.forEach((sprite) => {
    const isCovered = completedGroups.some((group) =>
      includesSpriteOrAncestor(group, sprite, args.pokemonIndex)
    );

    if (!isCovered) {
      completedGroups.push([sprite, ...(args.pokemonIndex.slugToAncestors.get(sprite) ?? [])]);
    }
  });

  return completedGroups;
}

function buildPokemonIndex(rows: PokemonCatalogRow[]) {
  const bySlug = new Map(rows.map((row) => [row.slug, row]));
  const normalizedNameToSlug = new Map<string, string>();
  const slugToFamilyRoot = new Map<string, string>();
  let maxNameTokens = 1;

  rows.forEach((row) => {
    buildPokemonNameVariants(row).forEach((variant) => {
      if (!normalizedNameToSlug.has(variant)) {
        normalizedNameToSlug.set(variant, row.slug);
      }
      maxNameTokens = Math.max(maxNameTokens, variant.split(" ").filter(Boolean).length);
    });
  });

  const slugToAncestors = new Map<string, string[]>();
  rows.forEach((row) => {
    const ancestors: string[] = [];
    let cursor = row.evolves_from;
    while (cursor) {
      ancestors.push(cursor);
      cursor = bySlug.get(cursor)?.evolves_from ?? null;
    }
    slugToAncestors.set(row.slug, ancestors);
    slugToFamilyRoot.set(row.slug, ancestors[ancestors.length - 1] ?? row.slug);
  });

  return {
    bySlug,
    normalizedNameToSlug,
    slugToAncestors,
    slugToFamilyRoot,
    maxNameTokens
  };
}

function buildArchetypeIndex(rows: ArchetypeCatalogRow[], pokemonIndex: ReturnType<typeof buildPokemonIndex>) {
  const includedRows = compactMap(rows, (row) => {
    if (row.is_excluded) {
      return null;
    }

    const sprites = parseStringArray(row.sprites);
    if (!row.id || !row.label || sprites.length === 0) {
      return null;
    }

    const detectionSprites = parseStringArray(row.detection_sprites);
    return {
      id: row.id,
      canonicalId: row.canonical_id || row.id,
      label: row.label,
      sprites,
      detectionSprites: detectionSprites.length > 0 ? detectionSprites : sprites,
      requiredMatchGroups: completeRequiredMatchGroups({
        sprites,
        requiredMatchGroups: parseStringMatrix(row.required_match_groups),
        pokemonIndex
      })
    };
  });

  const byId = new Map(includedRows.map((row) => [row.canonicalId, row]));
  const normalizedLabelToIds = new Map<string, string[]>();
  const spriteToCandidateArchetypes = new Map<string, string[]>();
  const familyRootToCandidateArchetypes = new Map<string, string[]>();

  includedRows.forEach((row) => {
    const labelKey = normalizeText(row.label);
    const idsForLabel = normalizedLabelToIds.get(labelKey) ?? [];
    idsForLabel.push(row.canonicalId);
    normalizedLabelToIds.set(labelKey, idsForLabel);

    row.detectionSprites.forEach((sprite) => {
      const candidateIds = spriteToCandidateArchetypes.get(sprite) ?? [];
      candidateIds.push(row.canonicalId);
      spriteToCandidateArchetypes.set(sprite, candidateIds);

      const familyRoot = pokemonIndex.slugToFamilyRoot.get(sprite) ?? sprite;
      const familyCandidateIds = familyRootToCandidateArchetypes.get(familyRoot) ?? [];
      familyCandidateIds.push(row.canonicalId);
      familyRootToCandidateArchetypes.set(familyRoot, familyCandidateIds);
    });
  });

  return {
    byId,
    normalizedLabelToIds,
    spriteToCandidateArchetypes,
    familyRootToCandidateArchetypes
  };
}

function normalizeArchetypeRows(rows: ArchetypeCatalogRow[]) {
  return rows.map((row) => ({
    ...row,
    canonical_id: row.canonical_id ?? null,
    source: row.source ?? "curated",
    user_id: row.user_id ?? null,
    learned_match_count: row.learned_match_count ?? 0
  })) as ArchetypeCatalogRow[];
}

async function loadArchetypeRows(supabase: ArchetypeRowsClient) {
  try {
    const rows = await fetchAllRows<ArchetypeCatalogRow>((from, to) =>
      archetypeTable<ArchetypeCatalogRow>(supabase)
        .select("id,canonical_id,label,sprites,detection_sprites,required_match_groups,is_excluded,source,user_id,learned_match_count")
        .eq("is_excluded", false)
        .range(from, to)
    );

    return normalizeArchetypeRows(rows);
  } catch (fullSchemaError) {
    try {
      const rows = await fetchAllRows<
        Omit<ArchetypeCatalogRow, "required_match_groups"> & { required_match_groups?: unknown }
      >((from, to) =>
        archetypeTable<
          Omit<ArchetypeCatalogRow, "required_match_groups"> & { required_match_groups?: unknown }
        >(supabase)
          .select("id,label,sprites,detection_sprites,is_excluded")
          .eq("is_excluded", false)
          .range(from, to)
      );

      return normalizeArchetypeRows(rows.map((row) => ({
        ...row,
        required_match_groups: []
      })) as ArchetypeCatalogRow[]);
    } catch (detectionSchemaError) {
      try {
        const rows = await fetchAllRows<
          Omit<ArchetypeCatalogRow, "detection_sprites" | "required_match_groups"> & {
            detection_sprites?: unknown;
            required_match_groups?: unknown;
          }
        >((from, to) =>
          archetypeTable<
            Omit<ArchetypeCatalogRow, "detection_sprites" | "required_match_groups"> & {
              detection_sprites?: unknown;
              required_match_groups?: unknown;
            }
          >(supabase)
            .select("id,label,sprites,is_excluded")
            .eq("is_excluded", false)
            .range(from, to)
        );

        return normalizeArchetypeRows(rows.map((row) => ({
          ...row,
          detection_sprites: row.sprites,
          required_match_groups: []
        })) as ArchetypeCatalogRow[]);
      } catch {
        throw fullSchemaError instanceof Error
          ? fullSchemaError
          : detectionSchemaError instanceof Error
            ? detectionSchemaError
            : new Error("Failed to load archetype catalog rows.");
      }
    }
  }
}

export async function loadLearnedArchetypeRows(args: {
  supabase: ArchetypeRowsClient;
  userId: string;
}) {
  const normalizedUserId = String(args.userId || "").trim();
  if (!normalizedUserId) {
    return [];
  }

  try {
    const rows = await fetchAllRows<ArchetypeCatalogRow>((from, to) =>
      archetypeTable<ArchetypeCatalogRow>(args.supabase)
        .select("id,canonical_id,label,sprites,detection_sprites,required_match_groups,is_excluded,source,user_id,learned_match_count")
        .eq("is_excluded", false)
        .eq("source", "learned")
        .eq("user_id", normalizedUserId)
        .range(from, to)
    );

    return normalizeArchetypeRows(rows);
  } catch {
    return [];
  }
}

const loadIdentificationCatalogCached = unstable_cache(
  async (): Promise<CachedIdentificationCatalogRows> => {
    const supabase = createPublicClient();
    const [pokemonRows, archetypeRows] = await Promise.all([
      fetchAllRows<PokemonCatalogRow>((from, to) =>
        supabase
          .from("pokemon_catalog")
          .select("slug,label,evolves_from,sprite_url,name_de,name_es,name_fr,name_it,name_pt_br")
          .range(from, to)
      ),
      loadArchetypeRows(supabase)
    ]);

    return {
      pokemonRows: (pokemonRows ?? []) as PokemonCatalogRow[],
      archetypeRows: (archetypeRows ?? []) as ArchetypeCatalogRow[]
    };
  },
  ["identification-catalog", IDENTIFICATION_CATALOG_CACHE_VERSION],
  {
    revalidate: 60 * 60,
    tags: [CACHE_TAGS.identificationCatalog]
  }
);

const loadBuiltIdentificationCatalog = cache(async (): Promise<IdentificationCatalog> => {
  const { pokemonRows, archetypeRows } = await loadIdentificationCatalogCached();
  const pokemon = buildPokemonIndex(pokemonRows);

  return {
    pokemon,
    archetypes: buildArchetypeIndex(archetypeRows, pokemon)
  };
});

export async function loadIdentificationCatalog(args?: {
  learnedArchetypeRows?: ArchetypeCatalogRow[];
  supabase?: ArchetypeRowsClient;
  userId?: string;
}): Promise<IdentificationCatalog> {
  if (!args?.learnedArchetypeRows && (!args?.supabase || !args.userId)) {
    return loadBuiltIdentificationCatalog();
  }

  const [{ pokemonRows, archetypeRows }, learnedArchetypeRows] = await Promise.all([
    loadIdentificationCatalogCached(),
    args.learnedArchetypeRows
      ? Promise.resolve(args.learnedArchetypeRows)
      : loadLearnedArchetypeRows({
          supabase: args.supabase!,
          userId: args.userId!
        })
  ]);
  const pokemon = buildPokemonIndex(pokemonRows);
  const curatedCanonicalIds = new Set(
    archetypeRows.map((row) => String(row.canonical_id || row.id || "").trim()).filter(Boolean)
  );
  const nonCollidingLearnedRows = learnedArchetypeRows.filter(
    (row) => !curatedCanonicalIds.has(String(row.canonical_id || row.id || "").trim())
  );

  return {
    pokemon,
    archetypes: buildArchetypeIndex([...archetypeRows, ...nonCollidingLearnedRows], pokemon)
  };
}
