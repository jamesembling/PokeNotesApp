import { cache } from "react";
import { unstable_cache } from "next/cache";
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

const IDENTIFICATION_CATALOG_CACHE_VERSION = "v6";

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

  return value
    .map((entry) => parseStringArray(entry))
    .filter((entry) => entry.length > 0);
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
  const includedRows = rows
    .filter((row) => !row.is_excluded)
    .map((row) => ({
      id: row.id,
      label: row.label,
      sprites: parseStringArray(row.sprites),
      detectionSprites: parseStringArray(row.detection_sprites),
      requiredMatchGroups: parseStringMatrix(row.required_match_groups)
    }))
    .map((row) => ({
      ...row,
      detectionSprites: row.detectionSprites.length > 0 ? row.detectionSprites : row.sprites,
      requiredMatchGroups: completeRequiredMatchGroups({
        sprites: row.sprites,
        requiredMatchGroups: row.requiredMatchGroups,
        pokemonIndex
      })
    }))
    .filter((row) => row.id && row.label && row.sprites.length > 0);

  const byId = new Map(includedRows.map((row) => [row.id, row]));
  const normalizedLabelToIds = new Map<string, string[]>();
  const spriteToCandidateArchetypes = new Map<string, string[]>();
  const familyRootToCandidateArchetypes = new Map<string, string[]>();

  includedRows.forEach((row) => {
    const labelKey = normalizeText(row.label);
    const idsForLabel = normalizedLabelToIds.get(labelKey) ?? [];
    idsForLabel.push(row.id);
    normalizedLabelToIds.set(labelKey, idsForLabel);

    row.detectionSprites.forEach((sprite) => {
      const candidateIds = spriteToCandidateArchetypes.get(sprite) ?? [];
      candidateIds.push(row.id);
      spriteToCandidateArchetypes.set(sprite, candidateIds);

      const familyRoot = pokemonIndex.slugToFamilyRoot.get(sprite) ?? sprite;
      const familyCandidateIds = familyRootToCandidateArchetypes.get(familyRoot) ?? [];
      familyCandidateIds.push(row.id);
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

async function loadArchetypeRows(supabase: ReturnType<typeof createPublicClient>) {
  try {
    return await fetchAllRows<ArchetypeCatalogRow>((from, to) =>
      supabase
        .from("archetype_catalog")
        .select("id,label,sprites,detection_sprites,required_match_groups,is_excluded")
        .eq("is_excluded", false)
        .range(from, to)
    );
  } catch (fullSchemaError) {
    try {
      const rows = await fetchAllRows<
        Omit<ArchetypeCatalogRow, "required_match_groups"> & { required_match_groups?: unknown }
      >((from, to) =>
        supabase
          .from("archetype_catalog")
          .select("id,label,sprites,detection_sprites,is_excluded")
          .eq("is_excluded", false)
          .range(from, to)
      );

      return rows.map((row) => ({
        ...row,
        required_match_groups: []
      })) as ArchetypeCatalogRow[];
    } catch (detectionSchemaError) {
      try {
        const rows = await fetchAllRows<
          Omit<ArchetypeCatalogRow, "detection_sprites" | "required_match_groups"> & {
            detection_sprites?: unknown;
            required_match_groups?: unknown;
          }
        >((from, to) =>
          supabase
            .from("archetype_catalog")
            .select("id,label,sprites,is_excluded")
            .eq("is_excluded", false)
            .range(from, to)
        );

        return rows.map((row) => ({
          ...row,
          detection_sprites: row.sprites,
          required_match_groups: []
        })) as ArchetypeCatalogRow[];
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

export async function loadIdentificationCatalog(): Promise<IdentificationCatalog> {
  return loadBuiltIdentificationCatalog();
}
