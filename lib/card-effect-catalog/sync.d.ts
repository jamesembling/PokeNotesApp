export type CardEffectCatalogSyncSummary = {
  cards: number;
  prepared: number;
  syncedAt: string;
};

export function syncCardEffectCatalog(args?: {
  logger?: {
    log: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
}): Promise<CardEffectCatalogSyncSummary>;
