import reviewedPokemonRules from "./reviewed-pokemon-rules.json" with { type: "json" };

export const HISTORICAL_REVISION = "39a26a144c8b6ef6c2fb17b2c29d0bb7121e3a11";
export const HISTORICAL_ROOT = `https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/${HISTORICAL_REVISION}`;
export const cardDefinitionSourceUrl = (id) => `https://api.tcgdex.net/v2/en/cards/${encodeURIComponent(id)}`;
export const historicalCardSourceUrl = (setId) => `${HISTORICAL_ROOT}/cards/en/${encodeURIComponent(setId)}.json`;

// Authored exact-printing scans. Rule Box review and whole passive-field review
// remain separate admissions; caller-supplied status is never sufficient.
const reviewedRuleBoxes = new Map(reviewedPokemonRules.map((review) => [review.sourceCardId, review]));
const text = (value) => typeof value === "string" && value.trim();
const matchingReview = (card) => {
  const review = reviewedRuleBoxes.get(card?.sourceCardId);
  return review && card.source === "tcgdex" && card.sourceCardId === `${card.setId}-${card.localId}`
    && card.sourceUrl === cardDefinitionSourceUrl(card.sourceCardId)
    && card.category === "Pokemon" && ["setId", "localId", "name", "hp", "stage"].every((field) => card[field] === review[field]) ? review : null;
};

const sameProvenance = (left, right) => Boolean(left && right)
  && ["provider", "revision", "sourceCardId", "sourceUrl", "scanSha256"].every((key) => left[key] === right[key]);
const sameAbilities = (card, review) => Array.isArray(card.abilities) && review.passiveInventory
  && card.abilities.length === review.passiveInventory.abilities.length
  && card.abilities.every((ability, index) => ability && ["name", "text", "type"].every((field) => ability[field] === review.passiveInventory.abilities[index][field]));

const noContradictoryTraits = (card) => card.ancientTrait == null && (card.additionalPassiveTraits == null
  || Array.isArray(card.additionalPassiveTraits) && card.additionalPassiveTraits.length === 0);

/** Apply reviewed rules and certify passive fields only when the supplied
 * complete Ability inventory still matches. Never replace contradictory text. */
export function applyReviewedPokemonRuleBox(card) {
  // A stale certificate must not discard otherwise valid source facts.
  if (card.passiveEvidence !== undefined && !isCardPassiveEvidence(card)) {
    const { passiveEvidence: _stale, ...sourceFacts } = card;
    card = sourceFacts;
  }
  if (card.ruleEvidence !== undefined && !isCardRuleEvidence(card)) {
    const { ruleEvidence: _stale, ...sourceFacts } = card;
    card = sourceFacts;
  }
  const review = matchingReview(card);
  if (!review || card.rules !== null && JSON.stringify(card.rules) !== JSON.stringify(review.rules)) return card;
  const updated = card.ruleEvidence?.scope === "printed_rule_box" && isCardRuleEvidence(card) ? card : { ...card, rules: [...review.rules], ruleEvidence: {
    status: review.rules.length ? "verified_present" : "verified_absent", scope: "printed_rule_box", provenance: { ...review.provenance },
  } };
  if (!sameAbilities(updated, review) || !noContradictoryTraits(updated) || review.passiveInventory.additionalTraits !== "verified_absent") return updated;
  if (updated.passiveEvidence?.status === "verified_complete" && isCardPassiveEvidence(updated)) return updated;
  return { ...updated, additionalPassiveTraits: updated.additionalPassiveTraits ?? [], passiveEvidence: { status: "verified_complete", scope: "printed_passive_inventory",
    abilities: review.passiveInventory.abilities.length ? "verified_present" : "verified_absent",
    additionalTraits: "verified_absent", provenance: { ...review.provenance },
  } };
}

/** Structural validation permits old source rows without trusting their certificate. */
export function isCardRuleEvidenceMetadata(card) {
  const evidence = card?.ruleEvidence;
  if (evidence === undefined) return true;
  if (!evidence || card.category !== "Pokemon") return false;
  if (evidence.status === "unknown") return evidence.scope === undefined && evidence.provenance === undefined;
  const p = evidence.provenance;
  if (!p || !["revision", "sourceCardId", "sourceUrl"].every((key) => text(p[key]))) return false;
  if (evidence.status === "verified_present" && evidence.scope === "supplied_text")
    return ["tcgdex", "pokemontcg-historical"].includes(p.provider);
  return ["verified_present", "verified_absent"].includes(evidence.status) && evidence.scope === "printed_rule_box"
    && p.provider === "reviewed-printing" && typeof p.scanSha256 === "string" && /^[a-f0-9]{64}$/.test(p.scanSha256);
}

