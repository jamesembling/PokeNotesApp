import { normalizeText } from "@/lib/log-import/normalization";
import type {
  ArchetypeIdentification,
  IdentificationCatalog,
  PlayerPokemonEvidence
} from "@/lib/log-import/types";

type CandidateScore = {
  archetypeId: string;
  label: string;
  sprites: string[];
  confidence: number;
  directLabelMatch: boolean;
  directOverlap: number;
  ancestorOverlap: number;
  totalEvidence: number;
};

function compareCandidates(left: CandidateScore, right: CandidateScore) {
  if (left.directLabelMatch !== right.directLabelMatch) {
    return left.directLabelMatch ? -1 : 1;
  }

  if (left.totalEvidence !== right.totalEvidence) {
    return right.totalEvidence - left.totalEvidence;
  }

  if (left.directOverlap !== right.directOverlap) {
    return right.directOverlap - left.directOverlap;
  }

  if (left.ancestorOverlap !== right.ancestorOverlap) {
    return right.ancestorOverlap - left.ancestorOverlap;
  }

  if (left.sprites.length !== right.sprites.length) {
    return left.sprites.length - right.sprites.length;
  }

  return left.archetypeId.localeCompare(right.archetypeId);
}

function hasAmbiguousTopMatch(best: CandidateScore, runnerUp: CandidateScore | undefined) {
  if (!runnerUp) {
    return false;
  }

  return (
    best.directLabelMatch === runnerUp.directLabelMatch &&
    best.totalEvidence === runnerUp.totalEvidence &&
    best.directOverlap === runnerUp.directOverlap &&
    best.ancestorOverlap === runnerUp.ancestorOverlap &&
    best.sprites.length === runnerUp.sprites.length
  );
}

function resolveUniqueAnchorCandidate(args: {
  evidence: PlayerPokemonEvidence;
  catalog: IdentificationCatalog;
}) {
  const rankedEvidence = Array.from(args.evidence.mentionCounts.entries()).sort((left, right) => {
    if (right[1] !== left[1]) {
      return right[1] - left[1];
    }

    return left[0].localeCompare(right[0]);
  });

  for (const [slug, count] of rankedEvidence) {
    const directCandidateIds = args.catalog.archetypes.spriteToCandidateArchetypes.get(slug) ?? [];
    const uniqueDirectCandidateIds = Array.from(new Set(directCandidateIds));

    if (uniqueDirectCandidateIds.length === 1) {
      const candidate = args.catalog.archetypes.byId.get(uniqueDirectCandidateIds[0]);
      if (candidate) {
        return {
          archetypeId: candidate.id,
          label: candidate.label,
          sprites: candidate.sprites,
          confidence: 12 + count
        } satisfies NonNullable<ArchetypeIdentification>;
      }
    }

    const ancestorCandidates = new Set<string>();
    (args.catalog.pokemon.slugToAncestors.get(slug) ?? []).forEach((ancestorSlug) => {
      (args.catalog.archetypes.spriteToCandidateArchetypes.get(ancestorSlug) ?? []).forEach((id) =>
        ancestorCandidates.add(id)
      );
    });

    if (ancestorCandidates.size === 1) {
      const candidateId = Array.from(ancestorCandidates)[0];
      const candidate = args.catalog.archetypes.byId.get(candidateId);
      if (candidate) {
        return {
          archetypeId: candidate.id,
          label: candidate.label,
          sprites: candidate.sprites,
          confidence: 8 + count
        } satisfies NonNullable<ArchetypeIdentification>;
      }
    }
  }

  return null;
}

export function identifyLikelyArchetype(args: {
  evidence: PlayerPokemonEvidence;
  catalog: IdentificationCatalog;
}): ArchetypeIdentification {
  const candidateIds = new Set<string>();

  args.evidence.mentionCounts.forEach((_count, slug) => {
    candidateIds.add(slug);
    args.catalog.archetypes.spriteToCandidateArchetypes.get(slug)?.forEach((id) => candidateIds.add(id));

    const ancestors = args.catalog.pokemon.slugToAncestors.get(slug) ?? [];
    ancestors.forEach((ancestorSlug) => {
      args.catalog.archetypes.spriteToCandidateArchetypes
        .get(ancestorSlug)
        ?.forEach((id) => candidateIds.add(id));
    });
  });

  args.catalog.archetypes.normalizedLabelToIds.forEach((ids, labelKey) => {
    if (labelKey && args.evidence.normalizedText.includes(labelKey)) {
      ids.forEach((id) => candidateIds.add(id));
    }
  });

  const scoredCandidates = Array.from(candidateIds)
    .map((candidateId) => args.catalog.archetypes.byId.get(candidateId))
    .filter(
      (
        candidate
      ): candidate is NonNullable<
        ReturnType<typeof args.catalog.archetypes.byId.get>
      > => Boolean(candidate)
    )
    .map((candidate) => {
      const normalizedLabel = normalizeText(candidate.label);
      const directLabelMatch =
        normalizedLabel.length > 0 && args.evidence.normalizedText.includes(normalizedLabel);

      let directOverlap = 0;
      let ancestorOverlap = 0;
      let totalEvidence = directLabelMatch ? 100 : 0;

      candidate.sprites.forEach((sprite) => {
        const directCount = args.evidence.mentionCounts.get(sprite) ?? 0;
        if (directCount > 0) {
          directOverlap += 1;
          totalEvidence += 20 + directCount;
          return;
        }

        const ancestors = args.catalog.pokemon.slugToAncestors.get(sprite) ?? [];
        const ancestorCount = ancestors.reduce(
          (sum, ancestor) => sum + (args.evidence.mentionCounts.get(ancestor) ?? 0),
          0
        );

        if (ancestorCount > 0) {
          ancestorOverlap += 1;
          totalEvidence += 6 + ancestorCount;
        }
      });

      if (!directLabelMatch && directOverlap === 0 && ancestorOverlap === 0) {
        return null;
      }

      return {
        archetypeId: candidate.id,
        label: candidate.label,
        sprites: candidate.sprites,
        confidence: totalEvidence,
        directLabelMatch,
        directOverlap,
        ancestorOverlap,
        totalEvidence
      } satisfies CandidateScore;
    })
    .filter((candidate): candidate is CandidateScore => candidate !== null)
    .sort(compareCandidates);

  const best = scoredCandidates[0];
  if (!best || hasAmbiguousTopMatch(best, scoredCandidates[1])) {
    return resolveUniqueAnchorCandidate(args);
  }

  return {
    archetypeId: best.archetypeId,
    label: best.label,
    sprites: best.sprites,
    confidence: best.confidence
  };
}
