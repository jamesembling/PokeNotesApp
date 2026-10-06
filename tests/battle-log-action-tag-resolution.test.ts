import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { extractBattleLogActionCardCandidate } from "@/lib/battle-log/action-tags";
import {
  extractUsedEffectCandidate,
  resolveBattleLogEffectCatalogTagFromRows,
  resolveBattleLogEffectOriginFromRows,
  resolveBattleLogEffectCatalogEvidence,
  type CardEffectLookupRow
} from "@/lib/battle-log/effect-catalog";

import { buildCardDefinitionIndex, definitionEffectRows, resolveCardDefinition, partitionCardDefinitionsForFormat, hasCompletePokemonRuleBoxEvidence, hasCompletePokemonPassiveEvidence } from "@/lib/card-definition-catalog/resolve";
import { cardDefinitionAvailability, cardDefinitionPlayedDay, ptcglStandardRotation } from "@/lib/card-definition-catalog/legality.mjs";
import { syntheticCardDefinition as definition } from "./fixtures/battle-replay-game";
import { loadCardDefinitions } from "@/lib/card-definition-catalog/server";
import { applyHistoricalEffectEnrichment, applyReviewedPrintingEffects, HISTORICAL_REVISION } from "@/lib/card-definition-catalog/enrichment.mjs";
import { needsTcgdexRegulationMarkCompletion, applyTcgdexRegulationMarkCompletion } from "@/lib/card-definition-catalog/tcgdex-regulation.mjs";
import { normalizeTcgdexCard, isCardDefinition, isCardRuleEvidence, isProducedCardDefinition } from "@/lib/card-definition-catalog/source.mjs";
import { selectRetainedCardDefinitions, getCardDefinitionScopeCoverage, getCardDefinitionSnapshotCoverage, currentStandardFormat } from "@/lib/card-definition-catalog/retention.mjs";
import { publishCardDefinitionGeneration, getCardDefinitionPublicationRegressions, type ReferencePublicationHoldError } from "@/lib/card-definition-catalog/publication.mjs";
import { applyReviewedRegulationMark, hasVerifiedPrintedRegulationMarkAbsence } from "@/lib/card-definition-catalog/regulation-evidence.mjs";
import { applyReviewedPokemonRuleBox } from "@/lib/card-definition-catalog/rule-evidence.mjs";
import { createReplayEffectEvidenceResolver } from "@/lib/battle-replay/effect-evidence";

const rows: CardEffectLookupRow[] = [
  {
    card_name: "Boss's Orders",
    normalized_card_name: "boss's orders",
    effect_kind: "supporter",
    effect_name: null,
    normalized_effect_name: ""
  },
  {
    card_name: "Bravery Charm",
    normalized_card_name: "bravery charm",
    effect_kind: "tool",
    effect_name: null,
    normalized_effect_name: ""
  },
  {
    card_name: "Budew",
    normalized_card_name: "budew",
    effect_kind: "attack",
    effect_name: "Itchy Pollen",
    normalized_effect_name: "itchy pollen"
  },
  {
    card_name: "Radiant Greninja",
    normalized_card_name: "radiant greninja",
    effect_kind: "ability",
    effect_name: "Concealed Cards",
    normalized_effect_name: "concealed cards"
  },
  {
    card_name: "Dudunsparce",
    normalized_card_name: "dudunsparce",
    effect_kind: "ability",
    effect_name: "Run Away Draw",
    normalized_effect_name: "run away draw"
  }
];

test("extractBattleLogActionCardCandidate finds likely card names in played and attached lines", () => {
  assert.equal(
    extractBattleLogActionCardCandidate("Played Boss's Orders -> gusted Gabite into the Active Spot."),
    "Boss's Orders"
  );
  assert.equal(
    extractBattleLogActionCardCandidate("Johan attached Bravery Charm to Munkidori."),
    "Bravery Charm"
  );
  assert.equal(extractBattleLogActionCardCandidate("Johan benched Munkidori."), null);
  assert.equal(extractBattleLogActionCardCandidate("Johan played a card."), null);
});

test("extractUsedEffectCandidate requires both Pokemon and effect names", () => {
  assert.deepEqual(
    extractUsedEffectCandidate("iBerzrk_Network's Budew used Itchy Pollen on JammerUK1993's Budew for 10 damage."),
    {
      cardName: "budew",
      effectName: "itchy pollen"
    }
  );
  assert.equal(extractUsedEffectCandidate("JammerUK1993 drew a card."), null);
});