/** Field provenance must match this printing and the provider's actual source path.
 * Historical/primary text establishes supplied text, never whole-box absence. */
export function isCardRuleEvidence(card) {
  const evidence = card?.ruleEvidence;
  if (evidence === undefined) return true;
  if (!isCardRuleEvidenceMetadata(card)) return false;
  if (evidence.status === "unknown") return true;
  const provenance = evidence.provenance;
  if (!provenance || !["revision", "sourceCardId", "sourceUrl"].every((key) => text(provenance[key]))
    || provenance.sourceCardId !== card.sourceCardId || card.source !== "tcgdex" || card.sourceUrl !== cardDefinitionSourceUrl(card.sourceCardId)
    || !Array.isArray(card.rules) || !card.rules.every(text)) return false;
  if (evidence.scope === "printed_rule_box") {
    const review = matchingReview(card);
    return Boolean(review && JSON.stringify(card.rules) === JSON.stringify(review.rules)
      && evidence.status === (review.rules.length ? "verified_present" : "verified_absent")
      && sameProvenance(provenance, review.provenance));
  }
  if (evidence.scope !== "supplied_text" || evidence.status !== "verified_present" || !card.rules.length) return false;
  return provenance.provider === "tcgdex"
    ? card.source === "tcgdex" && provenance.sourceUrl === card.sourceUrl && provenance.sourceUrl === cardDefinitionSourceUrl(card.sourceCardId)
      && provenance.revision === (card.sourceUpdatedAt || card.syncedAt)
    : provenance.provider === "pokemontcg-historical" && provenance.revision === HISTORICAL_REVISION && provenance.sourceUrl === historicalCardSourceUrl(card.setId);
}

/** Structural compatibility preserves source rows with stale certificates. Trusted
 * completeness still requires isCardPassiveEvidence against authored scan facts. */
export function isCardPassiveEvidenceMetadata(card) {
  const evidence = card?.passiveEvidence;
  if (evidence === undefined) return true;
  if (!evidence || card.category !== "Pokemon") return false;
  if (evidence.status === "unknown") return evidence.scope === undefined && evidence.provenance === undefined;
  const p = evidence.provenance;
  return Boolean(evidence.status === "verified_complete" && evidence.scope === "printed_passive_inventory"
    && ["verified_present", "verified_absent"].includes(evidence.abilities) && evidence.additionalTraits === "verified_absent"
    && p?.provider === "reviewed-printing" && ["revision", "sourceCardId", "sourceUrl"].every((key) => text(p[key]))
    && typeof p.scanSha256 === "string" && /^[a-f0-9]{64}$/.test(p.scanSha256));
}

/** Whole printed passive inventory is a separate reviewed field-domain claim.
 * It requires exact current Rule Box and Ability text plus verified absence of
 * additional intrinsic printed traits. It does not certify modeled effect semantics,
 * format legality or attached-card inventory. Rule Box-only records cannot supply it. */
export function isCardPassiveEvidence(card) {
  const evidence = card?.passiveEvidence;
  if (evidence === undefined) return true;
  if (!evidence || card.category !== "Pokemon") return false;
  if (evidence.status === "unknown") return evidence.scope === undefined && evidence.provenance === undefined;
  const review = matchingReview(card);
  return Boolean(isCardPassiveEvidenceMetadata(card) && review && sameAbilities(card, review) && noContradictoryTraits(card)
    && Array.isArray(card.additionalPassiveTraits) && card.additionalPassiveTraits.length === 0 && review.passiveInventory.additionalTraits === "verified_absent"
    && evidence.status === "verified_complete" && evidence.scope === "printed_passive_inventory"
    && evidence.abilities === (review.passiveInventory.abilities.length ? "verified_present" : "verified_absent")
    && evidence.additionalTraits === "verified_absent" && sameProvenance(evidence.provenance, review.provenance)
    && card.ruleEvidence?.scope === "printed_rule_box" && isCardRuleEvidence(card));
}
