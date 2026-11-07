import { applyReviewedRegulationMark } from "./regulation-evidence.mjs";
import { fetchJsonWithinBoundary } from "../catalog/safe-json-fetch.mjs";
import { normalizeCardDefinitionName as normalize } from "./source.mjs";
import { HISTORICAL_REVISION, HISTORICAL_ROOT as ROOT, cardDefinitionSourceUrl, historicalCardSourceUrl, applyReviewedPokemonRuleBox } from "./rule-evidence.mjs";

export { HISTORICAL_REVISION } from "./rule-evidence.mjs";
const options = { allowedOrigins: ["https://raw.githubusercontent.com"], allowedPathPrefixes: [`/PokemonTCG/pokemon-tcg-data/${HISTORICAL_REVISION}/`], timeoutMs: 60_000 };
const trainerKinds = new Set(["item", "supporter", "stadium", "tool"]);
const stage = (value) => normalize(value).replace(/ /g, "");
const sameCost = (left, right) => JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
const damage = (value) => String(value).replace(/×/g, "x").replace(/\s/g, "");
const number = (value) => String(value).replace(/^0+(?=\d)/, "");
export function needsEffectEnrichment(card) {
  return card.category === "Pokemon" ? (!card.abilities.length && !card.attacks.length
    || [...card.abilities, ...card.attacks].some((effect) => !effect.name)
    || card.abilities.some((effect) => effect.text === null))
    : card.category === "Trainer" && (!trainerKinds.has(normalize(card.trainerType)) || card.rules === null);
}
function needsRuleEnrichment(card) {
  return card.category === "Pokemon" && card.rules === null;
}

/** Fill missing fields only after independent exact-printing identity checks. */
export function applyHistoricalEffectEnrichment(card, secondary, set) {
  if ((!needsEffectEnrichment(card) && !needsRuleEnrichment(card)) || !secondary || !set || set.id !== card.setId || !set.name
    || secondary.id !== card.sourceCardId || secondary.id !== `${set.id}-${secondary.number}`
    || number(secondary.number) !== number(card.localId) || secondary.supertype !== (card.category === "Pokemon" ? "Pokémon" : card.category)) return card;
  // This one reviewed scan says Heatran LV.X 97/100; TCGdex omits LV.X from its name.
  const reviewedLevelUp = card.sourceCardId === "dp7-97" && card.name === "Heatran" && secondary.name === "Heatran LV.X"
    && card.stage === "LEVEL-UP" && secondary.subtypes?.includes("Level-Up");
  if (normalize(secondary.name) !== normalize(card.name) && !reviewedLevelUp) return card;
  if (card.setReleaseDate && set.releaseDate && card.setReleaseDate !== set.releaseDate.replaceAll("/", "-")) return card;
  let patch = {}, fields = [];
  if (card.category === "Pokemon") {
    if (Number(secondary.hp) !== card.hp || card.stage !== null && !secondary.subtypes?.some((s) => stage(s) === stage(card.stage))) return card;
    const abilities = secondary.abilities ?? [], attacks = secondary.attacks ?? [];
    if (!Array.isArray(abilities) || !Array.isArray(attacks) || !abilities.length && !attacks.length
      || abilities.some((a) => !a.name || typeof a.text !== "string" || !a.text || typeof a.type !== "string")
      || attacks.some((a) => !a.name || typeof a.text !== "string" || !Array.isArray(a.cost))) return card;
    // Existing named effects must remain represented; never replace conflicting supplied text.
    for (const [existing, incoming] of [[card.abilities, abilities], [card.attacks, attacks]]) {
      if (existing.some((effect) => effect.name && !incoming.some((other) => normalize(effect.name) === normalize(other.name)
        && (effect.text === null || normalize(effect.text) === normalize(other.text))
        && (effect.type == null || stage(effect.type) === stage(other.type))
        && (effect.damage == null || damage(effect.damage) === damage(other.damage))
        && (effect.cost == null || Array.isArray(other.cost) && sameCost(effect.cost, other.cost))))) return card;
    }
    if (needsEffectEnrichment(card)) {
      patch = { abilities: abilities.map((a) => ({ name: a.name, text: a.text, type: a.type })),
        attacks: attacks.map((a) => ({ name: a.name, text: a.text, damage: a.damage == null ? null : String(a.damage), cost: a.cost })) };
      fields = ["abilities", "attacks"];
    }
    if (needsRuleEnrichment(card) && Array.isArray(secondary.rules) && secondary.rules.length
      && secondary.rules.every((rule) => typeof rule === "string" && rule.trim())) {
      patch.rules = [...secondary.rules];
      patch.ruleEvidence = { status: "verified_present", scope: "supplied_text", provenance: {
        provider: "pokemontcg-historical", revision: HISTORICAL_REVISION, sourceCardId: secondary.id, sourceUrl: historicalCardSourceUrl(set.id),
      } };
      // Separate field provenance preserves any earlier exact effect supplement.
      if (fields.length || !card.effectProvenance) fields.push("rules");
    }
    if (!Object.keys(patch).length) return card;
  } else {
    const kinds = (secondary.subtypes ?? []).map((s) => s === "Pokémon Tool" ? "Tool" : s).filter((s) => trainerKinds.has(normalize(s)));
    if (!trainerKinds.has(normalize(card.trainerType)) && kinds.length === 1) { patch.trainerType = kinds[0]; fields.push("trainerType"); }
    if (card.rules === null && Array.isArray(secondary.rules) && secondary.rules.length && secondary.rules.every((s) => typeof s === "string" && s)) { patch.rules = secondary.rules; fields.push("rules"); }
    if (!fields.length) return card;
  }
  return { ...card, ...patch, ...(fields.length ? { effectProvenance: { provider: "pokemontcg-historical", revision: HISTORICAL_REVISION,
    sourceCardId: secondary.id, sourceUrl: historicalCardSourceUrl(set.id), fields,
    ...(reviewedLevelUp ? { reviewUrl: "https://images.pokemontcg.io/dp7/97_hires.png" } : {}) } } : {}) };
}

