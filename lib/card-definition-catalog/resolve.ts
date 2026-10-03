import { normalizeText } from "@/lib/log-import/normalization";
import type { CardDefinition, CardDefinitionCoverage, CardDefinitionEvidence, CardDefinitionQuery } from "./types";
import type { CardEffectLookupRow } from "@/lib/battle-log/effect-catalog";

type CardDefinitionIndex = Map<string, CardDefinition[]>;

export function buildCardDefinitionIndex(definitions: readonly CardDefinition[]): CardDefinitionIndex {
  const index: CardDefinitionIndex = new Map();
  for (const definition of definitions) {
    const name = normalizeText(definition.name);
    const rows = index.get(name) ?? [];
    rows.push(definition);
    index.set(name, rows);
  }
  return index;
}

function functionalKey(card: CardDefinition) {
  // Compare all supplied game fields, preserving unknowns. Cosmetic printing data is excluded.
  return JSON.stringify([card.hp, card.category, card.trainerType, card.stage, card.types,
    card.evolvesFrom, card.rules, card.abilities, card.attacks]);
}

export function resolveCardDefinition(
  index: CardDefinitionIndex,
  query: CardDefinitionQuery,
  coverage: CardDefinitionCoverage = "complete",
  generation: string | null = null,
  sourceCoverage?: CardDefinitionEvidence["sourceCoverage"]
): CardDefinitionEvidence {
  let candidates = index.get(normalizeText(query.name)) ?? [];
  // IDs are provider identities, never inferred from representative artwork or a name match.
  if (query.setId) candidates = candidates.filter((card) => card.setId === query.setId);
  if (query.localId) candidates = candidates.filter((card) => card.localId.replace(/^0+(?=\d)/, "") === query.localId!.replace(/^0+(?=\d)/, ""));
  if (query.effectNames?.length) {
    const names = query.effectNames.map(normalizeText);
    candidates = candidates.filter((card) => {
      // A missing effect list cannot establish that this printing is excluded.
      if (card.abilities.length + card.attacks.length === 0 || [...card.abilities, ...card.attacks].some((effect) => !effect.name)) return true;
      const effects = new Set([...card.abilities, ...card.attacks].map((effect) => normalizeText(effect.name)));
      return names.every((name) => effects.has(name));
    });
  }
  const usable = coverage === "complete" && candidates.length > 0;
  const hp = usable && candidates[0].hp !== null && candidates.every((card) => card.hp === candidates[0].hp)
    ? candidates[0].hp : null;
  const agrees = usable && candidates.every((card) => functionalKey(card) === functionalKey(candidates[0]));
  const exact = usable && Boolean(query.setId && query.localId) && candidates.length === 1;
  return {
    coverage, generation, sourceCoverage, candidates, hp,
    resolution: !candidates.length ? "missing" : exact ? "exact" : agrees ? "functional_agreement" : "ambiguous",
    definition: exact || agrees ? candidates[0] : null
  };
}

/** Compatibility projection; full text and every candidate are retained for agreement checks. */
export function definitionEffectRows(definitions: readonly CardDefinition[]): CardEffectLookupRow[] {
  return definitions.flatMap((card) => {
    const base = { card_name: card.name, normalized_card_name: normalizeText(card.name) };
    const rows: CardEffectLookupRow[] = [];
    const kind = normalizeText(card.trainerType || "");
    // A candidate with unnamed/missing effects cannot be excluded by an
    // observed effect. Preserve that uncertainty through the legacy projection.
    if (card.category === "Pokemon" && (!card.abilities.length && !card.attacks.length
      || [...card.abilities, ...card.attacks].some((effect) => !effect.name))
      || card.category === "Trainer" && !["item", "supporter", "stadium", "tool"].includes(kind)) {
      rows.push({ ...base, effect_kind: "ability", effect_name: null, normalized_effect_name: "",
        effect_text: null, effect_candidates_incomplete: true });
    }
    if (kind === "item" || kind === "supporter" || kind === "stadium" || kind === "tool") {
      rows.push({ ...base, effect_kind: kind, effect_name: null, normalized_effect_name: "", effect_text: card.rules?.join("\n\n") ?? null });
    }
    for (const ability of card.abilities.filter((effect) => effect.name)) rows.push({ ...base, effect_kind: "ability", effect_name: ability.name, normalized_effect_name: normalizeText(ability.name), effect_text: ability.text });
    for (const attack of card.attacks.filter((effect) => effect.name)) rows.push({ ...base, effect_kind: "attack", effect_name: attack.name, normalized_effect_name: normalizeText(attack.name), effect_text: attack.text });
    return rows;
  });
}
