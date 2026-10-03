import { normalizeText } from "@/lib/log-import/normalization";
import { normalizeLimitlessSetCode } from "@/lib/deck-lists/limitless";
import { buildCardDefinitionIndex, resolveCardDefinition } from "@/lib/card-definition-catalog/resolve";
import type { CardDefinitionEvidence, CardDefinitionEvidenceByName } from "@/lib/card-definition-catalog/types";
import type { DeckCard } from "@/types/index";

export type ReplayLinkedCardDefinitions = Record<string, CardDefinitionEvidence & { evidenceBasis: "linked_deck_list" }>;
const collector = (number: string) => number.trim().toUpperCase().replace(/^0+(?=\d)/, "");
const energyTypes: Record<string, string> = { G: "Grass", R: "Fire", W: "Water", L: "Lightning", P: "Psychic", F: "Fighting", D: "Darkness", M: "Metal", Y: "Fairy", N: "Dragon", C: "Colorless" };
const inventoryName = (name: string) => normalizeText(name.replace(/^Basic\s*\{([GRWLPFDMYNC])\}\s*Energy$/i,
  (_match, symbol: string) => `Basic ${energyTypes[symbol.toUpperCase()]} Energy`));

/** An association can narrow printings only while it agrees with independently
 * recorded owner inventory. A single missing name vetoes the entire list. */
export function getReplayLinkedDeckListCompatibility(
  cards: readonly Pick<DeckCard, "name" | "set" | "number" | "count">[],
  observedOwnerCardNames: readonly string[],
  observedOwnerCardCounts?: Readonly<Record<string, number>>,
): { status: "compatible" | "conflicting" | "unavailable"; missingNames: string[] } {
  if (!cards.length || cards.some((card) => typeof card.name !== "string" || typeof card.set !== "string" || typeof card.number !== "string"
    || !Number.isSafeInteger(card.count) || card.count < 1 || card.count > 60) || cards.reduce((total, card) => total + card.count, 0) !== 60) {
    return { status: "unavailable", missingNames: [] };
  }
  const listed = new Map<string, number>();
  for (const card of cards) listed.set(inventoryName(card.name), (listed.get(inventoryName(card.name)) ?? 0) + card.count);
  const missing = observedOwnerCardNames.filter((name) => !listed.has(inventoryName(name)));
  for (const [name, count] of Object.entries(observedOwnerCardCounts ?? {})) {
    if (!Number.isSafeInteger(count) || count < 0) return { status: "unavailable", missingNames: [] };
    if (count > (listed.get(inventoryName(name)) ?? 0)) missing.push(name);
  }
  const missingNames = [...new Set(missing)].sort();
  return { status: missingNames.length ? "conflicting" : "compatible", missingNames };
}

/** A user-selected live Deck List is association evidence, not an immutable game
 * snapshot. Restrict only the owner's cards, retain every listed same-name print,
 * and never let missing mappings or a mismatched list silently become certainty. */
export function getLinkedReplayDefinitions(
  cards: readonly Pick<DeckCard, "name" | "set" | "number" | "count">[],
  definitions: CardDefinitionEvidenceByName,
  officialCodesBySetId: Readonly<Record<string, string>>,
  declaredFormat?: string,
): ReplayLinkedCardDefinitions {
  const inventory = new Map<string, typeof cards[number][]>();
  for (const card of cards) {
    const name = inventoryName(card.name);
    const prints = inventory.get(name) ?? [];
    prints.push(card);
    inventory.set(name, prints);
  }
  return Object.fromEntries(Object.entries(definitions).map(([name, found]) => {
    const formatted = declaredFormat ? resolveCardDefinition(buildCardDefinitionIndex(found.candidates), { name, declaredFormat }, found.coverage, found.generation, found.sourceCoverage) : found;
    const listed = inventory.get(inventoryName(name)) ?? [];
    let complete = listed.length > 0;
    const ids = new Set<string>();
    for (const print of listed) {
      if (typeof print.set !== "string" || typeof print.number !== "string" || !Number.isSafeInteger(print.count) || print.count < 1 || print.count > 60) { complete = false; continue; }
      const matching = found.candidates.filter((candidate) => {
        const code = officialCodesBySetId[candidate.setId];
        return typeof code === "string" && normalizeLimitlessSetCode(code) === normalizeLimitlessSetCode(print.set)
          && collector(candidate.localId) === collector(print.number);
      });
      if (!matching.length) complete = false;
      matching.forEach((candidate) => ids.add(candidate.sourceCardId));
    }
    const candidates = found.candidates.filter((candidate) => ids.has(candidate.sourceCardId));
    // Association evidence names physical printings before format inference.
    // Keep them as probable choices even when the saved format disagrees.
    const resolved = resolveCardDefinition(buildCardDefinitionIndex(candidates), { name }, complete ? found.coverage : "incomplete", found.generation, found.sourceCoverage);
    const formattedIds = new Set(formatted.candidates.map((candidate) => candidate.sourceCardId));
    const conflict = candidates.some((candidate) => !formattedIds.has(candidate.sourceCardId));
    return [name, { ...resolved, ...(formatted.formatBasis ? { formatBasis: { ...formatted.formatBasis,
      ...(conflict ? { status: "conflicting" as const } : {}) } } : {}), evidenceBasis: "linked_deck_list" as const }];
  }));
}
