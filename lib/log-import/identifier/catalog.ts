import { createClient } from "@/lib/supabase/server";
import { buildPokemonNameVariants, normalizeText } from "@/lib/log-import/normalization";
import type {
  ArchetypeCatalogRow,
  IdentificationCatalog,
  PokemonCatalogRow
} from "@/lib/log-import/types";

function parseStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}

function buildPokemonIndex(rows: PokemonCatalogRow[]) {
  const bySlug = new Map(rows.map((row) => [row.slug, row]));
  const normalizedNameToSlug = new Map<string, string>();
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
  });

  return {
    bySlug,
    normalizedNameToSlug,
    slugToAncestors,
    maxNameTokens
  };
}

function buildArchetypeIndex(rows: ArchetypeCatalogRow[]) {
  const includedRows = rows
    .filter((row) => !row.is_excluded)
    .map((row) => ({
      id: row.id,
      label: row.label,
      sprites: parseStringArray(row.sprites),
      detectionSprites: parseStringArray(row.detection_sprites)
    }))
    .map((row) => ({
      ...row,
      detectionSprites: row.detectionSprites.length > 0 ? row.detectionSprites : row.sprites
    }))
    .filter((row) => row.id && row.label && row.sprites.length > 0);

  const byId = new Map(includedRows.map((row) => [row.id, row]));
  const normalizedLabelToIds = new Map<string, string[]>();
  const spriteToCandidateArchetypes = new Map<string, string[]>();

  includedRows.forEach((row) => {
    const labelKey = normalizeText(row.label);
    const idsForLabel = normalizedLabelToIds.get(labelKey) ?? [];
    idsForLabel.push(row.id);
    normalizedLabelToIds.set(labelKey, idsForLabel);

    row.detectionSprites.forEach((sprite) => {
      const candidateIds = spriteToCandidateArchetypes.get(sprite) ?? [];
      candidateIds.push(row.id);
      spriteToCandidateArchetypes.set(sprite, candidateIds);
    });
  });

  return {
    byId,
    normalizedLabelToIds,
    spriteToCandidateArchetypes
  };
}

export async function loadIdentificationCatalog(): Promise<IdentificationCatalog> {
  const supabase = createClient();
  const [{ data: pokemonRows, error: pokemonError }, archetypeResult] = await Promise.all([
    supabase
      .from("pokemon_catalog")
      .select("slug,label,evolves_from,sprite_url,name_de,name_es,name_fr,name_it,name_pt_br"),
    supabase
      .from("archetype_catalog")
      .select("id,label,sprites,detection_sprites,is_excluded")
      .eq("is_excluded", false)
  ]);

  let archetypeRows = archetypeResult.data;
  let archetypeError = archetypeResult.error;

  if (archetypeError && /detection_sprites/i.test(archetypeError.message)) {
    const fallbackResult = await supabase
      .from("archetype_catalog")
      .select("id,label,sprites,is_excluded")
      .eq("is_excluded", false);

    archetypeRows = (fallbackResult.data ?? []).map((row) => ({
      ...row,
      detection_sprites: row.sprites
    }));
    archetypeError = fallbackResult.error;
  }

  if (pokemonError) {
    throw pokemonError;
  }

  if (archetypeError) {
    throw archetypeError;
  }

  return {
    pokemon: buildPokemonIndex((pokemonRows ?? []) as PokemonCatalogRow[]),
    archetypes: buildArchetypeIndex((archetypeRows ?? []) as ArchetypeCatalogRow[])
  };
}
