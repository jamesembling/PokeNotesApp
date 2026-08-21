import { parseBattleLog } from "@/lib/log-import/parser";
import type { IdentificationCatalog } from "@/lib/log-import/types";

const emptyCatalog: IdentificationCatalog = {
  pokemon: {
    bySlug: new Map(),
    normalizedNameToSlug: new Map(),
    slugToAncestors: new Map(),
    slugToFamilyRoot: new Map(),
    maxNameTokens: 0,
  },
  archetypes: {
    byId: new Map(),
    normalizedLabelToIds: new Map(),
    spriteToCandidateArchetypes: new Map(),
    familyRootToCandidateArchetypes: new Map(),
  },
};

export function buildLocalE2EBattleLogFixture({
  ptcglUsername,
  rawLog,
}: {
  ptcglUsername: string;
  rawLog: string;
}) {
  const parsed = parseBattleLog({
    catalog: emptyCatalog,
    ptcglUsername,
    rawLog,
  });

  return {
    ...parsed.stats,
    opponentPlayerName: parsed.players.opponentPlayerName,
    rawLog: parsed.rawLog,
    sections: parsed.sections,
    selfPlayerName: parsed.players.selfPlayerName,
  };
}
