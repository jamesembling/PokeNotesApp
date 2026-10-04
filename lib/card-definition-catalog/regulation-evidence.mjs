import reviews from "./reviewed-regulation-marks.json" with { type: "json" };
import { cardDefinitionSourceUrl } from "./rule-evidence.mjs";
const registry = new Map(reviews.map((review) => [review.sourceCardId, review]));
const matches = (card) => {
  const review = registry.get(card?.sourceCardId);
  return review && card.source === "tcgdex" && card.sourceCardId === `${card.setId}-${card.localId}`
    && card.sourceUrl === cardDefinitionSourceUrl(card.sourceCardId)
    && ["setId", "localId", "name", "hp", "stage", "category"].every((key) => card[key] === review[key]) ? review : null;
};
export function isCardRegulationEvidenceMetadata(card) {
  const e = card?.regulationEvidence;
  if (e === undefined) return true;
  if (!e) return false;
  if (e.status === "unknown") return e.scope === undefined && e.provenance === undefined;
  const p = e.provenance;
  return Boolean(["verified_present", "verified_absent"].includes(e.status) && e.scope === "printed_regulation_mark"
    && p?.provider === "reviewed-printing" && ["revision", "sourceCardId", "sourceUrl"].every((key) => typeof p[key] === "string" && p[key].trim())
    && typeof p.scanSha256 === "string" && /^[a-f0-9]{64}$/.test(p.scanSha256));
}
export function isCardRegulationEvidence(card) {
  if (card?.regulationEvidence === undefined) return true;
  if (!isCardRegulationEvidenceMetadata(card)) return false;
  if (card.regulationEvidence.status === "unknown") return true;
  const review = matches(card), e = card.regulationEvidence;
  return Boolean(review && card.regulationMark === review.regulationMark
    && e.status === (review.regulationMark === null ? "verified_absent" : "verified_present")
    && ["provider", "revision", "sourceCardId", "sourceUrl", "scanSha256"].every((key) => e.provenance[key] === review.provenance[key]));
}
/** Exact reviewed printed mark only; never a reprint or legality certificate. */
export function hasVerifiedPrintedRegulationMarkAbsence(card) {
  return card?.regulationEvidence?.status === "verified_absent" && isCardRegulationEvidence(card);
}
export function applyReviewedRegulationMark(card) {
  if (card.regulationEvidence !== undefined && !isCardRegulationEvidence(card)) {
    const { regulationEvidence: _stale, ...facts } = card;
    card = facts;
  }
  const review = matches(card);
  if (!review || card.regulationMark !== null && card.regulationMark !== review.regulationMark) return card;
  if (card.regulationEvidence?.scope === "printed_regulation_mark" && isCardRegulationEvidence(card)) return card;
  return { ...card, regulationMark: review.regulationMark, regulationEvidence: {
    status: review.regulationMark === null ? "verified_absent" : "verified_present", scope: "printed_regulation_mark", provenance: { ...review.provenance },
  } };
}
