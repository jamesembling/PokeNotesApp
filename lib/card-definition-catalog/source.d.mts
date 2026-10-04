import type { CardDefinition } from "./types";
export function normalizeCardDefinitionName(value: unknown): string;
export function normalizeTcgdexCard(card: unknown, set: unknown, syncedAt: string): CardDefinition;
export function isCardDefinition(card: unknown): card is CardDefinition;
export function isCardRuleEvidence(card: unknown): boolean;
export function isCardPassiveEvidence(card: unknown): boolean;
export function isProducedCardDefinition(card: unknown): card is CardDefinition;
