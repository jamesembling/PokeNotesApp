import { createBattleLogEffectEvidenceResolver, extractUsedEffectCandidate, type CardEffectLookupRow } from "@/lib/battle-log/effect-catalog";
import { buildCardDefinitionIndex, definitionEffectRows, resolveCardDefinition } from "@/lib/card-definition-catalog/resolve";
import type { CardDefinitionEvidence, CardDefinitionQuery } from "@/lib/card-definition-catalog/types";
import { normalizeText } from "@/lib/log-import/normalization";
import { resolveReplayEffectConstraint } from "./effect-targets";

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
  const usedEvidence = new Map<string, CardDefinitionEvidence>();
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
      usedEvidence.set(key, resolved);
    }
    return resolver;
  };
  return {
    tag: (title: string) => forTitle(title).tag(title),
    origin: (title: string, detail?: string) => {
      const used = extractUsedEffectCandidate(title);
      const entry = used && entries.get(used.cardName);
      const kind = forTitle(title).tag(title);
      // Legacy text can retain its existing origin evidence, but only contextual
      // definition agreement supplies the new complete movement recipes.
      if (used && entry && (kind === "attack" || kind === "ability")) {
        const resolved = usedEvidence.get(`${used.cardName}\u0000${used.effectName}`);
        const operations = detail === undefined ? ["discard_cards", "evolve"] as const
          : /\bevolved\b/i.test(detail) ? ["evolve"] as const : /\bdiscarded\b/i.test(detail) ? ["discard_cards"] as const : [];
        for (const operation of operations) {
          const plan = resolveReplayEffectConstraint(resolved, used.effectName, kind, operation);
          if (plan.status === "known" && (plan.operation === "discard_cards" || plan.operation === "evolve")) return plan.origin;
        }
      }
      return forTitle(title).origin(title, detail);
    },
  };
}
