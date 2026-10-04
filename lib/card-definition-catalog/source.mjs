import { isTcgdexRegulationMarkProvenance } from "./tcgdex-regulation.mjs";
import { isCardRegulationEvidenceMetadata, isCardRegulationEvidence } from "./regulation-evidence.mjs";
import { cardDefinitionSourceUrl, isCardRuleEvidence, isCardPassiveEvidence, isCardRuleEvidenceMetadata, isCardPassiveEvidenceMetadata } from "./rule-evidence.mjs";
export { isCardRuleEvidence, isCardPassiveEvidence } from "./rule-evidence.mjs";

/** TCGdex is a community-maintained source, not an official Pokémon rules authority. */
export function normalizeCardDefinitionName(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "'").toLowerCase().replace(/[^a-z0-9'+-]+/g, " ")
    .replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
}
const text = (value) => typeof value === "string" && value.trim() ? value.trim() : null;
const strings = (value) => Array.isArray(value) && value.every((v) => typeof v === "string") ? value : null;
function cardImageUrl(prefix) {
  if (typeof prefix !== "string" || prefix.includes("\\")) return undefined;
  try {
    const url = new URL(prefix);
    if (url.origin !== "https://assets.tcgdex.net" || url.username || url.password || url.search || url.hash
      || !/^\/en\/[^/]+\/[^/]+\/[^/]+$/.test(url.pathname)) return undefined;
    return `${url.href}/high.webp`;
  } catch { return undefined; }
}
export function normalizeTcgdexCard(card, set, syncedAt) {
  const localId = Number.isSafeInteger(card?.localId) && card.localId >= 0 ? String(card.localId) : text(card?.localId);
  if (!card || !text(card.id) || !text(card.name) || !localId || !text(set?.id) || card.set?.id !== set.id || !["Pokemon", "Trainer", "Energy"].includes(card.category)) {
    throw new Error("TCGdex returned an invalid card identity or category.");
  }
  const effects = (items, kind) => {
    if (items === undefined) return [];
    if (!Array.isArray(items) || items.some((item) => !item || typeof item !== "object")) throw new Error(`TCGdex returned malformed ${kind} for ${card.id}.`);
    return items;
  };
  // Preserve explicitly supplied intrinsic trait text; no omitted field becomes [].
  let additionalPassiveTraits;
  if (card.additionalPassiveTraits !== undefined) {
    additionalPassiveTraits = card.additionalPassiveTraits === null ? null
      : effects(card.additionalPassiveTraits, "additional passive traits").map((trait) => ({ name: text(trait.name) ?? "",
        text: text(trait.effect ?? trait.text), type: text(trait.type) }));
  }
  if (card.ancientTrait != null) {
    const trait = card.ancientTrait;
    if (!trait || typeof trait !== "object" || Array.isArray(trait) || trait.effect != null && trait.text != null && trait.effect !== trait.text)
      throw new Error(`TCGdex returned malformed Ancient Trait for ${card.id}.`);
    const captured = [{ name: text(trait.name) ?? "", text: text(trait.effect ?? trait.text), type: "Ancient Trait" }];
    if (additionalPassiveTraits !== undefined && JSON.stringify(additionalPassiveTraits) !== JSON.stringify(captured))
      throw new Error(`TCGdex returned contradictory passive traits for ${card.id}.`);
    additionalPassiveTraits = captured;
  }
  const imageUrl = cardImageUrl(card.image);
  const rules = text(card.effect) ? [card.effect] : strings(card.rules);
  const sourceUrl = cardDefinitionSourceUrl(card.id);
  const rawMark = text(card.regulationMark);
  const regulationMark = rawMark && /^[a-z]$/i.test(rawMark) ? rawMark.toUpperCase() : rawMark;
  return {
    ...(imageUrl ? { imageUrl } : {}),
    source: "tcgdex", sourceCardId: card.id, name: card.name, setId: set.id, localId,
    setReleaseDate: text(set.releaseDate), hp: Number.isSafeInteger(card.hp) && card.hp > 0 ? card.hp : null,
    category: card.category, trainerType: text(card.trainerType), stage: text(card.stage), types: strings(card.types),
    evolvesFrom: text(card.evolveFrom), regulationMark,
    ...(card.regulationMarkProvenance !== undefined ? { regulationMarkProvenance: card.regulationMarkProvenance } : {}),
    ...(rawMark && rawMark !== regulationMark ? { rawRegulationMark: rawMark } : {}),
    ...(card.category === "Energy" && card.energyType !== undefined ? { energyType: card.energyType } : {}),
    // Trainer/Energy effect is supplied verbatim. Generic ex/ACE SPEC rules are NOT fabricated.
    rules,
    ...(card.category === "Pokemon" && rules?.length && rules.every((rule) => text(rule)) ? {
      ruleEvidence: { status: "verified_present", scope: "supplied_text", provenance: { provider: "tcgdex", revision: text(card.updated) ?? syncedAt, sourceCardId: card.id, sourceUrl } },
    } : {}),
    ...(additionalPassiveTraits !== undefined ? { additionalPassiveTraits } : {}),
    abilities: effects(card.abilities, "abilities").map((a) => ({ name: text(a.name) ?? "", text: text(a.effect), type: text(a.type) })),
    attacks: effects(card.attacks, "attacks").map((a) => ({ name: text(a.name) ?? "", text: typeof a.effect === "string" ? a.effect : null,
      damage: typeof a.damage === "number" || typeof a.damage === "string" ? String(a.damage) : null, cost: strings(a.cost) })),
    sourceUrl,
    sourceUpdatedAt: text(card.updated), syncedAt
  };
}

export function isCardDefinition(card) {
  const nullableText = (v) => v === null || typeof v === "string";
  const nullableStrings = (v) => v === null || (Array.isArray(v) && v.every((item) => typeof item === "string"));
  return Boolean(card && card.source === "tcgdex" && ["sourceCardId", "name", "setId", "localId", "sourceUrl", "syncedAt"].every((k) => text(card[k]))
    && ["Pokemon", "Trainer", "Energy"].includes(card.category)
    && (card.rawRegulationMark === undefined || typeof card.rawRegulationMark === "string" && /^[a-z]$/i.test(card.rawRegulationMark) && card.regulationMark === card.rawRegulationMark.toUpperCase())
    && (card.energyType === undefined || card.category === "Energy" && [null, "Normal", "Special"].includes(card.energyType))
    && (card.hp === null || (Number.isSafeInteger(card.hp) && card.hp > 0))
    && ["setReleaseDate", "trainerType", "stage", "evolvesFrom", "regulationMark", "sourceUpdatedAt"].every((k) => nullableText(card[k]))
    && (card.effectProvenance === undefined || (card.effectProvenance
      && ["pokemontcg-historical", "reviewed-printing"].includes(card.effectProvenance.provider)
      && ["revision", "sourceCardId", "sourceUrl"].every((k) => text(card.effectProvenance[k]))
      && Array.isArray(card.effectProvenance.fields) && card.effectProvenance.fields.length > 0
      && card.effectProvenance.fields.every((field) => ["abilities", "attacks", "trainerType", "rules"].includes(field))
      && (card.effectProvenance.reviewUrl === undefined || text(card.effectProvenance.reviewUrl))))
    && (card.imageUrl === undefined || typeof card.imageUrl === "string" && card.imageUrl.endsWith("/high.webp")
      && cardImageUrl(card.imageUrl.slice(0, -10)) === card.imageUrl)
    && isTcgdexRegulationMarkProvenance(card)
    && nullableStrings(card.types) && nullableStrings(card.rules) && isCardRuleEvidenceMetadata(card) && isCardPassiveEvidenceMetadata(card) && isCardRegulationEvidenceMetadata(card)
    && (card.additionalPassiveTraits === undefined || card.additionalPassiveTraits === null
      || Array.isArray(card.additionalPassiveTraits) && card.additionalPassiveTraits.every((trait) => trait && typeof trait.name === "string" && nullableText(trait.text) && nullableText(trait.type)))
    && Array.isArray(card.abilities) && card.abilities.every((a) => a && typeof a.name === "string" && nullableText(a.text) && nullableText(a.type))
    && Array.isArray(card.attacks) && card.attacks.every((a) => a && typeof a.name === "string" && nullableText(a.text) && nullableText(a.damage) && nullableStrings(a.cost)));
}

/** Fresh producers must emit trusted certificates, while compatible loaders may
 * retain old source facts whose certificates have become stale. */
export function isProducedCardDefinition(card) {
  return isCardDefinition(card) && isCardRuleEvidence(card) && isCardPassiveEvidence(card) && isCardRegulationEvidence(card);
}
