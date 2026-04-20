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
  matchedRequiredGroups: number;
  requiredGroupCount: number;
  totalEvidence: number;
};

function compareCandidates(left: CandidateScore, right: CandidateScore) {
  if (left.matchedRequiredGroups !== right.matchedRequiredGroups) {
    return right.matchedRequiredGroups - left.matchedRequiredGroups;
  }

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
    best.matchedRequiredGroups === runnerUp.matchedRequiredGroups &&
    best.totalEvidence === runnerUp.totalEvidence &&
    best.directOverlap === runnerUp.directOverlap &&
    best.ancestorOverlap === runnerUp.ancestorOverlap &&
    best.sprites.length === runnerUp.sprites.length
  );
}

function getAncestorEvidenceCount(args: {
  slug: string;
  evidence: PlayerPokemonEvidence;
  catalog: IdentificationCatalog;
}) {
  const ancestors = args.catalog.pokemon.slugToAncestors.get(args.slug) ?? [];

  return ancestors.reduce(
    (sum, ancestor) => sum + (args.evidence.mentionCounts.get(ancestor) ?? 0),
    0
  );
}

function getRequiredGroupStats(args: {
  requiredMatchGroups: string[][];
  evidence: PlayerPokemonEvidence;
  catalog: IdentificationCatalog;
}) {
  if (args.requiredMatchGroups.length === 0) {
    return {
      matchedGroups: 0,
      requiredGroupCount: 0,
      totalEvidence: 0,
      allMatched: true
    };
  }

  let matchedGroups = 0;
  let totalEvidence = 0;

  args.requiredMatchGroups.forEach((group) => {
    const groupEvidence = group.reduce((sum, slug) => {
      const directCount = args.evidence.mentionCounts.get(slug) ?? 0;
      const ancestorCount = getAncestorEvidenceCount({
        slug,
        evidence: args.evidence,
        catalog: args.catalog
      });

      return sum + directCount + ancestorCount;
    }, 0);

    if (groupEvidence > 0) {
      matchedGroups += 1;
      totalEvidence += groupEvidence;
    }
  });

  return {
    matchedGroups,
    requiredGroupCount: args.requiredMatchGroups.length,
    totalEvidence,
    allMatched: matchedGroups === args.requiredMatchGroups.length
  };
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
    const familyRoot = args.catalog.pokemon.slugToFamilyRoot.get(slug) ?? slug;
    const directCandidateIds = args.catalog.archetypes.spriteToCandidateArchetypes.get(slug) ?? [];
    const familyCandidateIds =
      args.catalog.archetypes.familyRootToCandidateArchetypes.get(familyRoot) ?? [];
    const uniqueDirectCandidateIds = Array.from(new Set([...directCandidateIds, ...familyCandidateIds]));

    if (uniqueDirectCandidateIds.length === 1) {
      const candidate = args.catalog.archetypes.byId.get(uniqueDirectCandidateIds[0]);
      if (candidate) {
        const requiredGroupStats = getRequiredGroupStats({
          requiredMatchGroups: candidate.requiredMatchGroups,
          evidence: args.evidence,
          catalog: args.catalog
        });
        if (!requiredGroupStats.allMatched) {
          continue;
        }

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
        const requiredGroupStats = getRequiredGroupStats({
          requiredMatchGroups: candidate.requiredMatchGroups,
          evidence: args.evidence,
          catalog: args.catalog
        });
        if (!requiredGroupStats.allMatched) {
          continue;
        }

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

    const familyRoot = args.catalog.pokemon.slugToFamilyRoot.get(slug) ?? slug;
    args.catalog.archetypes.familyRootToCandidateArchetypes
      .get(familyRoot)
      ?.forEach((id) => candidateIds.add(id));

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
      const requiredGroupStats = getRequiredGroupStats({
        requiredMatchGroups: candidate.requiredMatchGroups,
        evidence: args.evidence,
        catalog: args.catalog
      });

      if (!requiredGroupStats.allMatched) {
        return null;
      }

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

      if (requiredGroupStats.requiredGroupCount > 0) {
        totalEvidence += requiredGroupStats.matchedGroups * 25 + requiredGroupStats.totalEvidence;
      }

      if (
        !directLabelMatch &&
        directOverlap === 0 &&
        ancestorOverlap === 0 &&
        requiredGroupStats.totalEvidence === 0
      ) {
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
        matchedRequiredGroups: requiredGroupStats.matchedGroups,
        requiredGroupCount: requiredGroupStats.requiredGroupCount,
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
