import type { CardDefinition } from "./types";
export function normalizeCardDefinitionName(value: unknown): string;
export function normalizeTcgdexCard(card: unknown, set: unknown, syncedAt: string): CardDefinition;
export function isCardDefinition(card: unknown): card is CardDefinition;