/** Individually inspected English scans, not inferred reprints or representative art. */
export function applyReviewedPrintingEffects(card) {
  if (card.sourceCardId === "30th-126" && card.setId === "30th" && card.localId === "126" && card.name === "Poké Pad"
    && card.category === "Trainer" && card.trainerType === "Item" && card.hp === null && card.rules === null
    && !card.abilities.length && !card.attacks.length) return {
    ...card, rules: ["Search your deck for a Pokémon that doesn’t have a Rule Box, reveal it, and put it into your hand. Then, shuffle your deck. (Pokémon ex, Pokémon V, etc. have Rule Boxes.)"],
    effectProvenance: { provider: "reviewed-printing", revision: "2026-10-03", sourceCardId: card.sourceCardId,
      sourceUrl: "https://assets.tcgdex.net/en/me/30th/126/high.webp", fields: ["rules"] },
  };
  const energyMovementPrintings = {
    "tk-hs-g-21": { setId: "tk-hs-g", localId: "21",
      sourceUrl: "https://www.bordercitygames.ca/cdn/shop/products/cce56ac1-9eea-4d22-931a-9c9ec96540af_1000x1000.jpg?v=1696314466",
      reviewUrl: "https://www.bordercitygames.ca/products/energy-switch-gyarados-hgss-trainer-kit-gyarados-raichu" },
    "tk-hs-r-29": { setId: "tk-hs-r", localId: "29",
      sourceUrl: "https://gnomegames.com/cdn/shop/files/85261.jpg?v=1778523603&width=1946",
      reviewUrl: "https://gnomegames.com/products/energy-switch-raichu-hgss-trainer-kit-gyarados-raichu-85261" },
  };
  const reviewedMovement = energyMovementPrintings[card.sourceCardId];
  if (reviewedMovement && card.setId === reviewedMovement.setId && card.localId === reviewedMovement.localId
    && card.sourceCardId === `${card.setId}-${card.localId}` && card.name === "Energy Switch" && card.category === "Trainer"
    && card.hp === null && card.rules === null && !card.abilities.length && !card.attacks.length) return {
    ...card, rules: ["Move a basic Energy card attached to 1 of your Pokémon to another of your Pokémon."],
    effectProvenance: { provider: "reviewed-printing", revision: "2026-10-03", sourceCardId: card.sourceCardId,
      sourceUrl: reviewedMovement.sourceUrl, reviewUrl: reviewedMovement.reviewUrl, fields: ["rules"] },
  };
  if (!["tk-xy-latio-12", "tk-xy-latio-26"].includes(card.sourceCardId) || !needsEffectEnrichment(card)
    || card.setId !== "tk-xy-latio" || card.sourceCardId !== `tk-xy-latio-${card.localId}`
    || card.name !== "Solrock" || card.hp !== 80 || card.category !== "Pokemon" || card.stage !== "Basic"
    || card.abilities.length || card.attacks.length || card.rules?.length || card.sourceUrl !== cardDefinitionSourceUrl(card.sourceCardId)) return card;
  const reviewed = applyReviewedPokemonRuleBox({ ...card, abilities: [], attacks: [
    { name: "Solar Generator", text: "Search your deck for up to 2 Special Energy cards, reveal them, and put them into your hand. Shuffle your deck afterward.", damage: "", cost: ["Colorless"] },
    { name: "Knock Away", text: "Flip a coin. If heads, this attack does 20 more damage.", damage: "20+", cost: ["Fighting", "Colorless"] }
  ] });
  return { ...reviewed, effectProvenance: { provider: "reviewed-printing", revision: "2026-10-03", sourceCardId: card.sourceCardId,
    sourceUrl: reviewed.ruleEvidence.provenance.sourceUrl, fields: ["abilities", "attacks"] } };
}

/** A bounded historical supplement: one manifest and at most one request per needed set. */
export async function createHistoricalEffectEnricher() {
  const sets = await fetchJsonWithinBoundary(`${ROOT}/sets/en.json`, options);
  if (!Array.isArray(sets) || sets.some((s) => typeof s.id !== "string" || typeof s.name !== "string")) throw new Error("Invalid historical set manifest.");
  const setIndex = new Map(sets.map((set) => [set.id, set]));
  const pending = new Map();
  return async (primary) => {
    const card = applyReviewedRegulationMark(applyReviewedPokemonRuleBox(applyReviewedPrintingEffects(primary)));
    if ((!needsEffectEnrichment(card) && !needsRuleEnrichment(card)) || !setIndex.has(card.setId)) return card;
    if (!pending.has(card.setId)) pending.set(card.setId, fetchJsonWithinBoundary(historicalCardSourceUrl(card.setId), options).then((cards) => {
      if (!Array.isArray(cards) || new Set(cards.map((c) => c.id)).size !== cards.length) throw new Error("Invalid historical printing list.");
      return new Map(cards.map((c) => [c.id, c]));
    }));
    const cards = await pending.get(card.setId);
    return applyReviewedRegulationMark(applyReviewedPokemonRuleBox(applyHistoricalEffectEnrichment(card, cards.get(card.sourceCardId), setIndex.get(card.setId))));
  };
}