test("card effect catalog resolves trainer tags from card name only", async (t) => {
  assert.equal(
    resolveBattleLogEffectCatalogTagFromRows(
      "Played Boss's Orders -> gusted Gabite into the Active Spot.",
      rows
    ),
    "supporter"
  );
  assert.equal(
    resolveBattleLogEffectCatalogTagFromRows("Johan attached Bravery Charm to Munkidori.", rows),
    "tool"
  );
  const crispin = definition({ name: "Crispin", hp: null, category: "Trainer", trainerType: "Supporter", attacks: [],
    rules: ["Search your deck for up to 2 Basic Energy cards of different types and reveal them. Attach 1 of them to 1 of your Pokémon and put the other into your hand. Then, shuffle your deck."] });
  const normalized = normalizeTcgdexCard({ id: "synthetic-1", localId: "1", name: "Crispin", category: "Trainer", trainerType: "Supporter", image: "https://assets.tcgdex.net/en/sv/synthetic/1", effect: crispin.rules![0], set: { id: "synthetic" } }, { id: "synthetic", releaseDate: "2026-01-01" }, crispin.syncedAt);
  assert.deepEqual(normalized.rules, crispin.rules, "raw trainer text must survive source normalization");
  assert.equal(normalized.hp, null);
  assert.equal(normalized.imageUrl, "https://assets.tcgdex.net/en/sv/synthetic/1/high.webp");
  assert.equal(isCardDefinition(normalized), true);
  for (const localId of [0, 1, "001", "TG01"]) {
    const numericPrinting = normalizeTcgdexCard({ id: "synthetic-1", localId, name: "Crispin", category: "Trainer", set: { id: "synthetic" } }, { id: "synthetic" }, crispin.syncedAt);
    assert.equal(numericPrinting.localId, String(localId), "numeric collector numbers normalize without changing string identities");
    assert.equal(isCardDefinition(numericPrinting), true);
  }
  for (const localId of [null, {}, NaN, Infinity, -1, 1.5, ""]) {
    assert.throws(() => normalizeTcgdexCard({ id: "synthetic-1", localId, name: "Crispin", category: "Trainer", set: { id: "synthetic" } }, { id: "synthetic" }, crispin.syncedAt), /identity/);
  }
  const unsafeArtwork = normalizeTcgdexCard({ id: "synthetic-2", localId: "2", name: "Seedling", category: "Pokemon", set: { id: "synthetic" }, image: "https://untrusted.invalid/en/sv/synthetic/2" }, { id: "synthetic" }, crispin.syncedAt);
  assert.equal(unsafeArtwork.imageUrl, undefined);
  assert.equal(isCardDefinition({ ...normalized, imageUrl: "https://untrusted.invalid/card/high.webp" }), false);
  const unknownHp = normalizeTcgdexCard({ id: "synthetic-2", localId: "2", name: "Seedling", category: "Pokemon", set: { id: "synthetic" } }, { id: "synthetic" }, crispin.syncedAt);
  assert.equal(unknownHp.hp, null);
  assert.equal(unknownHp.rules, null, "missing rule boxes must remain unknown");
  assert.equal(unknownHp.ruleEvidence, undefined, "unknown fields need no per-printing metadata expansion");
  const suppliedRules = normalizeTcgdexCard({ id: "synthetic-2", localId: "2", name: "Seedling", category: "Pokemon", rules: ["Supplied field text."], set: { id: "synthetic" } }, { id: "synthetic" }, crispin.syncedAt);
  assert.equal(suppliedRules.ruleEvidence?.status, "verified_present");
  assert.equal(suppliedRules.ruleEvidence?.status === "verified_present" && suppliedRules.ruleEvidence.scope, "supplied_text");
  assert.equal(isCardDefinition(suppliedRules), true);
  assert.equal(hasCompletePokemonRuleBoxEvidence(resolveCardDefinition(buildCardDefinitionIndex([suppliedRules]), { name: "Seedling" })), false, "a sourced fragment does not certify an entire printed Rule Box");
  for (const provenance of [{ sourceCardId: "other-2" }, { provider: "reviewed-printing" }, { sourceUrl: "https://untrusted.invalid/rules" }, { revision: "different" }]) {
    assert.equal(isCardRuleEvidence({ ...suppliedRules, ruleEvidence: { ...suppliedRules.ruleEvidence, provenance: { ...("provenance" in suppliedRules.ruleEvidence! ? suppliedRules.ruleEvidence.provenance : {}), ...provenance } } }), false, "rule provenance must match the exact printing and provider source");
  }
  const emptyRules = normalizeTcgdexCard({ id: "synthetic-2", localId: "2", name: "Seedling", category: "Pokemon", rules: [], set: { id: "synthetic" }, ruleEvidence: { status: "verified_absent", scope: "printed_rule_box" } }, { id: "synthetic" }, crispin.syncedAt);
  assert.deepEqual(emptyRules.rules, []);
  assert.equal(emptyRules.ruleEvidence, undefined, "an unreviewed empty source array cannot certify absence");
  assert.equal(hasCompletePokemonRuleBoxEvidence(resolveCardDefinition(buildCardDefinitionIndex([emptyRules]), { name: "Seedling" })), false);
  assert.throws(() => normalizeTcgdexCard({ id: "synthetic-1", localId: "1", name: "Seedling", category: "Pokemon", set: { id: "other" } }, { id: "synthetic" }, crispin.syncedAt), /identity/);
  const incompletePrinting = definition({ attacks: [], abilities: [] });
  const secondarySet = { id: "synthetic", name: "Synthetic set", releaseDate: "2026/01/01" };
  const secondaryPrinting = { id: "synthetic-1", number: "1", name: "Seedling", supertype: "Pokémon", subtypes: ["Basic"], hp: "70", attacks: [{ name: "Tap", text: "", damage: "10", cost: ["Grass"] }] };
  const enrichedPrinting = applyHistoricalEffectEnrichment(incompletePrinting, secondaryPrinting, secondarySet);
  assert.deepEqual(enrichedPrinting.attacks, secondaryPrinting.attacks);
  assert.deepEqual(enrichedPrinting.abilities, []);
  assert.equal(enrichedPrinting.hp, incompletePrinting.hp);
  assert.equal(enrichedPrinting.effectProvenance?.revision, HISTORICAL_REVISION);
  assert.deepEqual(enrichedPrinting.effectProvenance?.fields, ["abilities", "attacks"]);
  assert.equal(incompletePrinting.attacks.length, 0, "enrichment cannot mutate the primary source record");
  const missingStageEnrichment = applyHistoricalEffectEnrichment({ ...incompletePrinting, stage: null }, secondaryPrinting, secondarySet);
  assert.deepEqual(missingStageEnrichment.attacks, secondaryPrinting.attacks);
  assert.equal(missingStageEnrichment.stage, null, "effects-only enrichment cannot invent missing stage evidence");
  assert.equal(applyHistoricalEffectEnrichment(definition(), secondaryPrinting, secondarySet).effectProvenance, undefined, "complete primary effects do not need replacement");
  // Exact real printing fields retained in the pinned TCGdex corpus and historical swsh4 JSON.
  const pikachu = definition({ sourceCardId: "swsh4-44", setId: "swsh4", localId: "44", name: "Pikachu VMAX", hp: 310, stage: "VMAX", types: ["Lightning"], evolvesFrom: "Pikachu V", rules: null, setReleaseDate: "2020-11-13", regulationMark: "D", sourceUrl: "https://api.tcgdex.net/v2/en/cards/swsh4-44",
    attacks: [{ name: "G-Max Volt Tackle", text: "You may discard all Energy from this Pokémon. If you do, this attack does 150 more damage.", damage: "120+", cost: ["Lightning", "Lightning", "Lightning"] }] });
  const pikachuSecondary = { id: "swsh4-44", number: "44", name: "Pikachu VMAX", hp: "310", supertype: "Pokémon", subtypes: ["VMAX"], rules: ["VMAX rule: When your Pokémon VMAX is Knocked Out, your opponent takes 3 Prize cards."], attacks: [{ name: "G-Max Volt Tackle", text: "You may discard all Energy from this Pokémon. If you do, this attack does 150 more damage.", damage: "120+", cost: ["Lightning", "Lightning", "Lightning"] }] };
  const pikachuSet = { id: "swsh4", name: "Vivid Voltage", releaseDate: "2020/11/13" };
  const pikachuRules = applyHistoricalEffectEnrichment(pikachu, pikachuSecondary, pikachuSet);
  assert.deepEqual(pikachuRules.rules, pikachuSecondary.rules);
  assert.equal(pikachuRules.attacks, pikachu.attacks, "rules-only enrichment preserves the primary attack array");
  assert.equal(pikachuRules.abilities, pikachu.abilities);
  assert.equal(pikachuRules.hp, 310);
  assert.equal(pikachu.rules, null, "supplementation preserves the captured source");
  assert.equal(pikachuRules.ruleEvidence?.status, "verified_present");
  assert.deepEqual(pikachuRules.effectProvenance?.fields, ["rules"]);
  assert.equal(isCardDefinition(pikachuRules), true);
  assert.equal(hasCompletePokemonRuleBoxEvidence(resolveCardDefinition(buildCardDefinitionIndex([pikachuRules]), { name: "Pikachu VMAX" })), false, "historical supplied rules do not certify exhaustive passive coverage");
  for (const rules of [undefined, null, [], [""], [null]]) assert.equal(applyHistoricalEffectEnrichment(pikachu, { ...pikachuSecondary, rules }, pikachuSet), pikachu, "omitted, empty or malformed historical rules never become absent rules");
  assert.equal(applyHistoricalEffectEnrichment(pikachu, { ...pikachuSecondary, id: "swsh04-44" }, pikachuSet), pikachu, "provider identities are never normalized heuristically");
  for (const mismatch of [{ text: null }, { text: "Different supplied attack." }, { damage: "130+" }, { cost: ["Fire"] }]) {
    assert.equal(applyHistoricalEffectEnrichment(pikachu, { ...pikachuSecondary, attacks: [{ ...pikachuSecondary.attacks[0], ...mismatch }] }, pikachuSet), pikachu, "rule supplementation requires compatible supplied printing effects");
  }
  for (const mismatch of [{ hp: "90" }, { name: "Seedling ex" }, { number: "2" }, { id: "different-1" }, { supertype: "Trainer" }, { subtypes: ["Stage 1"] }]) {
    assert.equal(applyHistoricalEffectEnrichment(incompletePrinting, { ...secondaryPrinting, ...mismatch }, secondarySet), incompletePrinting, "secondary facts require exact printing identity agreement");
  }
  assert.equal(applyHistoricalEffectEnrichment(incompletePrinting, secondaryPrinting, { ...secondarySet, id: "different" }), incompletePrinting);
  assert.equal(applyHistoricalEffectEnrichment(incompletePrinting, secondaryPrinting, { ...secondarySet, releaseDate: "2026/02/01" }), incompletePrinting, "known conflicting set dates refuse enrichment");
  assert.equal(applyHistoricalEffectEnrichment(incompletePrinting, undefined, secondarySet), incompletePrinting);
  const partiallyKnownPrinting = definition({ attacks: [{ name: "Tap", text: "", damage: "10", cost: ["Grass"] }], abilities: [{ name: "", type: "Ability", text: null }] });
  for (const mismatch of [{ damage: "20" }, { cost: ["Fire"] }, { text: "Draw a card." }]) {
    assert.equal(applyHistoricalEffectEnrichment(partiallyKnownPrinting, { ...secondaryPrinting, attacks: [{ ...secondaryPrinting.attacks[0], ...mismatch }] }, secondarySet), partiallyKnownPrinting, "secondary enrichment cannot overwrite conflicting known attack facts");
  }
  const knownAbilityType = definition({ attacks: [], abilities: [{ name: "Strength", type: "Poke-BODY", text: null }] });
  assert.equal(applyHistoricalEffectEnrichment(knownAbilityType, { ...secondaryPrinting, abilities: [{ name: "Strength", type: "Ability", text: "Draw a card." }] }, secondarySet), knownAbilityType, "historical effect types are not interchangeable");
  const reviewedSolrock = definition({ sourceCardId: "tk-xy-latio-12", sourceUrl: "https://api.tcgdex.net/v2/en/cards/tk-xy-latio-12", setId: "tk-xy-latio", localId: "12", name: "Solrock", hp: 80, attacks: [], abilities: [] });
  assert.deepEqual(applyReviewedPrintingEffects(reviewedSolrock).attacks.map((attack) => attack.name), ["Solar Generator", "Knock Away"]);
  assert.equal(applyReviewedPrintingEffects(reviewedSolrock).effectProvenance?.provider, "reviewed-printing");
  const solrockRules = applyReviewedPrintingEffects(reviewedSolrock);
  assert.deepEqual(solrockRules.rules, []);
  assert.equal(solrockRules.ruleEvidence?.status, "verified_absent");
  assert.equal(isCardDefinition(solrockRules), true);
  const reviewedBox = resolveCardDefinition(buildCardDefinitionIndex([solrockRules]), { name: "Solrock" });
  assert.equal(hasCompletePokemonRuleBoxEvidence(reviewedBox), true, "independently reviewed exact scan proves Rule Box absence only for that printing");
  assert.equal(hasCompletePokemonPassiveEvidence(reviewedBox), false, "a Rule Box-only review does not certify the entire passive inventory");
  for (const coverage of ["incomplete", "stale", "unavailable"] as const) assert.equal(hasCompletePokemonRuleBoxEvidence({ ...reviewedBox, coverage }), false);
  assert.equal(hasCompletePokemonRuleBoxEvidence({ ...reviewedBox, candidates: [solrockRules, reviewedSolrock] }), false, "one unreviewed compatible printing keeps Rule Box absence unknown");
  assert.equal(hasCompletePokemonRuleBoxEvidence(undefined), false);
  const absentEvidence = solrockRules.ruleEvidence;
  assert(absentEvidence?.status === "verified_absent");
  for (const provenance of [{ sourceCardId: "tk-xy-latio-13" }, { sourceUrl: "https://untrusted.invalid/scan" }, { revision: "different" }, { scanSha256: "0".repeat(64) }]) {
    assert.equal(isCardRuleEvidence({ ...solrockRules, ruleEvidence: { ...absentEvidence, provenance: { ...absentEvidence.provenance, ...provenance } } }), false, "reviewed completeness requires the authored scan receipt");
  }
  assert.equal(isCardRuleEvidence({ ...solrockRules, name: "Different Pokémon" }), false);
  assert.equal(isCardRuleEvidence({ ...solrockRules, source: "untrusted" }), false);
  assert.equal(isCardRuleEvidence({ ...solrockRules, localId: "13" }), false);
  assert.equal(isCardRuleEvidence({ ...solrockRules, sourceUrl: "https://untrusted.invalid/definition" }), false);
  assert.equal(isCardRuleEvidence({ ...solrockRules, rules: null }), false);
  assert.equal(isCardRuleEvidence({ ...solrockRules, rules: ["Contradictory text."] }), false);
  const staleRules = { ...solrockRules, ruleEvidence: { ...absentEvidence, provenance: { ...absentEvidence.provenance, scanSha256: "0".repeat(64) } } };
  assert.equal(isCardDefinition(staleRules), true, "stale rule receipts preserve valid source rows");
  assert.equal(isProducedCardDefinition(staleRules), false, "fresh sync rejects untrusted producer metadata");
  assert.equal(hasCompletePokemonRuleBoxEvidence({ ...reviewedBox, candidates: [staleRules] }), false);
  assert.equal(isProducedCardDefinition(applyReviewedPokemonRuleBox(staleRules)), true, "current exact review re-admits only authored evidence");
  assert.equal(applyReviewedPokemonRuleBox({ ...solrockRules, rules: ["Contradictory text."] }).ruleEvidence, undefined);
  const solrock26 = applyReviewedPrintingEffects({ ...reviewedSolrock, sourceCardId: "tk-xy-latio-26", localId: "26", sourceUrl: "https://api.tcgdex.net/v2/en/cards/tk-xy-latio-26" });
  assert.equal(hasCompletePokemonRuleBoxEvidence(resolveCardDefinition(buildCardDefinitionIndex([solrock26]), { name: "Solrock" })), true);
  const reconText = "Once during your turn, you may look at the top 2 cards of your deck and put 1 of them into your hand. Put the other card on the bottom of your deck.";
  const drakloak = definition({ sourceCardId: "sv06-129", setId: "sv06", localId: "129", name: "Drakloak", hp: 90, stage: "Stage1", rules: null,
    sourceUrl: "https://api.tcgdex.net/v2/en/cards/sv06-129", abilities: [{ name: "Recon Directive", text: reconText, type: "Ability" }] });
  const drakloakReviewed = applyReviewedPokemonRuleBox(drakloak);
  const drakloakEvidence = resolveCardDefinition(buildCardDefinitionIndex([drakloakReviewed]), { name: "Drakloak" });
  assert.equal(hasCompletePokemonPassiveEvidence(drakloakEvidence), true, "exact complete Rule Box, Ability set and other-trait absence share a reviewed scan receipt");
  assert.equal(drakloakReviewed.abilities, drakloak.abilities, "review admission never replaces primary Ability text");
  assert.equal(isCardDefinition(drakloakReviewed), true);
  assert.equal(drakloakReviewed.passiveEvidence?.status === "verified_complete" && drakloakReviewed.passiveEvidence.abilities, "verified_present");
  for (const abilities of [[], [{ name: "Recon Directive", text: null, type: "Ability" }], [{ name: "Recon Directive", text: "Different supplied text.", type: "Ability" }], [...drakloak.abilities, { name: "Additional", text: "Additional supplied text.", type: "Ability" }]]) {
    const mismatched = applyReviewedPokemonRuleBox({ ...drakloak, abilities });
    const evidence = resolveCardDefinition(buildCardDefinitionIndex([mismatched]), { name: "Drakloak" });
    assert.equal(hasCompletePokemonRuleBoxEvidence(evidence), true);
    assert.equal(hasCompletePokemonPassiveEvidence(evidence), false, "missing, contradictory or additional Abilities cannot borrow whole-passive completeness");
    assert.equal(evidence.hp, 90, "passive text uncertainty leaves independently agreed printed HP visible");
    assert.equal(isCardDefinition({ ...drakloakReviewed, abilities }), true, "a stale certificate does not discard otherwise-valid source facts");
    assert.equal(hasCompletePokemonPassiveEvidence({ ...drakloakEvidence, candidates: [{ ...drakloakReviewed, abilities }] }), false);
    assert.equal(applyReviewedPokemonRuleBox({ ...drakloakReviewed, abilities }).passiveEvidence, undefined);
    assert.equal(isProducedCardDefinition({ ...drakloakReviewed, abilities }), false);
  }
  const completePassive = drakloakReviewed.passiveEvidence;
  assert(completePassive?.status === "verified_complete");
  assert.equal(isCardDefinition({ ...drakloakReviewed, passiveEvidence: { ...completePassive, additionalTraits: "unknown" } }), false);
  const forgedPassive = { ...drakloakReviewed, passiveEvidence: { ...completePassive, provenance: { ...completePassive.provenance, sourceUrl: "https://untrusted.invalid/scan" } } };
  assert.equal(isCardDefinition(forgedPassive), true);
  assert.equal(hasCompletePokemonPassiveEvidence({ ...drakloakEvidence, candidates: [forgedPassive] }), false);
  assert.deepEqual(drakloakReviewed.additionalPassiveTraits, []);
  for (const additionalPassiveTraits of [null, undefined]) {
    assert.equal(hasCompletePokemonPassiveEvidence({ ...drakloakEvidence, candidates: [{ ...drakloakReviewed, additionalPassiveTraits }] }), false, "missing trait fingerprint cannot borrow a stale certificate");
  }
  assert.equal(unknownHp.additionalPassiveTraits, undefined);
  const rawTrait = { name: "Printed Trait", text: "Captured intrinsic text." };
  const normalizedTrait = normalizeTcgdexCard({ id: "synthetic-2", localId: "2", name: "Seedling", category: "Pokemon", ancientTrait: rawTrait, set: { id: "synthetic" } }, { id: "synthetic" }, crispin.syncedAt);
  assert.deepEqual(normalizedTrait.additionalPassiveTraits, [{ ...rawTrait, type: "Ancient Trait" }]);
  assert.equal(normalizedTrait.passiveEvidence, undefined);
  assert.throws(() => normalizeTcgdexCard({ id: "synthetic-2", localId: "2", name: "Seedling", category: "Pokemon", ancientTrait: rawTrait, additionalPassiveTraits: [], set: { id: "synthetic" } }, { id: "synthetic" }, crispin.syncedAt), /contradictory/);
  const rawMarked = normalizeTcgdexCard({ id: "synthetic-2", localId: "2", name: "Seedling", category: "Pokemon", regulationMark: "j", set: { id: "synthetic" } }, { id: "synthetic" }, crispin.syncedAt);
  assert.equal(rawMarked.regulationMark, "J");
  assert.equal(rawMarked.rawRegulationMark, "j");
  const rawEnergy = normalizeTcgdexCard({ id: "synthetic-3", localId: "3", name: "Basic Fire Energy", category: "Energy", energyType: "Normal", set: { id: "synthetic" } }, { id: "synthetic" }, crispin.syncedAt);
  assert.equal(rawEnergy.energyType, "Normal");
  assert.equal(isProducedCardDefinition(rawEnergy), true);
  const markSet = { id: "synthetic", releaseDate: "2026-01-01" };
  const missingMark = { id: "synthetic-2", localId: "2", name: "Seedling", category: "Pokemon", hp: 70,
    stage: "Basic", types: ["Grass"], regulationMark: null, set: { id: "synthetic" },
    attacks: [{ name: "Tap", effect: "", damage: "10", cost: ["Grass"] }] };
  const restMarked = { ...missingMark, regulationMark: "j", attacks: [{ ...missingMark.attacks[0], damage: 10 }], updated: "2026-01-01T00:00:00Z" };
  const completeMark = applyTcgdexRegulationMarkCompletion(missingMark, restMarked, markSet, crispin.syncedAt, normalizeTcgdexCard);
  const completedMarkDefinition = normalizeTcgdexCard(completeMark, markSet, crispin.syncedAt);
  assert.equal(completedMarkDefinition.regulationMark, "J");
  assert.equal(completedMarkDefinition.rawRegulationMark, "j");
  assert.equal(completedMarkDefinition.regulationMarkProvenance?.suppliedRegulationMark, "j");
  assert.equal(completedMarkDefinition.regulationEvidence, undefined, "community source text is not reviewed scanned mark evidence");
  assert.equal(isProducedCardDefinition(completedMarkDefinition), true);
  assert.deepEqual(completedMarkDefinition.attacks, normalizeTcgdexCard(missingMark, markSet, crispin.syncedAt).attacks, "mark-only supplementation preserves primary operative facts");
  assert.equal(missingMark.regulationMark, null, "completion preserves the original captured payload");
  for (const regulationMark of ["h"]) assert.equal(needsTcgdexRegulationMarkCompletion({ ...missingMark, regulationMark }, markSet), false, "already supplied single-letter marks are preserved without unqueried disagreement claims");
  for (const releaseDate of ["2020-02-06"]) assert.equal(needsTcgdexRegulationMarkCompletion(missingMark, { ...markSet, releaseDate }), false, "pre-mark historical rows are outside the completion request budget");
  assert.equal(needsTcgdexRegulationMarkCompletion({ ...missingMark, category: "Energy", name: "Basic Grass Energy", energyType: "Normal", attacks: [] }, markSet), false);
  for (const regulationMark of [null, "None"]) assert.equal(applyTcgdexRegulationMarkCompletion(missingMark, { ...restMarked, regulationMark }, markSet, crispin.syncedAt, normalizeTcgdexCard), missingMark, "missing REST marks remain unknown");
  for (const regulationMark of ["invalid", "K", {}]) assert.throws(() => applyTcgdexRegulationMarkCompletion(missingMark, { ...restMarked, regulationMark }, markSet, crispin.syncedAt, normalizeTcgdexCard), /regulation mark/);
  for (const mismatch of [{ id: "synthetic-3" }, { localId: "02" }, { set: { id: "other" } }, { name: "Seedling ex" }, { category: "Trainer" }, { hp: 80 }, { types: ["Fire"] }, { attacks: [{ ...restMarked.attacks[0], damage: 20 }] }, { attacks: [{ ...restMarked.attacks[0], effect: "Different supplied text." }] }]) {
    assert.throws(() => applyTcgdexRegulationMarkCompletion(missingMark, { ...restMarked, ...mismatch }, markSet, crispin.syncedAt, normalizeTcgdexCard), /identity|Conflicting/);
  }
  assert.throws(() => applyTcgdexRegulationMarkCompletion({ ...missingMark, effect: "Supplied rules." }, { ...restMarked, rules: ["Contradictory rules."] }, markSet, crispin.syncedAt, normalizeTcgdexCard), /Conflicting/);
  for (const provenance of [{ sourceCardId: "other-2" }, { sourceUrl: "https://untrusted.invalid/card" }, { payloadSha256: "bad" }, { fetchedAt: "invalid" }, { originalRegulationMark: "H" }, { suppliedRegulationMark: "I" }]) {
    assert.equal(isProducedCardDefinition({ ...completedMarkDefinition, regulationMarkProvenance: { ...completedMarkDefinition.regulationMarkProvenance!, ...provenance } }), false, "completion receipts must bind field, printing and public source");
  }
  const captureDirectory = mkdtempSync(join(tmpdir(), "card-definition-source-"));
  t.after(() => rmSync(captureDirectory, { recursive: true, force: true }));
  const syncModule = new URL("../lib/card-definition-catalog/sync.mjs", import.meta.url);
  const publicationStub = `data:text/javascript,${encodeURIComponent('export async function readSavedFormatInventory() { return ["SVI-JTG", ""]; } export async function publishCardDefinitionGeneration() {     if (process.env.CARD_DEFINITION_FIXTURE_PUBLISH === "true") return;     const error = new Error("Publication held by fixture guard");     if (process.env.CARD_DEFINITION_FIXTURE_METADATA) {       error.code = "REFERENCE_PUBLICATION_REGRESSION";       error.referencePublication = { activeGenerationId: "11111111-1111-4111-8111-111111111111", activeCompletedAt: "2026-10-04T00:00:00Z", activeRetainedOn: null,         proposedRetainedOn: "2026-10-04T01:00:00Z", reasons: [{ kind: "retained_printing_removed", sourceCardId: "synthetic-2", extra: "private-detail" }], extra: "private-detail" };       if (process.env.CARD_DEFINITION_FIXTURE_METADATA === "invalid") error.referencePublication.activeCompletedAt = "private-client-detail";     }     throw error;   }')}`;
  const producerHook = `function resolve(specifier, context, nextResolve) {
    if (context.parentURL === ${JSON.stringify(syncModule.href)} && specifier === "./publication.mjs") return { url: ${JSON.stringify(publicationStub)}, shortCircuit: true };
    return nextResolve(specifier, context);
  }`;
  const producerPreload = `data:text/javascript,${encodeURIComponent(`import * as module from "node:module";
    if (module.registerHooks) module.registerHooks({ resolve: ${producerHook} });
    else module.register(${JSON.stringify(`data:text/javascript,${encodeURIComponent(`export ${producerHook}`)}`)}, ${JSON.stringify(syncModule.href)});`)}`;
  for (const sourceMode of ["error", "transport", "conflict", "reviewed", "dry", "published", "metadata", "invalid-metadata"] as const) {
    const upstreamPath = join(captureDirectory, `${sourceMode}-upstream.json`), retainedPath = join(captureDirectory, `${sourceMode}-retained.json`);
    const producerRunner = `
      import { syncCardDefinitionCatalog } from ${JSON.stringify(syncModule.href)};
      const card = ${JSON.stringify(sourceMode)} === "reviewed" ? { ...${JSON.stringify(missingMark)}, id: "2021swsh-11", localId: "11", name: "Torchic", hp: 60, set: { id: "2021swsh" } } : ${JSON.stringify(missingMark)};
      const rest = { ...card, regulationMark: "j" };
      const set = { id: card.set.id, releaseDate: "2026-01-01", serie: { id: "me" }, cards: [{ id: card.id, name: card.name }], cardCount: { total: 1 } };
      globalThis.fetch = async (url) => {
        let body;
        if (url.endsWith("/v2/en/sets")) body = [{ id: set.id }];
        else if (url.endsWith("/v2/en/sets/" + set.id)) body = set;
        else if (url.endsWith("/v2/graphql")) body = ${JSON.stringify(sourceMode)} === "error" ? { data: { c0: null }, errors: [{ path: ["c0"], message: "schema mismatch" }] } : { data: { c0: card } };
        else if (url.endsWith("/v2/en/cards/" + card.id)) {
          if (${JSON.stringify(sourceMode)} === "transport") throw new Error("Fixture REST transport unavailable");
          body = ${JSON.stringify(sourceMode)} === "conflict" ? { ...rest, hp: 80 } : rest;
        }
        else if (url.endsWith("/sets/en.json")) body = [];
        else throw new Error("Unexpected fixture network request: " + url);
        return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
      };
      try { await syncCardDefinitionCatalog({ dryRun: ${JSON.stringify(sourceMode === "dry")}, outputPath: ${JSON.stringify(retainedPath)}, upstreamOutputPath: ${JSON.stringify(upstreamPath)}, logger: { log() {} } }); console.log("CAPTURE_SUCCESS"); }
      catch (error) {
        if (${JSON.stringify(sourceMode)} === "transport" && error.message === "Fixture REST transport unavailable"
          || ${JSON.stringify(sourceMode)} === "conflict" && error.message.startsWith("Conflicting TCGdex REST hp:")
          || ${JSON.stringify(sourceMode)} === "reviewed" && error.message.startsWith("Conflicting reviewed regulation mark:")) console.log("REFUSED_BEFORE_VALIDATED_OUTPUT");
        else { if (error.message !== "Publication held by fixture guard") throw error; console.log("CAPTURE_BEFORE_PUBLICATION_HOLD"); }
      }
    `;
    const producer = spawnSync(process.execPath, ["--import", producerPreload, "--input-type=module", "--eval", producerRunner], {
      encoding: "utf8", timeout: 10000, maxBuffer: 256 * 1024,
      env: { ...process.env, NODE_OPTIONS: "", SUPABASE_URL: "https://synthetic.invalid", SUPABASE_SERVICE_ROLE_KEY: "fixture-unused", CARD_DEFINITION_FIXTURE_PUBLISH: sourceMode === "published" ? "true" : "false", CARD_DEFINITION_FIXTURE_METADATA: sourceMode === "metadata" ? "valid" : sourceMode === "invalid-metadata" ? "invalid" : "" }
    });
    assert.equal(producer.status, 0, producer.stderr);
    if (sourceMode === "transport" || sourceMode === "conflict" || sourceMode === "reviewed") {
      assert.match(producer.stdout, /REFUSED_BEFORE_VALIDATED_OUTPUT/);
      assert.equal(existsSync(upstreamPath), false, "failed completion never emits a validated generation or reaches publication");
      assert.equal(existsSync(retainedPath), false);
      const failedCapture = JSON.parse(readFileSync(join(`${upstreamPath}.responses`, "capture.json"), "utf8"));
      assert.equal(failedCapture.status, "failed");
      assert.equal(failedCapture.failurePhase, "provider_cards");
      assert.equal(failedCapture.errorClass, "Error");
      assert.equal(failedCapture.message, undefined, "error capture does not serialize client messages or credentials");
      continue;
    }
    assert.match(producer.stdout, sourceMode === "dry" || sourceMode === "published" ? /CAPTURE_SUCCESS/ : /CAPTURE_BEFORE_PUBLICATION_HOLD/);
    const captured = JSON.parse(readFileSync(upstreamPath, "utf8"));
    assert.equal(captured[0].regulationMark, "J");
    assert.equal(isProducedCardDefinition(captured[0]), true);
    assert.equal(existsSync(`${retainedPath}.generation.json`), true, "a rejected publisher leaves validated rows and scope inspectable");
    const responses = `${upstreamPath}.responses`, index = JSON.parse(readFileSync(join(responses, "capture.json"), "utf8"));
    assert.equal(index.status, sourceMode === "dry" ? "dry_run_validated" : sourceMode === "published" ? "published" : "failed");
    if (sourceMode !== "dry" && sourceMode !== "published") {
      assert.equal(index.failurePhase, sourceMode === "metadata" ? "pre_staging_guard" : "publication");
      assert.equal(index.errorClass, "Error");
      if (sourceMode === "metadata") {
        assert.equal(index.referencePublication.activeGenerationId, "11111111-1111-4111-8111-111111111111");
        assert.deepEqual(index.referencePublication.reasons, [{ kind: "retained_printing_removed", sourceCardId: "synthetic-2" }]);
        assert.equal(index.referencePublication.extra, undefined);
      } else assert.equal(index.referencePublication, undefined, "malformed or arbitrary error data stays out of the public capture");
      assert.doesNotMatch(JSON.stringify(index), /private-detail|private-client-detail|fixture-unused/);
    }
    assert.equal(index.parsedJsonOnly, true);
    const graph = JSON.parse(readFileSync(join(responses, "graphql-synthetic-2.json"), "utf8"));
    if (sourceMode === "error") assert.equal(graph.payload.data.c0, null, "error fallback archives the failed alias without replacing it");
    if (sourceMode === "metadata") assert.equal(graph.payload.data.c0.regulationMark, null, "raw sparse payload is archived before completion and remains available after the structured publication hold");
    const responseBytes = readFileSync(join(responses, `rest-${sourceMode === "error" ? "error" : "mark"}-synthetic-2.json`));
    assert.equal(JSON.parse(responseBytes.toString()).regulationMark, "j");
    if (sourceMode !== "error") assert.equal(captured[0].regulationMarkProvenance.payloadSha256, createHash("sha256").update(responseBytes).digest("hex"), "field receipt binds the exact stored parsed payload bytes");
  }
  const torchic = definition({ sourceCardId: "2021swsh-11", setId: "2021swsh", localId: "11", name: "Torchic", hp: 60, stage: "Basic", regulationMark: null, sourceUrl: "https://api.tcgdex.net/v2/en/cards/2021swsh-11" });
  const reviewedMark = applyReviewedRegulationMark(torchic);
  assert.equal(hasVerifiedPrintedRegulationMarkAbsence(torchic), false);
  assert.equal(hasVerifiedPrintedRegulationMarkAbsence(reviewedMark), true);
  assert.equal(reviewedMark.hp, 60);
  assert.equal(reviewedMark.attacks, torchic.attacks);
  assert.equal(isProducedCardDefinition(reviewedMark), true);
  assert.equal(applyReviewedRegulationMark({ ...torchic, regulationMark: "H" }).regulationEvidence, undefined);
  assert.equal(hasVerifiedPrintedRegulationMarkAbsence({ ...reviewedMark, regulationMark: "H" }), false);
  const forgedMark = { ...reviewedMark, regulationEvidence: { ...reviewedMark.regulationEvidence!, provenance: { ...(reviewedMark.regulationEvidence?.status !== "unknown" ? reviewedMark.regulationEvidence?.provenance : {}), scanSha256: "0".repeat(64) } } };
  assert.equal(isCardDefinition(forgedMark), true);
  assert.equal(isProducedCardDefinition(forgedMark), false);
  assert.equal(hasVerifiedPrintedRegulationMarkAbsence(forgedMark), false);
  const workflow = readFileSync(new URL("../.github/workflows/sync-card-definitions.yml", import.meta.url), "utf8");
  assert.match(workflow, /--upstream-output "\$RUNNER_TEMP\/card-definitions-upstream\.json" --output "\$RUNNER_TEMP\/card-definitions-retained\.json"/);
  assert.match(workflow, /name: Retain validated public reference capture\s+if: always\(\)/);
  assert.match(workflow, /card-definitions-upstream\.json\.responses/);
  assert.match(workflow, /retention-days: 14/);
  const cli = new URL("../sync-card-definition-catalog.mjs", import.meta.url);
  const syncStub = `data:text/javascript,${encodeURIComponent('export async function syncCardDefinitionCatalog(options) { console.log("CLI_SYNC_ARGS:" + JSON.stringify(options)); }')}`;
  const resolveHook = `function resolve(specifier, context, nextResolve) {
    if (context.parentURL === ${JSON.stringify(cli.href)} && specifier === "./lib/card-definition-catalog/sync.mjs") return { url: ${JSON.stringify(syncStub)}, shortCircuit: true };
    return nextResolve(specifier, context);
  }`;
  const hookModule = `data:text/javascript,${encodeURIComponent(`export ${resolveHook}`)}`;
  const preload = `data:text/javascript,${encodeURIComponent(`import * as module from "node:module";
    if (module.registerHooks) module.registerHooks({ resolve: ${resolveHook} });
    else module.register(${JSON.stringify(hookModule)}, ${JSON.stringify(cli.href)});`)}`;
  const runCli = (options: string[]) => spawnSync(process.execPath, ["--import", preload, fileURLToPath(cli), ...options], {
    encoding: "utf8", timeout: 5000, maxBuffer: 256 * 1024, env: { ...process.env, NODE_OPTIONS: "" }
  });
  for (const options of [["--upstream-output", "--dry-run"], ["--dry-run", "--upstream-output", "--output", "safe.json"],
    ["--output", "--dry-run"], ["--dry-run", "--output"], ["--upstream-output", ""],
    ["--output", "first.json", "--output", "second.json"], ["--unknown"], ["--"], ["--upstream-output=private.json"], ["--output", "-retained.json"]]) {
    const result = runCli(options);
    assert.equal(result.error, undefined);
    assert.notEqual(result.status, 0, "invalid paths/options refuse before the sync adapter can run");
    assert.match(result.stderr, /Missing path|Duplicate option|Usage:/);
    assert.doesNotMatch(result.stdout, /CLI_SYNC_ARGS:/, "invalid CLI input cannot start provider or publication work");
  }
  for (const options of [["--dry-run", "--upstream-output", "private.json", "--output", "retained.json"],
    ["--output", "retained.json", "--upstream-output", "private.json", "--dry-run"]]) {
    const result = runCli(options);
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    const argsLine = result.stdout.split("\n").find((line) => line.startsWith("CLI_SYNC_ARGS:"));
    assert.ok(argsLine);
    assert.deepEqual(JSON.parse(argsLine.slice("CLI_SYNC_ARGS:".length)), { dryRun: true, outputPath: "retained.json", upstreamOutputPath: "private.json" }, "path parsing cannot consume the original dry-run flag");
  }
  const defaultMode = runCli([]);
  assert.equal(defaultMode.status, 0, defaultMode.stderr);
  assert.match(defaultMode.stdout, /CLI_SYNC_ARGS:{"dryRun":false}/, "the ordinary controlled publication mode still requires no dry-run flag");
  const retainedCard = definition({ regulationMark: "H", setReleaseDate: "2024-03-22", syncedAt: "2026-10-04T00:00:00.000Z" });
  const olderCard = definition({ sourceCardId: "synthetic-4", localId: "4", regulationMark: "D", setReleaseDate: "2020-02-07", syncedAt: retainedCard.syncedAt });
  const unknownModern = definition({ sourceCardId: "synthetic-5", localId: "5", regulationMark: null, setReleaseDate: "2026-09-01", syncedAt: retainedCard.syncedAt });
  const sourceHash = "1".repeat(64);
  const scoped = selectRetainedCardDefinitions([retainedCard, olderCard, unknownModern], { savedFormats: ["SVI-POR", ""], retainedOn: "2026-10-04", sourceManifestHash: sourceHash });
  assert.deepEqual(scoped.definitions.map((card) => card.sourceCardId), [retainedCard.sourceCardId], "publication stores the actual eligible pool, never all archive rows");
  assert.equal(scoped.sourceCoverage.scope, "tcgdex-retained-standard-en-physical");
  assert.equal(getCardDefinitionScopeCoverage(scoped.sourceCoverage, "Seedling", { declaredFormat: currentStandardFormat(), playedOn: "2026-10-04" }), "incomplete");
  const exactRetained = { name: retainedCard.name, setId: retainedCard.setId, localId: retainedCard.localId, declaredFormat: currentStandardFormat(), playedOn: "2026-10-04" };
  assert.equal(resolveCardDefinition(buildCardDefinitionIndex(scoped.definitions), exactRetained, "complete", "retained", scoped.sourceCoverage).coverage, "complete", "a retained exact identity is not tainted by omitted unknown printings of the same name");
  assert.equal(resolveCardDefinition(buildCardDefinitionIndex(scoped.definitions), exactRetained, "stale", "retained", scoped.sourceCoverage).coverage, "stale", "exact identity cannot repair stale load coverage");
  assert.equal(getCardDefinitionScopeCoverage(scoped.sourceCoverage, "Independent name", { declaredFormat: currentStandardFormat(), playedOn: "2026-10-04" }), "complete", "an unrelated metadata gap does not taint every card");
  assert.equal(getCardDefinitionScopeCoverage(scoped.sourceCoverage, "Independent name", { declaredFormat: currentStandardFormat(), playedOn: "2026-10-05" }), "complete", "a later game date does not invalidate unrelated retained card information");
  assert.equal(getCardDefinitionScopeCoverage(scoped.sourceCoverage, "Independent name", { declaredFormat: currentStandardFormat() }), "incomplete", "an undated name-domain query cannot prove snapshot freshness");
  assert.equal(getCardDefinitionSnapshotCoverage({ ...scoped.sourceCoverage, retainedOn: "invalid" }, "2026-10-04"), "incomplete");
  assert.equal(getCardDefinitionSnapshotCoverage(scoped.sourceCoverage, "2026-02-30"), "incomplete");
  assert.equal(getCardDefinitionSnapshotCoverage(scoped.sourceCoverage, "2026-10-04T23:00:00-12:00"), "complete", "valid later UTC game dates remain supported by retained information");
  assert.equal(getCardDefinitionSnapshotCoverage(scoped.sourceCoverage, "2026-10-04T01:00:00+02:00"), "complete", "UTC conversion does not hide a game within the captured inventory");
  assert.equal(getCardDefinitionSnapshotCoverage(scoped.sourceCoverage, "2026-10-04T25:00:00Z"), "incomplete", "invalid timestamps cannot borrow their sliced calendar prefix");
  assert.equal(getCardDefinitionSnapshotCoverage(scoped.sourceCoverage, "2026-10-04T12:00:00"), "incomplete", "timezone-free timestamps cannot establish the query day");
  assert.equal(getCardDefinitionSnapshotCoverage(undefined), "complete", "legacy omitted scope metadata retains compatibility");
  assert.equal(resolveCardDefinition(buildCardDefinitionIndex(scoped.definitions), { ...exactRetained, playedOn: "2026-10-05" }, "complete", "retained", scoped.sourceCoverage).coverage, "complete", "an exact immutable printing remains known despite later unrelated reprints");
  assert.equal(resolveCardDefinition(buildCardDefinitionIndex(scoped.definitions), { ...exactRetained, playedOn: "2026-10-05" }, "incomplete", "retained", scoped.sourceCoverage).coverage, "incomplete", "an exact printing cannot repair incomplete transport");
  assert.equal(getCardDefinitionScopeCoverage(scoped.sourceCoverage, "Seedling", { declaredFormat: currentStandardFormat(), playedOn: "2026-08-01" }), "incomplete", "a later physical date alone cannot prove an unverified printing was digitally unavailable");
  assert.equal(getCardDefinitionScopeCoverage(scoped.sourceCoverage, "Seedling", { declaredFormat: currentStandardFormat(), playedOn: "2026-10-04", effectNames: ["Different observed effect"] }), "complete", "complete supplied named effects preserve full-source narrowing");
  const mappedFuture = { ...unknownModern, sourceCardId: "me01-001", setId: "me01", localId: "001", setReleaseDate: "2025-09-26" };
  const mappedScope = selectRetainedCardDefinitions([retainedCard, mappedFuture], { savedFormats: ["SVI-POR"], retainedOn: "2026-10-04", sourceManifestHash: sourceHash });
  assert.equal(getCardDefinitionScopeCoverage(mappedScope.sourceCoverage, "Seedling", { declaredFormat: "SVI-POR", playedOn: "2025-09-25T16:00:00Z" }), "complete", "an exact announced launch instant can exclude a future digital printing");
  assert.equal(getCardDefinitionScopeCoverage(mappedScope.sourceCoverage, "Seedling", { declaredFormat: "SVI-POR", playedOn: "2025-09-25T17:00:00Z" }), "incomplete");
  assert.equal(getCardDefinitionScopeCoverage(mappedScope.sourceCoverage, "Seedling", { declaredFormat: "SVI-POR", playedOn: "2025-09-25" }), "incomplete", "a date-only launch-day game has no known side of the announced instant");
  const preLaunch = selectRetainedCardDefinitions([retainedCard, mappedFuture], { savedFormats: ["SVI-POR"], retainedOn: "2025-09-25T16:00:00Z", sourceManifestHash: sourceHash });
  assert.equal(getCardDefinitionScopeCoverage(preLaunch.sourceCoverage, "Seedling", { declaredFormat: "SVI-POR", playedOn: "2025-09-25T17:00:00Z" }), "incomplete", "known future exclusions must remain indexed for games later on the snapshot day");
  if (mappedScope.sourceCoverage.scope === "tcgdex-retained-standard-en-physical") {
    const legacyMappedScope = structuredClone(mappedScope.sourceCoverage);
    for (const byName of Object.values(legacyMappedScope.unverifiedPrintingsByFormat)) for (const gaps of Object.values(byName)) for (const gap of gaps) delete gap.setId;
    assert.equal(getCardDefinitionScopeCoverage(legacyMappedScope, "Seedling", { declaredFormat: "SVI-POR", playedOn: "2025-09-25T16:00:00Z" }), "incomplete", "legacy missing set IDs cannot borrow an exact launch mapping");
  }
  const launchPrinting = { ...mappedFuture, regulationMark: "I" };
  const storageBeforeLaunch = selectRetainedCardDefinitions([retainedCard, launchPrinting], { savedFormats: ["SVI-POR"], retainedOn: "2025-09-25T16:00:00Z", sourceManifestHash: sourceHash });
  const storageAtLaunch = selectRetainedCardDefinitions([retainedCard, launchPrinting], { savedFormats: ["SVI-POR"], retainedOn: "2025-09-25T17:00:00Z", sourceManifestHash: sourceHash });
  assert.deepEqual(storageBeforeLaunch.definitions.map((card) => card.sourceCardId), [retainedCard.sourceCardId]);
  assert.deepEqual(storageAtLaunch.definitions.map((card) => card.sourceCardId), [retainedCard.sourceCardId, launchPrinting.sourceCardId], "storage eligibility uses the actual producer instant after the announced digital launch");
  assert.throws(() => selectRetainedCardDefinitions([retainedCard], { retainedOn: "2026-10-04T25:00:00Z" }), /Invalid reference retention date/);
  const unknownG = selectRetainedCardDefinitions([retainedCard, { ...unknownModern, setReleaseDate: "2023-04-01" }], { savedFormats: ["SVI-POR"], retainedOn: "2026-10-04", sourceManifestHash: sourceHash });
  assert.equal(getCardDefinitionScopeCoverage(unknownG.sourceCoverage, "Seedling", { declaredFormat: "SVI-POR", playedOn: "2025-09-01" }), "incomplete");
  assert.equal(getCardDefinitionScopeCoverage(unknownG.sourceCoverage, "Seedling", { declaredFormat: "SVI-POR", playedOn: "2026-10-04" }), "complete", "a stale expansion label uses the actual-date H diagnostics while G remains stored for genuine older games");
  assert.equal(getCardDefinitionScopeCoverage(unknownG.sourceCoverage, "Seedling", { declaredFormat: "TEF-NEW", playedOn: "2026-10-04" }), "complete", "supported Standard labels reuse the retained effective floor without requiring picker membership");
  assert.equal(getCardDefinitionScopeCoverage(unknownG.sourceCoverage, "Seedling", { declaredFormat: "BRS-BRS", playedOn: "2024-09-01" }), "incomplete", "an unretained older floor remains an explicit scope gap");
  const unknownEffects = selectRetainedCardDefinitions([retainedCard, { ...unknownModern, attacks: [], abilities: [] }], { savedFormats: [currentStandardFormat()], retainedOn: "2026-10-04", sourceManifestHash: sourceHash });
  assert.equal(getCardDefinitionScopeCoverage(unknownEffects.sourceCoverage, "Seedling", { declaredFormat: currentStandardFormat(), playedOn: "2026-10-04", effectNames: ["Different observed effect"] }), "incomplete", "missing effect inventory cannot establish absence");
  assert.equal(getCardDefinitionScopeCoverage(scoped.sourceCoverage, "Seedling", { declaredFormat: "" }), "incomplete");
  assert.equal(getCardDefinitionScopeCoverage(scoped.sourceCoverage, "Seedling", { declaredFormat: "Expanded" }), "incomplete");
  assert.equal(getCardDefinitionScopeCoverage(undefined, "Seedling"), "complete", "legacy full generations stay compatible");
  const withoutGaps = selectRetainedCardDefinitions([retainedCard, olderCard], { savedFormats: [currentStandardFormat()], retainedOn: retainedCard.syncedAt, sourceManifestHash: sourceHash });
  const calls: Array<{ table: string; data?: unknown }> = [];
  const activeCompletedAt = "2026-10-04T00:03:00.000Z";
  let formatReads = 0, changedFormats = false;
  let activeSnapshot: { generationId: string; sourceCoverage: typeof withoutGaps.sourceCoverage; definitions: ReturnType<typeof definition>[] } | null = null;
  let pointerReads = 0, changedPointerAt = 0, pointerFailure = false, incompleteGeneration = false, rowCountChange = false, duplicateRows = false, truncatedPage = false, completedWithoutPointer = false;
  const client = {
    from(table: string) {
      return {
        select() { return this; }, order() { return this; }, eq() { return this; }, not() { return this; },
        async limit() { return { data: null, count: completedWithoutPointer ? 1 : 0, error: null }; },
        async range(start: number, end: number) {
          if (table === "logs") { formatReads++; return { data: [{ format: changedFormats && formatReads > 1 ? "SVI-POR" : currentStandardFormat() }], count: 1, error: null }; }
          const definitions = activeSnapshot?.definitions ?? [];
          return { data: definitions.slice(start, truncatedPage ? start + 1 : end + 1).map((card, index) => ({ generation_id: activeSnapshot?.generationId, source_card_id: duplicateRows && index ? definitions[0].sourceCardId : card.sourceCardId,
            definition: duplicateRows && index ? definitions[0] : card })), count: definitions.length + (rowCountChange && start > 0 ? 1 : 0), error: null };
        },
        async maybeSingle() {
          pointerReads++;
          return { data: changedPointerAt === pointerReads ? { generation_id: "concurrent-generation" } : activeSnapshot ? { generation_id: activeSnapshot.generationId } : null,
            error: pointerFailure ? { message: "pointer unavailable" } : null };
        },
        async single() {
          return { data: table === "card_definition_active" ? { generation_id: activeSnapshot?.generationId } : {
            id: activeSnapshot?.generationId, completed_at: incompleteGeneration ? null : activeCompletedAt,
            expected_count: activeSnapshot?.definitions.length, source_coverage: activeSnapshot?.sourceCoverage,
          }, error: null };
        },
        async insert(data: unknown) { calls.push({ table, data }); return { error: null }; },
      };
    },
    async rpc(name: string) { calls.push({ table: name }); activeSnapshot = { generationId: publishInput.generationId, sourceCoverage: publishInput.sourceCoverage, definitions: publishInput.definitions }; return { error: null }; },
  };
  const publishInput = { generationId: "retained-generation", sourceManifestHash: sourceHash, sourceCoverage: withoutGaps.sourceCoverage, definitions: withoutGaps.definitions, upstreamDefinitions: [retainedCard, olderCard], expectedSavedFormats: [currentStandardFormat()] };
  await publishCardDefinitionGeneration(client, publishInput);
  const generationInsert = calls.find((call) => call.table === "card_definition_generations")?.data as { expected_count: number; source_manifest_hash: string };
  assert.equal(generationInsert.expected_count, 1);
  assert.equal(generationInsert.source_manifest_hash, sourceHash);
  assert.equal((calls.find((call) => call.table === "card_definition_catalog")?.data as unknown[]).length, 1);
  assert.equal(calls.filter((call) => call.table === "publish_card_definition_generation").length, 1);
  calls.length = 0; formatReads = 0; changedFormats = true;
  await assert.rejects(publishCardDefinitionGeneration(client, publishInput), /remains unpublished/);
  assert.equal(calls.some((call) => call.table === "publish_card_definition_generation"), false, "a newly saved older format prevents publication of the staged scope");
  await assert.rejects(publishCardDefinitionGeneration(client, { ...publishInput, definitions: [olderCard] }), /Invalid retained generation|Empty retained reference pool/);
  if (scoped.sourceCoverage.scope === "tcgdex-retained-standard-en-physical") {
    const legacyProducedScope = structuredClone({ ...scoped.sourceCoverage, retainedOn: retainedCard.syncedAt });
    for (const byName of Object.values(legacyProducedScope.unverifiedPrintingsByFormat)) for (const gaps of Object.values(byName)) for (const gap of gaps) delete gap.setId;
    const stagedCalls = calls.length;
    await assert.rejects(publishCardDefinitionGeneration(client, { ...publishInput, sourceCoverage: legacyProducedScope, definitions: scoped.definitions, upstreamDefinitions: [retainedCard, olderCard, unknownModern], expectedSavedFormats: ["SVI-POR", ""] }), /Invalid retained generation/);
    assert.equal(calls.length, stagedCalls, "strict publication rejects missing new diagnostics before any write");
  }
  const writesBeforeInvalidCapture = calls.length;
  if (publishInput.sourceCoverage.scope === "tcgdex-retained-standard-en-physical") {
    await assert.rejects(publishCardDefinitionGeneration(client, { ...publishInput, sourceCoverage: { ...publishInput.sourceCoverage, retainedOn: "2026-10-05T00:00:00.000Z" } }), /Invalid retained generation capture/);
  }
  await assert.rejects(publishCardDefinitionGeneration(client, { ...publishInput, upstreamDefinitions: [retainedCard, { ...olderCard, syncedAt: "2026-10-04T00:01:00.000Z" }] }), /Invalid upstream generation capture/);
  await assert.rejects(publishCardDefinitionGeneration(client, { ...publishInput, upstreamDefinitions: [retainedCard, { ...olderCard, syncedAt: "2026-10-04T25:00:00Z" }] }), /Invalid upstream generation capture/);
  assert.equal(calls.length, writesBeforeInvalidCapture, "forged horizons and mixed source instants fail before staging");
  changedFormats = false;
  const baselineSnapshot = { generationId: "active-retained", sourceCoverage: withoutGaps.sourceCoverage, definitions: withoutGaps.definitions };
  const proposalFor = (upstreamDefinitions: ReturnType<typeof definition>[], savedFormats = publishInput.expectedSavedFormats) => {
    const selected = selectRetainedCardDefinitions(upstreamDefinitions, { savedFormats, retainedOn: retainedCard.syncedAt, sourceManifestHash: sourceHash });
    return { ...publishInput, ...selected, upstreamDefinitions, expectedSavedFormats: savedFormats };
  };
  const noStaging = async (proposal = publishInput, expected: RegExp = /held before staging/) => {
    calls.length = 0; formatReads = 0; pointerReads = 0;
    await assert.rejects(publishCardDefinitionGeneration(client, proposal), expected);
    assert.equal(calls.length, 0, "a failed baseline or regression check must stage no rows and call no publication RPC");
  };
  activeSnapshot = baselineSnapshot; pointerFailure = true;
  await noStaging(publishInput, /pointer read failed/); pointerFailure = false;
  activeSnapshot = null; completedWithoutPointer = true;
  await noStaging(publishInput, /pointer is missing/); completedWithoutPointer = false; activeSnapshot = baselineSnapshot;
  incompleteGeneration = true;
  await noStaging(publishInput, /incomplete or malformed/); incompleteGeneration = false;
  changedPointerAt = 2;
  await noStaging(publishInput, /snapshot changed before staging/); changedPointerAt = 0;
  calls.length = 0; formatReads = 0; pointerReads = 0;
  await assert.rejects(publishCardDefinitionGeneration(client, proposalFor([retainedCard])), (error) => {
    assert(error instanceof Error);
    const hold = error as ReferencePublicationHoldError;
    assert.equal(hold.code, "REFERENCE_PUBLICATION_REGRESSION");
    assert.deepEqual(hold.referencePublication, {
      activeGenerationId: baselineSnapshot.generationId,
      activeCompletedAt,
      activeRetainedOn: retainedCard.syncedAt,
      proposedRetainedOn: retainedCard.syncedAt,
      reasons: [{ kind: "upstream_count_shrink", before: 2, after: 1 }],
    });
    return true;
  });
  assert.equal(calls.length, 0, "structured public hold metadata does not stage rows or activate a generation");
  await noStaging(proposalFor([{ ...retainedCard, sourceCardId: "replacement-printing", localId: "99" }, olderCard]), /retained_printing_removed/);
  await noStaging(proposalFor([retainedCard, olderCard, unknownModern]), /diagnostic_domain_added/);
  for (const withdrawn of [{ ...retainedCard, hp: null }, { ...retainedCard, hp: 90 }, { ...retainedCard, attacks: [{ ...retainedCard.attacks[0], name: "Different supplied attack" }] }])
    await noStaging(proposalFor([withdrawn, olderCard]), /operative_field_regression/);
  const manyDefinitions = Array.from({ length: 501 }, (_, index) => ({ ...retainedCard, sourceCardId: `synthetic-page-${index}`, localId: String(index + 1) }));
  const manySelected = selectRetainedCardDefinitions(manyDefinitions, { savedFormats: publishInput.expectedSavedFormats, retainedOn: retainedCard.syncedAt, sourceManifestHash: sourceHash });
  activeSnapshot = { generationId: "active-paginated", ...manySelected }; rowCountChange = true;
  await noStaging(publishInput, /row inventory changed or failed/); rowCountChange = false;
  duplicateRows = true;
  await noStaging(publishInput, /malformed or duplicated/); duplicateRows = false;
  truncatedPage = true;
  await noStaging(publishInput, /pagination is incomplete/); truncatedPage = false;
  activeSnapshot = baselineSnapshot; changedPointerAt = 3; calls.length = 0; formatReads = 0; pointerReads = 0;
  await assert.rejects(publishCardDefinitionGeneration(client, publishInput), /Active reference changed.*remains unpublished/);
  assert(calls.some((call) => call.table === "card_definition_catalog"));
  assert.equal(calls.some((call) => call.table === "publish_card_definition_generation"), false, "a changed pointer after staging prevents activation"); changedPointerAt = 0;
  const freeAttack = { ...retainedCard, attacks: [{ ...retainedCard.attacks[0], cost: [] }] };
  activeSnapshot = { ...baselineSnapshot, definitions: [freeAttack] };
  await noStaging(proposalFor([{ ...freeAttack, attacks: [{ ...freeAttack.attacks[0], cost: ["Fire"] }] }, olderCard]), /operative_field_regression/);
  await noStaging(proposalFor([{ ...freeAttack, attacks: [{ ...freeAttack.attacks[0], cost: null }] }, olderCard]), /operative_field_regression/);
  activeSnapshot = baselineSnapshot;
  const knownAdditionAndEnrichment = proposalFor([{ ...retainedCard, attacks: [{ ...retainedCard.attacks[0], text: "Supplied previously missing card text." }],
    abilities: [{ name: "Supplied Ability", text: "Supplied intrinsic text.", type: "Ability" }], sourceUpdatedAt: "2026-10-04", imageUrl: "https://assets.tcgdex.net/en/sv/synthetic/1/high.webp" },
    olderCard, { ...retainedCard, sourceCardId: "new-legal-printing", localId: "99" }]);
  assert.deepEqual(getCardDefinitionPublicationRegressions(baselineSnapshot, knownAdditionAndEnrichment), [], "legal additions, unknown intrinsic fields and omitted Ability inventory enrichment, and cosmetic/provenance updates are all allowed");
  const legacyArchive = { definitions: [{ ...retainedCard, attacks: [] }, olderCard], sourceCoverage: { scope: "tcgdex-listed-en-physical" as const, listedPrintings: 2, unlistedSets: [] } };
  assert.deepEqual(getCardDefinitionPublicationRegressions(legacyArchive, publishInput), [], "authorized archive-to-retained shrink excludes old physical aliases and allows enrichment of an omitted attack inventory");
  const changedSuffix = { ...withoutGaps.sourceCoverage, retainedFormats: ["TEF-NEW"], unverifiedPrintingsByFormat: { "TEF-NEW": {} } };
  assert.deepEqual(getCardDefinitionPublicationRegressions(baselineSnapshot, { ...publishInput, sourceCoverage: changedSuffix }), [], "advisory suffix changes preserve the same retained floor");
  const historical = selectRetainedCardDefinitions([retainedCard, olderCard], { savedFormats: ["SVI-POR", currentStandardFormat()], retainedOn: retainedCard.syncedAt, sourceManifestHash: sourceHash });
  assert(getCardDefinitionPublicationRegressions({ generationId: "active-historical", ...historical }, publishInput).some((reason) => reason.kind === "retained_floor_removed"), "saved historical floors cannot silently disappear");
  if (scoped.sourceCoverage.scope === "tcgdex-retained-standard-en-physical") {
    const widened = structuredClone(scoped.sourceCoverage);
    for (const byName of Object.values(widened.unverifiedPrintingsByFormat)) for (const gaps of Object.values(byName)) for (const gap of gaps) gap.effectNames = null;
    assert(getCardDefinitionPublicationRegressions({ definitions: scoped.definitions, sourceCoverage: scoped.sourceCoverage }, { definitions: scoped.definitions, sourceCoverage: widened }).some((reason) => reason.kind === "diagnostic_domain_changed"), "same-ID diagnostic loss is detected as well as new IDs");
  }
  const diagnosticBaseline = { ...proposalFor([retainedCard, olderCard, unknownModern]), generationId: "active-diagnostic" };
  activeSnapshot = diagnosticBaseline;
  await noStaging(proposalFor([retainedCard, olderCard, { ...olderCard, sourceCardId: "replacement-old-alias", localId: "99" }]), /diagnostic_printing_removed/);
  for (const gapChanged of [{ ...unknownModern, attacks: [] }, { ...unknownModern, attacks: [...unknownModern.attacks, { ...unknownModern.attacks[0], name: "Additional supplied attack" }] }, { ...unknownModern, setReleaseDate: "2026-08-01" }])
    await noStaging(proposalFor([retainedCard, olderCard, gapChanged]), /diagnostic_domain_changed/);
  const resolvedGap = proposalFor([retainedCard, olderCard, { ...unknownModern, regulationMark: "J" }]);
  assert.deepEqual(getCardDefinitionPublicationRegressions(diagnosticBaseline, resolvedGap), [], "fresh exact known-legal metadata resolves an existing gap without carrying forward old rows");
  activeSnapshot = baselineSnapshot;
  const suppliedTrait = [{ name: "Additional printed trait", text: "Supplied intrinsic text.", type: "Ancient Trait" }];
  const withTrait = applyReviewedPokemonRuleBox({ ...drakloakReviewed, additionalPassiveTraits: suppliedTrait });
  assert.equal(withTrait.passiveEvidence, undefined);
  assert.equal(withTrait.additionalPassiveTraits, suppliedTrait);
  assert.equal(hasCompletePokemonPassiveEvidence({ ...drakloakEvidence, candidates: [withTrait] }), false);
  assert.equal(hasCompletePokemonPassiveEvidence({ ...drakloakEvidence, candidates: [drakloakReviewed, drakloak] }), false);
  assert.equal(hasCompletePokemonPassiveEvidence({ ...drakloakEvidence, coverage: "stale" }), false);
  assert.equal(hasCompletePokemonPassiveEvidence(undefined), false);
  assert.equal(applyReviewedPrintingEffects({ ...reviewedSolrock, hp: 90 }).effectProvenance, undefined, "reviewed overlays also require their exact verified identity facts");
  for (const [setId, localId] of [["tk-hs-g", "21"], ["tk-hs-r", "29"]]) {
    const missingMovement = definition({ sourceCardId: `${setId}-${localId}`, sourceUrl: `https://api.tcgdex.net/v2/en/cards/${setId}-${localId}`, setId, localId, name: "Energy Switch", category: "Trainer", hp: null, stage: null, trainerType: null, rules: null, abilities: [], attacks: [] });
    const reviewedMovement = applyReviewedPrintingEffects(missingMovement);
    assert.deepEqual(reviewedMovement.rules, ["Move a basic Energy card attached to 1 of your Pokémon to another of your Pokémon."]);
    assert.equal(reviewedMovement.trainerType, null, "generic printed Trainer labels cannot manufacture a modern Item subtype");
    assert.equal(reviewedMovement.sourceCardId, missingMovement.sourceCardId);
    assert.equal(reviewedMovement.rules === missingMovement.rules, false);
    assert.equal(missingMovement.rules, null, "supplementation cannot mutate the captured primary record");
    assert.deepEqual(reviewedMovement.effectProvenance?.fields, ["rules"]);
    assert.ok(reviewedMovement.effectProvenance?.reviewUrl);
    assert.equal(isCardDefinition(reviewedMovement), true);
    for (const mismatch of [{ localId: "20" }, { setId: "different" }, { name: "Different Trainer" }, { category: "Pokemon" }, { hp: 80 }, { rules: ["Existing supplied text."] }] satisfies Partial<ReturnType<typeof definition>>[]) {
      const conflictingMovement = { ...missingMovement, ...mismatch };
      assert.equal(applyReviewedPrintingEffects(conflictingMovement), conflictingMovement, "reviewed rules require exact identity and cannot replace supplied text");
    }
  }
  const missingPad = definition({ sourceCardId: "30th-126", sourceUrl: "https://api.tcgdex.net/v2/en/cards/30th-126", setId: "30th", localId: "126", name: "Poké Pad", category: "Trainer", trainerType: "Item", hp: null, stage: null, rules: null, abilities: [], attacks: [] });
  const reviewedPad = applyReviewedPrintingEffects(missingPad);
  assert.deepEqual(reviewedPad.rules, ["Search your deck for a Pokémon that doesn’t have a Rule Box, reveal it, and put it into your hand. Then, shuffle your deck. (Pokémon ex, Pokémon V, etc. have Rule Boxes.)"]);
  assert.deepEqual(reviewedPad.effectProvenance?.fields, ["rules"]);
  assert.equal(reviewedPad.effectProvenance?.sourceUrl, "https://assets.tcgdex.net/en/me/30th/126/high.webp");
  assert.equal(missingPad.rules, null);
  for (const mismatch of [{ localId: "125" }, { name: "Different Trainer" }, { trainerType: "Supporter" }, { rules: ["Existing supplied text."] }] satisfies Partial<ReturnType<typeof definition>>[]) {
    const conflictingPad = { ...missingPad, ...mismatch };
    assert.equal(applyReviewedPrintingEffects(conflictingPad), conflictingPad);
  }
  const projected = definitionEffectRows([normalized]);
  assert.deepEqual(projected.map((row) => row.effect_kind), ["supporter"]);
  assert.equal(projected[0].effect_text, crispin.rules?.[0], "trainer rules must survive the full-definition compatibility boundary");
  assert.equal(resolveBattleLogEffectOriginFromRows("PlayerOne played Crispin.", projected), "deck");
  assert.equal(resolveBattleLogEffectOriginFromRows("PlayerOne played Crispin.", definitionEffectRows([{ ...crispin, rules: null }])), null);

  const priorUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const priorKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://synthetic.invalid";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "synthetic-public-key";
  try {
    let failingFamily: "trainer" | "effect" = "trainer";
    let definitionScenario = "";
    let definitionRequests = 0;
    let now = Date.now();
    t.mock.method(Date, "now", () => now);
    const response = (data: unknown, count?: number) => new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json", ...(count === undefined ? {} : { "Content-Range": `0-0/${count}` }) } });
    t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (definitionScenario) {
        const generationId = `synthetic-${definitionScenario}`;
        if (url.pathname.endsWith("card_definition_active")) return response(definitionScenario === "unavailable" ? null : { generation_id: generationId, generation: { id: generationId, completed_at: new Date(now - (definitionScenario === "old" ? 15 * 86400000 : 1000)).toISOString(), source_coverage: { scope: "tcgdex-listed-en-physical", listedPrintings: 501, unlistedSets: [] } } });
        assert.ok(url.pathname.endsWith("card_definition_catalog"));
        definitionRequests++;
        if (definitionScenario === "capped") return response([{ definition: definition() }], 2);
        if (definitionScenario === "malformed") return response([{ definition: { name: "Seedling", hp: 70 } }], 1);
        const offset = Number(url.searchParams.get("offset") ?? 0);
        return response(Array.from({ length: offset === 0 ? 500 : 1 }, (_, index) => ({ definition: definition({ sourceCardId: `synthetic-${offset + index}`, localId: String(offset + index) }) })), 501);
      }
      const effect = url.searchParams.get("effect_kind")?.includes("ability");
      if ((effect ? "effect" : "trainer") === failingFamily) throw new DOMException("Synthetic provider deadline", "AbortError");
      const data = effect ? [rows[3]] : [rows[0]];
      return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json", "Content-Range": "0-0/1" } });
    });
    const titles = ["PlayerOne's Radiant Greninja used Concealed Cards.", "PlayerOne played Boss's Orders."];
    const trainerTimeout = await resolveBattleLogEffectCatalogEvidence(titles);
    assert.equal(trainerTimeout.tags.get(titles[0]), "ability", "a failed trainer lookup cannot erase a complete Pokémon effect response");
    assert.equal(trainerTimeout.tags.has(titles[1]), false);
    failingFamily = "effect";
    const effectTimeout = await resolveBattleLogEffectCatalogEvidence(titles);
    assert.equal(effectTimeout.tags.get(titles[1]), "supporter", "a failed Pokémon lookup cannot erase a complete trainer response");
    assert.equal(effectTimeout.tags.has(titles[0]), false);
    definitionScenario = "complete";
    const paginated = await loadCardDefinitions(["Seedling", "seedling"], undefined, { declaredFormat: "TEF-30C", playedOn: "2026-10-04" });
    assert.equal(paginated.seedling.coverage, "complete");
    assert.equal(paginated.seedling.candidates.length, 501, "all candidate pages must be considered before agreeing HP");
    assert.equal(paginated.seedling.hp, 70);
    assert.equal(definitionRequests, 2);
    const cached = await loadCardDefinitions(["Seedling"]);
    assert.equal(cached.seedling.hp, 70);
    assert.equal(definitionRequests, 2, "a complete generation/name lookup can reuse its cache");
    for (const scenario of ["capped", "malformed", "old", "unavailable"]) {
      now += 6 * 60 * 1000; // Expire both generation and name caches between independent provider states.
      definitionScenario = scenario;
      const unavailable = await loadCardDefinitions(["Seedling"]);
      assert.equal(unavailable.seedling.hp, scenario === "old" ? 70 : null, "catalogue age alone cannot erase existing HP; failed or incomplete loads cannot establish it");
      assert.equal(Boolean(unavailable.seedling.definition), scenario === "old");
      assert.equal(unavailable.seedling.coverage, scenario === "capped" || scenario === "malformed" ? "incomplete" : scenario === "old" ? "complete" : scenario);
    }
  } finally {
    t.mock.restoreAll();
    if (priorUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = priorUrl;
    if (priorKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = priorKey;
  }
});

