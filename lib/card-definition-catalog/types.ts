/** Exact printed regulation field only; presence/absence does not certify reprint legality. */
export type CardRegulationEvidence =
  | { status: "unknown" }
  | { status: "verified_present" | "verified_absent"; scope: "printed_regulation_mark";
    provenance: { provider: "reviewed-printing"; revision: string; sourceCardId: string; sourceUrl: string; scanSha256: string } };

/** Evidence for this printing's rules field, independent of corpus row coverage.
 * Supplied text does not certify that the complete printed Rule Box was captured. */
export type CardRuleEvidence =
  | { status: "unknown" }
  | {
    status: "verified_present";
    scope: "supplied_text" | "printed_rule_box";
    provenance: { provider: "tcgdex" | "pokemontcg-historical" | "reviewed-printing"; revision: string; sourceCardId: string; sourceUrl: string; scanSha256?: string };
  }
  | {
    status: "verified_absent";
    scope: "printed_rule_box";
    provenance: { provider: "reviewed-printing"; revision: string; sourceCardId: string; sourceUrl: string; scanSha256: string };
  };

/** Complete intrinsic printed passive text, separately admitted from Rule Box text.
 * This certifies the text inventory, not modeled effect semantics, format legality
 * or the inventory/effects of attached held items and other cards. */
export type CardPassiveEvidence =
  | { status: "unknown" }
  | {
    status: "verified_complete";
    scope: "printed_passive_inventory";
    abilities: "verified_present" | "verified_absent";
    additionalTraits: "verified_absent";
    provenance: { provider: "reviewed-printing"; revision: string; sourceCardId: string; sourceUrl: string; scanSha256: string };
  };

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
  regulationEvidence?: CardRegulationEvidence;
  /** Preserve explicitly supplied source spelling when a mark is canonicalized. */
  rawRegulationMark?: string;
  /** Exact source discriminator; omitted/null remains unknown. */
  energyType?: "Normal" | "Special" | null;
  /** null means the provider did not supply rules, not that no rules apply. */
  rules: string[] | null;
  /** Missing on older generations means unknown. Never derive absence from null or []. */
  ruleEvidence?: CardRuleEvidence;
  /** Missing metadata remains unknown even when every candidate row was loaded. */
  passiveEvidence?: CardPassiveEvidence;
  /** Intrinsic printed traits outside the Ability field; missing/null is unknown.
   * An empty supplied array alone never establishes exhaustive absence. */
  additionalPassiveTraits?: Array<{ name: string; text: string | null; type: string | null }> | null;
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

export type CardDefinitionSourceCoverage =
  | { scope: "tcgdex-listed-en-physical"; listedPrintings: number; unlistedSets: Array<{setId:string;listed:number;physicalTotal:number|null}> }
  | { scope: "tcgdex-retained-standard-en-physical"; policyVersion: string; upstreamListedPrintings: number; storedPrintings: number; sourceManifestHash?: string;
      currentStandardFormat: string; retainedFormats: string[]; unsupportedFormats: string[]; retainedOn: string; minimumRegulationMark: string;
      unlistedSets: Array<{setId:string;listed:number;physicalTotal:number|null}>;
      countsByFormat: Record<string,{legal:number;unverified:number;olderAliases:number;excluded:number}>;
      unverifiedPrintingsByFormat: Record<string,Record<string,Array<{sourceCardId:string;setId?:string;setReleaseDate:string|null;effectNames:string[]|null}>>>;
      policySources: Array<{sourceUrl:string;inspectedOn:string;standardBans:string[]}> };

export type CardDefinitionCoverage = "complete" | "incomplete" | "stale" | "unavailable";
export type CardPrintingIdentity = Pick<CardDefinition, "source" | "sourceCardId" | "setId" | "localId" | "imageUrl" | "sourceUrl">;
export type CardDefinitionFacts = Pick<CardDefinition, "hp" | "category" | "trainerType" | "stage" | "types" | "evolvesFrom" | "rules" | "abilities" | "attacks" | "additionalPassiveTraits" | "energyType">;
export type CardDefinitionEvidence = {
  coverage: CardDefinitionCoverage;
  generation: string | null;
  /** Agreement is within the provider-listed English physical corpus, not all physical printings. */
  sourceCoverage?: CardDefinitionSourceCoverage;
  candidates: CardDefinition[];
  /** Missing new-family legality metadata, separate from selectable legal rows. */
  unverifiedCandidates?: CardDefinition[];
  /** Independently agreed printed HP; null for any missing or conflicting candidate HP. */
  hp: number | null;
  resolution: "exact" | "functional_agreement" | "ambiguous" | "missing";
  definition: CardDefinition | null;
  candidatePrintingIds?: string[];
  selectedPrinting?: CardPrintingIdentity | null;
  /** A selected representative never establishes which physical printing was played. */
  displayBasis?: "played_evidence" | "representative" | "unavailable";
  agreedFacts?: Partial<CardDefinitionFacts>;
  formatBasis?: { declared: string; status: "applied" | "partial" | "unsupported" | "conflicting"; minimumRegulationMark?: string; declaredMinimumRegulationMark?: string; rotationSourceUrl?: string; rotationDay?: string; rotationAvailableOn?: string; rotationAvailabilitySourceUrl?: string; declaredLatestSetReleaseDate?: string; latestReleaseDate?: string; playedDate?: string; releaseSourceUrl?: string; banEvidence?: { reviewedOn: string; bannedSourceCardIds: readonly string[]; sourceUrl: string; historicalSourceUrl: string; historicalAnnouncementDate: string }; /** Candidates contain eligible logical families; unresolved modern printings remain separate proof blockers. */ legalPrintingIds?: string[]; unverifiedPrintingIds?: string[]; aliasPrintingIds?: string[]; excludedPrintingIds?: string[]; reasons?: Array<{ sourceCardId: string; reason: string }> };
};
export type CardDefinitionEvidenceByName = Record<string, CardDefinitionEvidence>;
export type CardDefinitionQuery = { name: string; setId?: string; localId?: string; effectNames?: string[]; declaredFormat?: string; playedOn?: string };
