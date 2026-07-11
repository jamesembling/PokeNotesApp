export type CardEffectCatalogSyncSummary = {
  cards: number;
  prepared: number;
  syncedAt: string;
};

export function assertUsableCardCatalog(summary: {
  cardCount: number;
  expectedCardCount: number | null;
  prepared: number;
}): void;

export function recordUniqueCardIds(cards: unknown[], seenCardIds: Set<string>): void;

export function syncCardEffectCatalog(args?: {
  logger?: {
    log: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
}): Promise<CardEffectCatalogSyncSummary>;
