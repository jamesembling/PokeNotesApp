import type {
  ArchetypeIdentification,
  DeckSpriteSelection,
  IdentificationCatalog,
  PlayerPokemonEvidence
} from "@/lib/log-import/types";

function getFamilyKey(slug: string, catalog: IdentificationCatalog) {
  const ancestors = catalog.pokemon.slugToAncestors.get(slug) ?? [];
  return ancestors[ancestors.length - 1] ?? slug;
}

function getEvolutionDepth(slug: string, catalog: IdentificationCatalog) {
  return (catalog.pokemon.slugToAncestors.get(slug) ?? []).length;
}

export function selectDeckSprites(args: {
  archetype: ArchetypeIdentification;
  evidence: PlayerPokemonEvidence;
  catalog: IdentificationCatalog;
}): DeckSpriteSelection {
  if (args.archetype && args.archetype.confidence >= 40) {
    return {
      slugs: args.archetype.sprites,
      confidence: args.archetype.confidence
    };
  }

  const groupedFamilies = new Map<
    string,
    {
      totalCount: number;
      representativeSlug: string;
      representativeCount: number;
      representativeDepth: number;
    }
  >();

  Array.from(args.evidence.mentionCounts.entries()).forEach(([slug, count]) => {
    if (!args.catalog.pokemon.bySlug.has(slug)) {
      return;
    }

    const familyKey = getFamilyKey(slug, args.catalog);
    const depth = getEvolutionDepth(slug, args.catalog);
    const existing = groupedFamilies.get(familyKey);

    if (!existing) {
      groupedFamilies.set(familyKey, {
        totalCount: count,
        representativeSlug: slug,
        representativeCount: count,
        representativeDepth: depth
      });
      return;
    }

    existing.totalCount += count;

    const shouldReplaceRepresentative =
      depth > existing.representativeDepth ||
      (depth === existing.representativeDepth && count > existing.representativeCount) ||
      (depth === existing.representativeDepth &&
        count === existing.representativeCount &&
        slug.localeCompare(existing.representativeSlug) < 0);

    if (shouldReplaceRepresentative) {
      existing.representativeSlug = slug;
      existing.representativeCount = count;
      existing.representativeDepth = depth;
    }
  });

  const strongestSlugs = Array.from(groupedFamilies.values())
    .sort((left, right) => {
      if (right.totalCount !== left.totalCount) {
        return right.totalCount - left.totalCount;
      }

      if (right.representativeDepth !== left.representativeDepth) {
        return right.representativeDepth - left.representativeDepth;
      }

      if (right.representativeCount !== left.representativeCount) {
        return right.representativeCount - left.representativeCount;
      }

      return left.representativeSlug.localeCompare(right.representativeSlug);
    })
    .map((entry) => entry.representativeSlug)
    .slice(0, 2);

  return {
    slugs: strongestSlugs,
    confidence: strongestSlugs.length > 0 ? 10 : 0
  };
}
