export type PokemonCatalogSyncSummary = {
  prepared: number;
  pass1Succeeded: number;
  pass1Failed: number;
  pass2Succeeded: number;
  pass2Failed: number;
  syncedAt: string;
};

export function assertUsablePokemonCatalog(summary: {
  speciesCount: number;
  preparedSpeciesCount: number;
}): void;

export function recordUniqueSpeciesSummaries(
  results: unknown[],
  seenNames: Set<string>,
  seenUrls: Set<string>
): void;

export function assertSpeciesPayloadIdentity(summary: unknown, speciesPayload: unknown): void;

export function assertEvolutionStageMapContains(
  stageMap: Map<string, unknown>,
  speciesSlug: string
): void;

export function syncPokemonCatalog(args?: {
  logger?: {
    log: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
}): Promise<PokemonCatalogSyncSummary>;
