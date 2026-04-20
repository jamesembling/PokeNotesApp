export type PokemonCatalogSyncSummary = {
  prepared: number;
  pass1Succeeded: number;
  pass1Failed: number;
  pass2Succeeded: number;
  pass2Failed: number;
  syncedAt: string;
};

export function syncPokemonCatalog(args?: {
  logger?: {
    log: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
}): Promise<PokemonCatalogSyncSummary>;
