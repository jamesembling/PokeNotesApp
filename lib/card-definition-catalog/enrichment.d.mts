import type { CardDefinition } from "./types";
export const HISTORICAL_REVISION: string;
export function needsEffectEnrichment(card: CardDefinition): boolean;
export function needsRuleEnrichment(card: CardDefinition): boolean;
export function applyHistoricalEffectEnrichment(card: CardDefinition, secondary: unknown, set: unknown): CardDefinition;
export function applyReviewedPrintingEffects(card: CardDefinition): CardDefinition;
export function createHistoricalEffectEnricher(): Promise<(card: CardDefinition) => Promise<CardDefinition>>;
