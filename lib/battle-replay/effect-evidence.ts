import { createBattleLogEffectEvidenceResolver, extractUsedEffectCandidate, type CardEffectLookupRow } from "@/lib/battle-log/effect-catalog";
import { buildCardDefinitionIndex, definitionEffectRows, resolveCardDefinition } from "@/lib/card-definition-catalog/resolve";
import type { CardDefinitionEvidence, CardDefinitionQuery } from "@/lib/card-definition-catalog/types";
import { normalizeText } from "@/lib/log-import/normalization";

/** Route effect evidence is scoped to one literal used effect. Different copies
 * with the same name can have different effects, so their observations must not
 * be intersected or lend each other candidate completeness. */
export function createReplayEffectEvidenceResolver(
  definitions: Readonly<Record<string, CardDefinitionEvidence>>,
  legacyRows: CardEffectLookupRow[],
  context: Pick<CardDefinitionQuery, "declaredFormat" | "playedOn">
) {
  const entries = new Map(Object.entries(definitions).map(([name, evidence]) => [normalizeText(name), {
    evidence, index: buildCardDefinitionIndex(evidence.candidates),
  }]));
  const completeDefinitions = [...entries].flatMap(([name, { evidence, index }]) => {
    const resolved = resolveCardDefinition(index, { name, ...context }, evidence.coverage, evidence.generation, evidence.sourceCoverage);
    return resolved.coverage === "complete" ? resolved.candidates : [];
  });
  // Legacy whole-history rows cannot bypass a contextual catalogue gap.
  const base = createBattleLogEffectEvidenceResolver([
    ...legacyRows.filter((row) => !entries.has(normalizeText(row.normalized_card_name || row.card_name))),
    ...definitionEffectRows(completeDefinitions),
  ]);
  const usedResolvers = new Map<string, ReturnType<typeof createBattleLogEffectEvidenceResolver>>();
  const forTitle = (title: string) => {
    const used = extractUsedEffectCandidate(title);
    const entry = used && entries.get(used.cardName);
    if (!used || !entry) return base;
    const key = `${used.cardName}\u0000${used.effectName}`;
    let resolver = usedResolvers.get(key);
    if (!resolver) {
      const { evidence, index } = entry;
      const resolved = resolveCardDefinition(index, { name: used.cardName, ...context, effectNames: [used.effectName] },
        evidence.coverage, evidence.generation, evidence.sourceCoverage);
      resolver = createBattleLogEffectEvidenceResolver(resolved.coverage === "complete" ? definitionEffectRows(resolved.candidates) : []);
      usedResolvers.set(key, resolver);
    }
    return resolver;
  };
  return {
    tag: (title: string) => forTitle(title).tag(title),
    origin: (title: string, detail?: string) => forTitle(title).origin(title, detail),
  };
}