test("card effect catalog resolves attacks and abilities only when Pokemon and effect match", () => {
  assert.equal(
    resolveBattleLogEffectCatalogTagFromRows(
      "iBerzrk_Network's Budew used Itchy Pollen on JammerUK1993's Budew for 10 damage.",
      rows
    ),
    "attack"
  );
  assert.equal(
    resolveBattleLogEffectCatalogTagFromRows("Radiant Greninja used Concealed Cards.", rows),
    "ability"
  );
  assert.equal(
    resolveBattleLogEffectCatalogTagFromRows("Dudunsparce used Run Away Draw.", rows),
    "ability"
  );
  // Literal titles/detail copied from bd2d55d9; synthetic metadata varies only
  // catalogue-domain contracts, not the saved game's reference answer.
  const psychicDraw = "jax2103's Alakazam used Psychic Draw.";
  const powerfulHand = "jax2103's Alakazam used Powerful Hand.";
  const returnDetail = "- jax2103 moved jax2103's Alakazam to their hand.";
  const first = definition({ name: "Alakazam", regulationMark: "H", setReleaseDate: "2024-05-24", attacks: [],
    abilities: [{ name: "Psychic Draw", type: "Ability", text: "Put a Pokémon from your discard pile into your hand." }] });
  const second = definition({ name: "Alakazam", sourceCardId: "synthetic-powerful-hand", localId: "2", regulationMark: "I", setReleaseDate: "2025-09-26",
    attacks: [{ name: "Powerful Hand", text: "Put a Pokémon from your deck into your hand.", damage: "20", cost: ["Psychic"] }] });
  const context = { declaredFormat: "TEF-30C", playedOn: "2026-10-04" };
  const mixedRaw = resolveCardDefinition(buildCardDefinitionIndex([first, second]), { name: "Alakazam" });
  const mixedResolver = createReplayEffectEvidenceResolver({ alakazam: mixedRaw }, [], context);
  assert.equal(mixedResolver.tag(psychicDraw), "ability");
  assert.equal(mixedResolver.origin(psychicDraw, returnDetail), "discard");
  assert.equal(mixedResolver.tag(powerfulHand), "attack", "different same-name copies are queried independently instead of intersecting their effects");
  assert.equal(mixedResolver.origin(powerfulHand, returnDetail), "deck");
  const bothEffects = { ...first, attacks: [{ ...second.attacks[0], text: "Put a Pokémon from your discard pile into your hand." }] };
  const omitted = definition({ name: "Alakazam", sourceCardId: "synthetic-unknown", localId: "3", regulationMark: null, setReleaseDate: "2026-09-16",
    attacks: [{ ...second.attacks[0], text: "Put a Pokémon from your hand into your deck." }] });
  const scoped = selectRetainedCardDefinitions([bothEffects, second, omitted], { savedFormats: ["TEF-30C"], retainedOn: "2026-10-04", sourceManifestHash: "a".repeat(64) });
  const raw = { ...resolveCardDefinition(buildCardDefinitionIndex(scoped.definitions), { name: "Alakazam" }), sourceCoverage: scoped.sourceCoverage };
  assert.equal(resolveCardDefinition(buildCardDefinitionIndex(raw.candidates), { name: "Alakazam", ...context }, raw.coverage, raw.generation, raw.sourceCoverage).coverage, "incomplete", "name-only projection cannot exclude the omitted printing");
  const resolver = createReplayEffectEvidenceResolver({ alakazam: raw }, [...rows, ...definitionEffectRows([bothEffects, omitted])], context);
  assert.equal(resolver.tag(psychicDraw), "ability", "the literal effect excludes a complete incompatible omitted inventory");
  assert.equal(resolver.origin(psychicDraw, returnDetail), "discard");
  assert.equal(resolver.tag(powerfulHand), null, "another action cannot borrow Powerful Hand from Psychic Draw's narrowed candidate projection");
  assert.equal(resolver.origin(powerfulHand), null);
  assert.equal(resolver.origin(powerfulHand, returnDetail), null, "scoped details cannot bypass an incomplete parent effect");
  assert.equal(createReplayEffectEvidenceResolver({ alakazam: resolveCardDefinition(buildCardDefinitionIndex([first]), { name: "Alakazam" }) }, definitionEffectRows([second]), context).tag(powerfulHand), null, "an effect outside the native candidate domain cannot borrow legacy proof");
  assert.equal(resolver.tag(psychicDraw), "ability", "duplicate literal titles share the same scoped evidence without rewriting the source");
  assert.equal(resolver.tag("Johan played Boss's Orders."), "supporter", "unlisted legacy Trainer lookup remains available");
  for (const coverage of ["incomplete", "stale", "unavailable"] as const) {
    assert.equal(createReplayEffectEvidenceResolver({ alakazam: { ...raw, coverage } }, definitionEffectRows([first]), context).tag(psychicDraw), null, "observed effects cannot repair partial source transport or borrow legacy rows");
  }
  const unknownInventory = selectRetainedCardDefinitions([first, { ...omitted, abilities: [], attacks: [] }], { savedFormats: ["TEF-30C"], retainedOn: "2026-10-04", sourceManifestHash: "a".repeat(64) });
  assert.equal(createReplayEffectEvidenceResolver({ alakazam: { ...raw, sourceCoverage: unknownInventory.sourceCoverage } }, [], context).tag(psychicDraw), null, "an omitted unknown effect inventory cannot prove incompatibility");
  const trainer = definition({ name: "Crispin", category: "Trainer", hp: null, trainerType: "Supporter", attacks: [], regulationMark: "H", setReleaseDate: "2024-05-24", rules: ["Search your deck for a Basic Energy card."] });
  const trainerRaw = resolveCardDefinition(buildCardDefinitionIndex([trainer]), { name: "Crispin" });
  assert.equal(createReplayEffectEvidenceResolver({ crispin: trainerRaw }, [], context).tag("JammerUK1993 played Crispin."), "supporter");
  assert.equal(createReplayEffectEvidenceResolver({ crispin: { ...trainerRaw, coverage: "incomplete" } }, definitionEffectRows([trainer]), context).tag("JammerUK1993 played Crispin."), null, "contextual Trainer gaps also suppress legacy fallback");
  const conflictingKind = { ...second, attacks: [{ ...second.attacks[0], name: "Psychic Draw", text: first.abilities[0].text }] };
  const kindRaw = resolveCardDefinition(buildCardDefinitionIndex([first, conflictingKind]), { name: "Alakazam" });
  assert.equal(createReplayEffectEvidenceResolver({ alakazam: kindRaw }, [], context).tag(psychicDraw), null, "a used-effect name does not resolve Ability versus attack disagreement");
  const conflictingOrigin = { ...second, attacks: [], abilities: [{ ...first.abilities[0], text: "Put a Pokémon from your hand into your deck." }] };
  const originResolver = createReplayEffectEvidenceResolver({ alakazam: resolveCardDefinition(buildCardDefinitionIndex([first, conflictingOrigin]), { name: "Alakazam" }) }, [], context);
  assert.equal(originResolver.tag(psychicDraw), "ability");
  assert.equal(originResolver.origin(psychicDraw, returnDetail), null, "a tag agreement cannot establish an origin when native text differs");
});

