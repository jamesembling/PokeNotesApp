import type {
  ArchetypeIdentification,
  DeckSpriteSelection,
  IdentificationCatalog,
  PlayerPokemonEvidence
} from "@/lib/log-import/types";

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

  const strongestSlugs = Array.from(args.evidence.mentionCounts.entries())
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }

      return left[0].localeCompare(right[0]);
    })
    .map(([slug]) => slug)
    .slice(0, 2);

  return {
    slugs: strongestSlugs.filter((slug) => args.catalog.pokemon.bySlug.has(slug)),
    confidence: strongestSlugs.length > 0 ? 10 : 0
  };
}
