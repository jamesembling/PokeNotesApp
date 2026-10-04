import type { CardDefinition, CardDefinitionEvidence, CardDefinitionQuery, CardDefinitionSourceCoverage } from "./types";
export const CARD_DEFINITION_RETENTION_VERSION: string;
export const RETAINED_SAVED_STANDARD_FORMATS: readonly string[];
export function currentStandardFormat(): string;
export function selectRetainedCardDefinitions(definitions: readonly CardDefinition[], options?: { savedFormats?: readonly string[]; retainedOn?: string; sourceManifestHash?: string; unlistedSets?: Array<{setId:string;listed:number;physicalTotal:number|null}> }): { definitions: CardDefinition[]; sourceCoverage: CardDefinitionSourceCoverage };
export function getCardDefinitionSnapshotCoverage(coverage: CardDefinitionEvidence["sourceCoverage"], playedOn?: string): "complete" | "incomplete";
export function getCardDefinitionScopeCoverage(coverage: CardDefinitionEvidence["sourceCoverage"], name: string, query?: Pick<CardDefinitionQuery,"declaredFormat"|"playedOn"|"effectNames">): "complete" | "incomplete";
