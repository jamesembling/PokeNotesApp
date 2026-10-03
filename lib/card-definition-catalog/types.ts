/** Public card metadata only. Artwork is deliberately outside this evidence contract. */
export type CardDefinition = {
  source: "tcgdex";
  sourceCardId: string;
  name: string;
  setId: string;
  localId: string;
  setReleaseDate: string | null;
  hp: number | null;
  category: "Pokemon" | "Trainer" | "Energy";
  trainerType: string | null;
  stage: string | null;
  types: string[] | null;
  evolvesFrom: string | null;
  regulationMark: string | null;
  /** null means the provider did not supply rules, not that no rules apply. */
  rules: string[] | null;
  abilities: Array<{ name: string; text: string | null; type: string | null }>;
  attacks: Array<{ name: string; text: string | null; damage: string | null; cost: string[] | null }>;
  /** Only supplemental fields use this source; printing identity remains TCGdex. */
  effectProvenance?: {
    provider: "pokemontcg-historical" | "reviewed-printing";
    revision: string;
    sourceCardId: string;
    sourceUrl: string;
    fields: Array<"abilities" | "attacks" | "trainerType" | "rules">;
    reviewUrl?: string;
  };
  /** Optional representative artwork only; never evidence of the played printing. */
  imageUrl?: string;
  sourceUrl: string;
  sourceUpdatedAt: string | null;
  syncedAt: string;
};

export type CardDefinitionCoverage = "complete" | "incomplete" | "stale" | "unavailable";
export type CardDefinitionEvidence = {
  coverage: CardDefinitionCoverage;
  generation: string | null;
  /** Agreement is within the provider-listed English physical corpus, not all physical printings. */
  sourceCoverage?: { scope: "tcgdex-listed-en-physical"; listedPrintings: number; unlistedSets: Array<{ setId: string; listed: number; physicalTotal: number | null }> };
  candidates: CardDefinition[];
  /** Independently agreed printed HP; null for any missing or conflicting candidate HP. */
  hp: number | null;
  resolution: "exact" | "functional_agreement" | "ambiguous" | "missing";
  definition: CardDefinition | null;
};
export type CardDefinitionEvidenceByName = Record<string, CardDefinitionEvidence>;
export type CardDefinitionQuery = { name: string; setId?: string; localId?: string; effectNames?: string[] };
