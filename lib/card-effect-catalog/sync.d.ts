export type CardEffectCatalogSyncSummary = {
  cards: number;
  prepared: number;
  setId: string | null;
  syncedAt: string;
};

export function assertUsableCardCatalog(summary: {
  cardCount: number;
  expectedCardCount: number | null;
  prepared: number;
}): void;

export function recordUniqueCardIds(cards: unknown[], seenCardIds: Set<string>): void;

export function normalizeCardCatalogSetId(value: unknown): string | null;

export function syncCardEffectCatalog(args?: {
  logger?: {
    log: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
  setId?: string;
}): Promise<CardEffectCatalogSyncSummary>;