test("card effect catalog refuses ambiguous or partial effect matches", () => {
  const first = definition();
  const reprint = definition({ sourceCardId: "synthetic-2", localId: "2" });
  const agreed = resolveCardDefinition(buildCardDefinitionIndex([first, reprint]), { name: "Seedling" });
  assert.equal(agreed.hp, 70);
  assert.equal(agreed.resolution, "functional_agreement");
  assert.equal(agreed.candidates.length, 2);
  assert.equal(agreed.displayBasis, "representative", "agreement about game fields cannot establish an exact played printing");
  assert.deepEqual(agreed.candidatePrintingIds, [first.sourceCardId, reprint.sourceCardId]);
  assert(agreed.candidates.some((card) => card.sourceCardId === agreed.selectedPrinting?.sourceCardId));
  assert.equal(agreed.agreedFacts?.hp, 70);
  const differentAttack = { ...reprint, attacks: [{ name: "Wave", text: null, damage: "20", cost: ["Grass"] }] };
  const ambiguous = buildCardDefinitionIndex([first, differentAttack]);
  assert.equal(resolveCardDefinition(ambiguous, { name: "Seedling" }).hp, 70, "agreed printed HP is independent of other differing rules");
  assert.equal(resolveCardDefinition(ambiguous, { name: "Seedling" }).definition, null, "different attacks cannot become an agreed full definition");
  const conflict = buildCardDefinitionIndex([first, { ...reprint, hp: 90 }]);
  assert.equal(resolveCardDefinition(conflict, { name: "Seedling" }).hp, null);
  assert.equal(resolveCardDefinition(buildCardDefinitionIndex([first, { ...reprint, hp: null }]), { name: "Seedling" }).hp, null);
  const exact = resolveCardDefinition(conflict, { name: "Seedling", setId: "synthetic", localId: "001" });
  assert.equal(exact.hp, 70);
  assert.equal(exact.resolution, "exact");
  assert.equal(exact.displayBasis, "played_evidence");
  assert.equal(exact.selectedPrinting?.sourceCardId, first.sourceCardId);
  const effectMatched = resolveCardDefinition(buildCardDefinitionIndex([first, { ...differentAttack, hp: 90 }]), { name: "Seedling", effectNames: ["Tap"] });
  assert.equal(effectMatched.hp, 70, "a recorded effect can exclude a conflicting printing");
  const incompleteEffect = { ...differentAttack, hp: 90, attacks: [{ name: "", text: null, damage: null, cost: null }] };
  assert.equal(resolveCardDefinition(buildCardDefinitionIndex([first, incompleteEffect]), { name: "Seedling", effectNames: ["Tap"] }).hp, null, "a printing with missing effect identity cannot be excluded by an observed attack");

  assert.equal(resolveCardDefinition(buildCardDefinitionIndex([first]), { name: "Seedling ex" }).hp, null, "base and ex names are different identities");
  for (const coverage of ["incomplete", "stale", "unavailable"] as const) {
    const withheld = resolveCardDefinition(buildCardDefinitionIndex([first]), { name: "Seedling", setId: "synthetic", localId: "1" }, coverage);
    assert.equal(withheld.hp, null, `${coverage} coverage cannot establish HP`);
    assert.equal(withheld.definition, null);
    assert.deepEqual(withheld.agreedFacts, {}, "incomplete source coverage cannot establish gameplay facts");
  }

  const legal = definition({ regulationMark: "H", setReleaseDate: "2024-05-24" });
  const oldEquivalent = definition({ sourceCardId: "old-equivalent", regulationMark: null, setReleaseDate: "2015-01-01" });
  const historicDifferent = definition({ sourceCardId: "historic-different", hp: 60, regulationMark: null, setReleaseDate: "2010-01-01" });
  const futureDifferent = definition({ sourceCardId: "future-different", hp: 90, regulationMark: "J", setReleaseDate: "2026-09-16" });
  const knownFormatIndex = buildCardDefinitionIndex([historicDifferent, legal, oldEquivalent, futureDifferent]);
  const historicFormat = resolveCardDefinition(knownFormatIndex, { name: "Seedling", declaredFormat: "TEF-PBL", playedOn: "2026-07-17" });
  assert.equal(historicFormat.hp, null, "an unmapped future physical release cannot prove digital unavailability; known older aliases stay outside the legal family");
  assert.deepEqual(historicFormat.formatBasis?.legalPrintingIds, [legal.sourceCardId]);
  assert.deepEqual(historicFormat.formatBasis?.unverifiedPrintingIds, [futureDifferent.sourceCardId]);
  assert(historicFormat.formatBasis?.aliasPrintingIds?.includes(oldEquivalent.sourceCardId));
  assert.deepEqual(historicFormat.candidatePrintingIds, [legal.sourceCardId]);
  assert.equal(historicFormat.formatBasis?.latestReleaseDate, "2026-07-17");
  // Give the exact identity its own number: synthetic duplicate set/numbers are not exact evidence.
  const historicalIdentity = { ...historicDifferent, localId: "7" };
  const recordedPrinting = resolveCardDefinition(buildCardDefinitionIndex([legal, historicalIdentity]), { name: "Seedling", declaredFormat: "TEF-PBL", setId: historicalIdentity.setId.toUpperCase(), localId: " 007 " });
  assert.equal(recordedPrinting.hp, 60);
  assert.equal(recordedPrinting.displayBasis, "played_evidence", "recorded exact printing takes precedence over a manually declared format");
  assert.equal(recordedPrinting.formatBasis?.status, "conflicting");
  const noEndpoint = resolveCardDefinition(knownFormatIndex, { name: "Seedling", declaredFormat: "TEF-30C" });
  assert.equal(noEndpoint.formatBasis?.latestReleaseDate, undefined, "an undated game has no exact game-time release bound");
  assert.equal(noEndpoint.formatBasis?.declaredLatestSetReleaseDate, "2026-09-16", "the verified newest-set endpoint remains advisory evidence");
  assert.equal(noEndpoint.formatBasis?.status, "partial", "missing game time remains partial while older aliases stay separate");
  assert.equal(noEndpoint.hp, null, "known rotation alone cannot discard later conflicting printings");
  assert.equal(resolveCardDefinition(knownFormatIndex, { name: "Seedling", declaredFormat: "Expanded" }).hp, null);
  const missingMark = definition({ sourceCardId: "missing-mark", hp: 80, regulationMark: null, setReleaseDate: null });
  assert.equal(resolveCardDefinition(buildCardDefinitionIndex([legal, missingMark]), { name: "Seedling", declaredFormat: "TEF-PBL" }).hp, null, "missing modern format metadata remains an unknown candidate");
  const legalTrainer = definition({ name: "Supply", hp: null, category: "Trainer", trainerType: "Item", attacks: [], rules: ["Draw 2 cards."], regulationMark: "H" });
  const oldTrainer = { ...legalTrainer, sourceCardId: "old-trainer", regulationMark: "D", setReleaseDate: "2020-02-07" };
  assert.deepEqual(resolveCardDefinition(buildCardDefinitionIndex([legalTrainer, oldTrainer]), { name: "Supply", declaredFormat: "TEF-PBL" }).candidatePrintingIds, [legalTrainer.sourceCardId], "uncertified older Trainer artwork is separate from the eligible logical family");
  assert.deepEqual(resolveCardDefinition(buildCardDefinitionIndex([legalTrainer, oldTrainer]), { name: "Supply", declaredFormat: "TEF-PBL" }).formatBasis?.legalPrintingIds, [legalTrainer.sourceCardId], "equal effect fragments cannot certify a missing ACE SPEC/class clause on an older printing");
  const revisedWordingTrainer = { ...oldTrainer, sourceCardId: "revised-wording", trainerType: null, rules: ["Draw two cards."] };
  const revisedEvidence = resolveCardDefinition(buildCardDefinitionIndex([legalTrainer, revisedWordingTrainer]), { name: "Supply", declaredFormat: "TEF-PBL" });
  assert.equal(revisedEvidence.candidates.length, 1, "an older Trainer alias can be playable only as an eligible logical family, never its differing old effect fragment");
  assert.equal(revisedEvidence.definition?.sourceCardId, legalTrainer.sourceCardId, "logical family evidence comes from the current eligible printing");
  assert.equal(revisedEvidence.formatBasis?.status, "partial", "an undated logical pool does not claim exact historical eligibility");

  const missingSameHp = { ...legal, sourceCardId: "missing-mark-same-hp", regulationMark: null };
  const uncertainLegality = resolveCardDefinition(buildCardDefinitionIndex([legal, missingSameHp]), { name: "Seedling", declaredFormat: "TEF-30C", playedOn: "2026-09-27" });
  assert.equal(uncertainLegality.coverage, "incomplete", "matching HP cannot turn missing legality metadata into complete native inference");
  assert.equal(uncertainLegality.hp, null);
  const absentNative = resolveCardDefinition(buildCardDefinitionIndex([legal]), { name: "Seedling", declaredFormat: "TEF-30C", playedOn: "2026-09-27", setId: legal.setId, localId: "999" });
  assert.deepEqual(absentNative.candidates, [], "an absent explicit printing cannot fall back to another same-name printing");
  assert.equal(absentNative.coverage, "incomplete", "an absent explicit printing is a local metadata gap even when the name pool is complete");
  const nativeUnknownMark = resolveCardDefinition(buildCardDefinitionIndex([{ ...missingSameHp, localId: "9" }]), { name: "Seedling", declaredFormat: "TEF-30C", setId: legal.setId, localId: "9" });
  assert.equal(nativeUnknownMark.hp, 70, "exact recorded printing retains its own HP despite a missing regulation mark");
  const beforeRelease = resolveCardDefinition(buildCardDefinitionIndex([legal, futureDifferent]), { name: "Seedling", declaredFormat: "TEF-30C", playedOn: "2026-09-15" });
  assert.deepEqual(beforeRelease.candidatePrintingIds, [legal.sourceCardId]);
  assert.equal(beforeRelease.formatBasis?.latestReleaseDate, "2026-09-15");
  const staleEndpoint = resolveCardDefinition(knownFormatIndex, { name: "Seedling", declaredFormat: "TEF-PBL", playedOn: "2026-09-25" });
  assert.deepEqual(staleEndpoint.candidatePrintingIds, [legal.sourceCardId, futureDifferent.sourceCardId], "the recorded game day permits later eligible releases when the saved newest-set suffix is stale");
  assert.equal(staleEndpoint.formatBasis?.latestReleaseDate, "2026-09-25");
  const exactFuture = resolveCardDefinition(buildCardDefinitionIndex([{ ...futureDifferent, localId: "8" }]), { name: "Seedling", declaredFormat: "TEF-30C", playedOn: "2026-09-15", setId: legal.setId, localId: "8" });
  assert.equal(exactFuture.formatBasis?.status, "conflicting");
  assert.equal(exactFuture.hp, 90, "a saved format/date conflict preserves source identity rather than inventing a legal replacement");
  const liveLaunch = { ...legal, sourceCardId: "launch", setId: "me03", setReleaseDate: "2026-03-27", regulationMark: "J" };
  assert.equal(cardDefinitionAvailability(liveLaunch, "2026-03-26T16:59:59Z").status, "unavailable", "exact official launch instant excludes earlier games");
  assert.equal(cardDefinitionAvailability(liveLaunch, "2026-03-26T17:00:00Z").status, "available", "exact official launch instant admits Live before paper release");
  assert.equal(cardDefinitionAvailability(liveLaunch, "2026-03-26").status, "unverified", "date-only launch-day evidence cannot establish which side of the release instant the game occurred on");
  assert.equal(cardDefinitionAvailability({ ...liveLaunch, setId: "unmapped" }, "2026-03-26T18:00:00Z").status, "unverified", "an unrelated set cannot borrow an early availability offset");
  assert.equal(cardDefinitionAvailability({ ...liveLaunch, setReleaseDate: "2026-03-28" }, "2026-03-26T18:00:00Z").status, "unverified", "a stale provider date cannot borrow the authored set release certificate");
  assert.equal(cardDefinitionAvailability({ ...liveLaunch, setReleaseDate: "2026-03-20" }, "2026-03-25T18:00:00Z").status, "unverified", "a conflicting earlier provider date cannot bypass an exact official release guard through the generic past-date path");
  assert.equal(resolveCardDefinition(buildCardDefinitionIndex([liveLaunch]), { name: "Seedling", declaredFormat: "TEF-POR", playedOn: "2026-03-26T18:00:00Z" }).hp, 70);
  assert.equal(resolveCardDefinition(buildCardDefinitionIndex([liveLaunch]), { name: "Seedling", declaredFormat: "TEF-POR", playedOn: "2026-03-26" }).hp, null);
  assert.equal(ptcglStandardRotation("2026-03-26T16:59:59Z")?.floor, "G", "2026 rotation begins at the verified launch instant, not midnight");
  assert.equal(ptcglStandardRotation("2026-03-26T17:00:00Z")?.floor, "H");
  assert.equal(ptcglStandardRotation("2026-03-26"), undefined, "a date-only rotation-day game cannot establish a unique legal floor");
  assert.equal(ptcglStandardRotation("2026-03-27T00:00:00+14:00")?.floor, "G", "rotation compares the exact UTC instant rather than the timestamp's local calendar day");
  assert.equal(cardDefinitionPlayedDay("2026-10-04T23:00:00-12:00"), "2026-10-05", "query calendar horizons normalize explicit timestamps to UTC");
  assert.equal(cardDefinitionPlayedDay("2026-10-04"), "2026-10-04");
  assert.equal(cardDefinitionPlayedDay("2026-10-04T99:00:00Z"), undefined, "invalid timestamps cannot resurrect a valid sliced day");
  assert.equal(cardDefinitionPlayedDay("2026-10-04T23:00:00"), undefined, "a timestamp without a timezone cannot assert a UTC day");
  assert.equal(ptcglStandardRotation("2026-12-31T23:00:00-12:00"), undefined, "the reviewed2026 calendar cannot extend into UTC2027 through a local-date slice");
  assert.equal(cardDefinitionAvailability({ ...liveLaunch, setId: "unmapped", setReleaseDate: "2026-03-26" }, "2026-03-27T00:00:00+14:00").status, "unverified", "provider day evidence must not borrow an extra local calendar day");
  assert.equal(resolveCardDefinition(buildCardDefinitionIndex([legal]), { name: "Seedling", declaredFormat: "TEF-30C", playedOn: "2026-10-04T99:00:00Z" }).coverage, "incomplete");
  const priorFloorPrinting = { ...legal, sourceCardId: "prior-floor", regulationMark: "G", setReleaseDate: "2023-03-31" };
  const beforeRotation = resolveCardDefinition(buildCardDefinitionIndex([priorFloorPrinting, liveLaunch]), { name: "Seedling", declaredFormat: "TEF-POR", playedOn: "2026-03-26T16:59:59Z" });
  assert.deepEqual(beforeRotation.candidatePrintingIds, [priorFloorPrinting.sourceCardId], "the prior legal G family survives before exact rotation while the new launch is unavailable");
  assert.equal(beforeRotation.formatBasis?.minimumRegulationMark, "G");
  const afterRotation = resolveCardDefinition(buildCardDefinitionIndex([priorFloorPrinting, liveLaunch]), { name: "Seedling", declaredFormat: "TEF-POR", playedOn: "2026-03-26T17:00:00Z" });
  assert.deepEqual(afterRotation.candidatePrintingIds, [liveLaunch.sourceCardId]);
  assert.equal(afterRotation.formatBasis?.rotationAvailableOn, "2026-03-26T17:00:00Z");
  const rotationScope = selectRetainedCardDefinitions([priorFloorPrinting, liveLaunch], { savedFormats: ["SVI-POR", "TEF-POR"], retainedOn: "2026-10-04" });
  const undatedBoundary = resolveCardDefinition(buildCardDefinitionIndex([priorFloorPrinting, liveLaunch]), { name: "Seedling", declaredFormat: "TEF-POR", playedOn: "2026-03-26" }, "complete", null, rotationScope.sourceCoverage);
  assert.equal(undatedBoundary.hp, null);
  assert.equal(undatedBoundary.coverage, "incomplete");
  const historicF = { ...legal, sourceCardId: "historic-f", regulationMark: "F", setReleaseDate: "2022-02-25" };
  assert.equal(resolveCardDefinition(buildCardDefinitionIndex([historicF]), { name: "Seedling", declaredFormat: "BRS-SSP", playedOn: "2024-12-01" }).hp, 70, "historical saved F format does not use current H rotation");
  const historicG = { ...legal, sourceCardId: "historic-g", regulationMark: "G", setReleaseDate: "2023-03-31" };
  const staleRotation = resolveCardDefinition(buildCardDefinitionIndex([historicG, legal]), { name: "Seedling", declaredFormat: "SVI-POR", playedOn: "2026-09-25" });
  assert.deepEqual(staleRotation.candidatePrintingIds, [legal.sourceCardId], "official Live rotation at the recorded game date prevents a stale annual prefix admitting rotated logical families");
  assert.equal(staleRotation.formatBasis?.status, "conflicting");
  assert.equal(resolveCardDefinition(buildCardDefinitionIndex([historicG, legal]), { name: "Seedling", declaredFormat: "SVI-POR", playedOn: "2026-10-05" }).formatBasis?.minimumRegulationMark, "H", "review date is provenance, not a daily expiry of the announced annual rotation");
  assert.equal(resolveCardDefinition(buildCardDefinitionIndex([historicG]), { name: "Seedling", declaredFormat: "SVI-POR", playedOn: "2025-09-25" }).hp, 70, "historical game-time G remains legal independently of current rotation");
  assert.deepEqual(partitionCardDefinitionsForFormat([historicG, legal], { declaredFormat: "SVI-POR", playedOn: "2026-10-04", purpose: "retention" }).legal.map(card => card.sourceCardId), [historicG.sourceCardId, legal.sourceCardId], "publication retains historical declared G families without applying today's runtime H floor");
  const basic = definition({ name: "Basic Psychic Energy", category: "Energy", hp: null, stage: null, types: ["Psychic"], attacks: [], regulationMark: null, rules: null });
  const basicLegality = resolveCardDefinition(buildCardDefinitionIndex([basic]), { name: basic.name, declaredFormat: "TEF-30C", playedOn: "2026-09-27" });
  assert.deepEqual(basicLegality.formatBasis?.legalPrintingIds, [basic.sourceCardId], "Basic Energy is a game class exception to regulation marks");
  const classifiedBasic = { ...basic, types: null, energyType: "Normal" as const };
  assert.equal(resolveCardDefinition(buildCardDefinitionIndex([classifiedBasic]), { name: basic.name, declaredFormat: "TEF-30C", playedOn: "2026-09-27" }).candidates.length, 1, "an explicit canonical Basic class and Normal source discriminator need no redundant type field");
  assert.equal(resolveCardDefinition(buildCardDefinitionIndex([{ ...classifiedBasic, types: ["Fire"] }]), { name: basic.name, declaredFormat: "TEF-30C", playedOn: "2026-09-27" }).candidates.length, 0, "contradictory supplied Basic type is refused");
  assert.equal(resolveCardDefinition(buildCardDefinitionIndex([{ ...classifiedBasic, name: "Prism Energy" }]), { name: "Prism Energy", declaredFormat: "TEF-30C", playedOn: "2026-09-27" }).candidates.length, 0, "Normal alone cannot classify a Special Energy as Basic");
  const differentTrait = { ...legalTrainer, sourceCardId: "distinct-trait", additionalPassiveTraits: [{ name: "Trait", text: "An additional printed rule.", type: "Trait" }] };
  assert.equal(resolveCardDefinition(buildCardDefinitionIndex([{ ...legalTrainer, additionalPassiveTraits: [] }, differentTrait]), { name: "Supply" }).definition, null);

  const shuffleDetail = "- PlayerTwo shuffled 5 cards into their deck.";
  const judgeRules = definitionEffectRows([definition({ name: "Judge", hp: null, category: "Trainer", trainerType: "Supporter", attacks: [], rules: ["Each player shuffles their hand into their deck and draws 4 cards."] })]);
  assert.equal(resolveBattleLogEffectOriginFromRows("PlayerOne played Judge.", judgeRules, shuffleDetail), "hand");
  const oldJudge = { ...judgeRules[0], effect_text: "Each player shuffles his or her hand into his or her deck and draws 4 cards." };
  assert.equal(resolveBattleLogEffectOriginFromRows("PlayerOne played Judge.", [...judgeRules, oldJudge], shuffleDetail), "hand", "equivalent legacy printing pronouns cannot discard the shared hand origin");

  const ionoRules = definitionEffectRows([definition({ name: "Iono", hp: null, category: "Trainer", trainerType: "Supporter", attacks: [], rules: ["Each player shuffles their hand and puts it on the bottom of their deck. Then, each player draws a card for each of their remaining Prize cards."] })]);
  assert.equal(resolveBattleLogEffectOriginFromRows("PlayerOne played Iono.", ionoRules, shuffleDetail), "hand");
  const opponentShuffle = definitionEffectRows([definition({ name: "Hand Reset", hp: null, category: "Trainer", trainerType: "Item", attacks: [], rules: ["Your opponent shuffles their hand into their deck. Then, they draw 4 cards."] })]);
  assert.equal(resolveBattleLogEffectOriginFromRows("PlayerOne played Hand Reset.", opponentShuffle, shuffleDetail), "hand");
  const metalMaker = definitionEffectRows([definition({ name: "Metang", abilities: [{ name: "Metal Maker", type: "Ability", text: "Once during your turn, you may look at the top 4 cards of your deck and attach any number of Basic {M} Energy cards you find there to your Pokémon in any way you like. Shuffle the other cards and put them on the bottom of your deck." }] })]);
  assert.equal(resolveBattleLogEffectOriginFromRows("PlayerOne's Metang used Metal Maker.", metalMaker, "- PlayerOne attached Basic Metal Energy to Seedling in the Active Spot."), "deck", "the top-deck attachment clause establishes its source without the phrase from your deck");
  const mixedOrigins = definitionEffectRows([definition({ abilities: [{ name: "Gather", type: "Ability", text: "Discard a card from your hand. Attach a Basic Energy card from your discard pile to 1 of your Pokémon." }] })]);
  const mixedTitle = "PlayerOne's Seedling used Gather.";
  assert.equal(resolveBattleLogEffectOriginFromRows(mixedTitle, mixedOrigins), null, "a whole effect containing different source zones has no single origin");
  assert.equal(resolveBattleLogEffectOriginFromRows(mixedTitle, mixedOrigins, "- PlayerOne attached Basic Grass Energy to Seedling in the Active Spot."), "discard", "attachment evidence uses its clause rather than the separate hand cost");

  const recoveryDefinition = definition({ abilities: [{ name: "Recover", type: "Ability", text: "Attach a Basic Energy card from your discard pile to 1 of your Pokémon." }] });
  const recoveryTitle = "PlayerOne's Seedling used Recover.";
  assert.equal(resolveBattleLogEffectOriginFromRows(recoveryTitle, definitionEffectRows([recoveryDefinition])), "discard");
  for (const unknownEffectDefinition of [definition({ sourceCardId: "unknown-empty", attacks: [], abilities: [] }), definition({ sourceCardId: "unknown-unnamed", attacks: [], abilities: [{ name: "", type: "Ability", text: null }] })]) {
    const partialProjection = definitionEffectRows([recoveryDefinition, unknownEffectDefinition]);
    assert.equal(resolveBattleLogEffectCatalogTagFromRows(recoveryTitle, partialProjection), null, "missing candidate effect identity survives compatibility projection");
    assert.equal(resolveBattleLogEffectOriginFromRows(recoveryTitle, partialProjection, "PlayerOne attached Basic Grass Energy to Seedling in the Active Spot."), null, "known text from another printing cannot hide a viable candidate's missing effect");
  }

  for (const trainerType of [null, "Legacy Trainer"]) {
    const trainerCandidates = definitionEffectRows([definition({ name: "Recovery Item", category: "Trainer", trainerType: "Item", hp: null, attacks: [], rules: ["Put a Pokémon from your discard pile into your hand."] }), definition({ name: "Recovery Item", category: "Trainer", trainerType, hp: null, attacks: [], rules: null })]);
    assert.equal(resolveBattleLogEffectCatalogTagFromRows("PlayerOne played Recovery Item.", trainerCandidates), null, "unknown Trainer subtypes cannot disappear from candidate agreement");
    assert.equal(resolveBattleLogEffectOriginFromRows("PlayerOne played Recovery Item.", trainerCandidates), null);
  }

  const title = "FixturePlayer's Radiant Greninja used Concealed Cards.";
  const hand = { ...rows[3], effect_text: "Choose an Energy card from your hand." };
  const deck = { ...rows[3], effect_text: "Choose an Energy card from your deck." };
  const discard = { ...rows[3], effect_text: "Choose an Energy card from your discard pile." };
  assert.equal(resolveBattleLogEffectOriginFromRows(title, [hand]), "hand");
  assert.equal(resolveBattleLogEffectOriginFromRows(title, [deck]), "deck");
  assert.equal(resolveBattleLogEffectOriginFromRows(title, [discard, { ...discard }]), "discard");
  assert.equal(resolveBattleLogEffectOriginFromRows(title, [rows[3]]), null, "absent card text cannot invent an origin");
  assert.equal(resolveBattleLogEffectOriginFromRows(title, [hand, discard]), null, "all matching printings must agree");
  assert.equal(resolveBattleLogEffectOriginFromRows(title, [hand, rows[3]]), null, "one missing printing text makes the origin ambiguous");
  assert.equal(resolveBattleLogEffectOriginFromRows(title, [{ ...hand, effect_text: "Choose a card from your hand or from your discard pile." }]), null);
  assert.equal(resolveBattleLogEffectOriginFromRows(title, [{ ...hand, effect_kind: "attack" }, hand]), null);
  assert.equal(resolveBattleLogEffectOriginFromRows("Budew used Concealed Cards.", [hand]), null);
  assert.equal(resolveBattleLogEffectOriginFromRows("Radiant Greninja used Itchy Pollen.", [hand]), null);
  assert.equal(resolveBattleLogEffectOriginFromRows("PlayerOne played Boss's Orders.", [{ ...rows[0], effect_text: "Put a card from your discard pile into your hand." }]), "discard");

  assert.equal(resolveBattleLogEffectCatalogTagFromRows("Budew used Concealed Cards.", rows), null);
  assert.equal(resolveBattleLogEffectCatalogTagFromRows("Radiant Greninja used Itchy Pollen.", rows), null);
  assert.equal(resolveBattleLogEffectCatalogTagFromRows("Budew used a move.", rows), null);
  assert.equal(
    resolveBattleLogEffectCatalogTagFromRows("Budew used Itchy Pollen.", [
      ...rows,
      {
        card_name: "Budew",
        normalized_card_name: "budew",
        effect_kind: "ability",
        effect_name: "Itchy Pollen",
        normalized_effect_name: "itchy pollen"
      }
    ]),
    null
  );
});
