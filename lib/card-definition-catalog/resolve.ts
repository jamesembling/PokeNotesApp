import { normalizeText } from "@/lib/log-import/normalization";
import type { CardDefinition, CardDefinitionCoverage, CardDefinitionEvidence, CardDefinitionQuery } from "./types";
import type { CardEffectLookupRow } from "@/lib/battle-log/effect-catalog";
import { partitionCardDefinitionsForFormat, standardFormatFloor, cardDefinitionPlayedDay } from "./legality.mjs";
import { hasVerifiedPrintedRegulationMarkAbsence } from "./regulation-evidence.mjs";
import { getCardDefinitionScopeCoverage } from "./retention.mjs";
import { isCardRuleEvidence, isCardPassiveEvidence } from "./source.mjs";
export { partitionCardDefinitionsForFormat, validCardDefinitionDay } from "./legality.mjs";

type CardDefinitionIndex = Map<string, CardDefinition[]>;

/** Complete printed Rule Box evidence remains separate from loaded row coverage. */
export function hasCompletePokemonRuleBoxEvidence(evidence: Pick<CardDefinitionEvidence, "coverage" | "candidates"> | undefined): boolean {
  return evidence?.coverage === "complete" && evidence.candidates.length > 0
    && evidence.candidates.every((card) => card.category === "Pokemon" && isCardRuleEvidence(card)
      && card.ruleEvidence?.status !== "unknown" && card.ruleEvidence !== undefined && card.ruleEvidence.scope === "printed_rule_box");
}

/** Complete passive text is an inventory claim, separate from effect semantics. */
export function hasCompletePokemonPassiveEvidence(evidence: Pick<CardDefinitionEvidence, "coverage" | "candidates"> | undefined): boolean {
  return hasCompletePokemonRuleBoxEvidence(evidence)
    && evidence!.candidates.every((card) => card.passiveEvidence?.status === "verified_complete" && isCardPassiveEvidence(card));
}

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
    card.evolvesFrom, card.rules, card.abilities, card.attacks, card.additionalPassiveTraits ?? null, card.energyType ?? null]);
}

function verifiedArtwork(card: CardDefinition): boolean {
  if (!card.imageUrl) return false;
  try {
    const url = new URL(card.imageUrl);
    return url.origin === "https://assets.tcgdex.net" && !url.username && !url.password && !url.search && !url.hash
      && /^\/en\/[^/]+\/[^/]+\/[^/]+\/high\.webp$/.test(url.pathname);
  } catch { return false; }
}

/** Operative candidates are known eligible logical families. Unknown new
 * printing families remain separate blockers; older art cannot invent another
 * gameplay family under the saved Standard constraint. */
function formatCandidates(candidates: CardDefinition[], declaredFormat: string | undefined, playedOn?: string): { candidates: CardDefinition[]; unverified: CardDefinition[]; basis?: CardDefinitionEvidence["formatBasis"] } {
  if (!declaredFormat && !playedOn) return { candidates, unverified: [] };
  const partition = partitionCardDefinitionsForFormat(candidates, { declaredFormat, playedOn }, hasVerifiedPrintedRegulationMarkAbsence);
  return partition.basis.status === "unsupported"
    ? { candidates: partition.unverified, unverified: [], basis: partition.basis }
    : { candidates: partition.legal, unverified: partition.unverified, basis: partition.basis };
}

function agreedFacts(candidates: CardDefinition[], usable: boolean): CardDefinitionEvidence["agreedFacts"] {
  if (!usable) return {};
  const result: CardDefinitionEvidence["agreedFacts"] = {};
  for (const field of ["hp", "category", "trainerType", "stage", "types", "evolvesFrom", "rules", "abilities", "attacks", "additionalPassiveTraits", "energyType"] as const) {
    const value = candidates[0][field];
    if (value !== null && value !== undefined && candidates.every((card) => JSON.stringify(card[field]) === JSON.stringify(value)))
      Object.assign(result, { [field]: value });
  }
  return result;
}

export function selectCardDefinitionPrinting(candidates: readonly CardDefinition[]): CardDefinition | null {
  // Prefer a surviving print whose artwork is available; deterministic within the same evidence.
  return [...candidates].sort((left, right) => Number(verifiedArtwork(right)) - Number(verifiedArtwork(left))
    || (right.setReleaseDate ?? "").localeCompare(left.setReleaseDate ?? "") || left.sourceCardId.localeCompare(right.sourceCardId))[0] ?? null;
}

export function resolveCardDefinition(
  index: CardDefinitionIndex,
  query: CardDefinitionQuery,
  coverage: CardDefinitionCoverage = "complete",
  generation: string | null = null,
  sourceCoverage?: CardDefinitionEvidence["sourceCoverage"]
): CardDefinitionEvidence {
  let candidates = index.get(normalizeText(query.name)) ?? [];
  const formatted = formatCandidates(candidates, query.declaredFormat, query.playedOn);
  // Recorded set/collector identity is stronger evidence than a manually chosen
  // format label. Preserve that printing and explicitly report the conflict.
  const sameNumber = (value: string) => value.trim().replace(/^0+(?=\d)/, "");
  const exactCandidates = query.setId && query.localId ? candidates.filter((card) => card.setId.toLowerCase() === query.setId!.trim().toLowerCase() && sameNumber(card.localId) === sameNumber(query.localId!)) : [];
  if (coverage === "complete" && exactCandidates.length !== 1 && standardFormatFloor(query.declaredFormat)
    && query.playedOn !== undefined && (!cardDefinitionPlayedDay(query.playedOn) || !formatted.basis?.minimumRegulationMark)) coverage = "incomplete";
  if (coverage === "complete" && query.setId && query.localId && exactCandidates.length !== 1) coverage = "incomplete";
  if (coverage === "complete" && exactCandidates.length !== 1 && getCardDefinitionScopeCoverage(sourceCoverage, query.name, query) === "incomplete") coverage = "incomplete";
  const conflict = exactCandidates.length === 1 && !formatted.candidates.includes(exactCandidates[0]);
  candidates = exactCandidates.length === 1 ? exactCandidates : formatted.candidates;
  // IDs are provider identities, never inferred from representative artwork or a name match.
  if (query.setId) candidates = candidates.filter((card) => card.setId.toLowerCase() === query.setId!.trim().toLowerCase());
  if (query.localId) candidates = candidates.filter((card) => sameNumber(card.localId) === sameNumber(query.localId!));
  let unverifiedCandidates = formatted.unverified;
  if (query.effectNames?.length) {
    const names = query.effectNames.map(normalizeText);
    const matchesEffects = (card: CardDefinition) => {
      // A missing effect list cannot establish that this printing is excluded.
      if (card.abilities.length + card.attacks.length === 0 || [...card.abilities, ...card.attacks].some((effect) => !effect.name)) return true;
      const effects = new Set([...card.abilities, ...card.attacks].map((effect) => normalizeText(effect.name)));
      return names.every((name) => effects.has(name));
    };
    candidates = candidates.filter(matchesEffects);
    unverifiedCandidates = unverifiedCandidates.filter(matchesEffects);
  }
  const exactIdentity = Boolean(query.setId && query.localId) && candidates.length === 1;
  const unverified = !exactIdentity && unverifiedCandidates.length > 0;
  const contextualCoverage = coverage === "complete" && unverified ? "incomplete" : coverage;
  const usable = contextualCoverage === "complete" && candidates.length > 0;
  const hp = usable && candidates[0].hp !== null && candidates.every((card) => card.hp === candidates[0].hp)
    ? candidates[0].hp : null;
  const agrees = usable && candidates.every((card) => functionalKey(card) === functionalKey(candidates[0]));
  const exact = usable && Boolean(query.setId && query.localId) && candidates.length === 1;
  const legalIds = new Set(formatted.basis?.legalPrintingIds ?? []);
  const displayCandidates = !exactIdentity && formatted.basis && formatted.basis.status !== "unsupported" ? candidates.filter((card) => legalIds.has(card.sourceCardId)) : candidates;
  const selected = selectCardDefinitionPrinting(displayCandidates);
  return {
    coverage: contextualCoverage, generation, sourceCoverage, candidates, hp,
    ...(unverified && unverifiedCandidates.length ? { unverifiedCandidates } : {}),
    resolution: !candidates.length ? "missing" : exact ? "exact" : agrees ? "functional_agreement" : "ambiguous",
    definition: exact || agrees ? selected : null,
    candidatePrintingIds: candidates.map((card) => card.sourceCardId),
    selectedPrinting: selected ? { source: selected.source, sourceCardId: selected.sourceCardId, setId: selected.setId, localId: selected.localId, sourceUrl: selected.sourceUrl, ...(verifiedArtwork(selected) ? { imageUrl: selected.imageUrl } : {}) } : null,
    displayBasis: selected ? exact ? "played_evidence" : "representative" : "unavailable",
    agreedFacts: agreedFacts(candidates, usable),
    ...(formatted.basis ? { formatBasis: { ...formatted.basis, legalPrintingIds: formatted.basis.legalPrintingIds?.filter((id) => candidates.some((card) => card.sourceCardId === id)), unverifiedPrintingIds: exactIdentity ? formatted.basis.unverifiedPrintingIds?.filter((id) => candidates.some((card) => card.sourceCardId === id)) : unverifiedCandidates.map((card) => card.sourceCardId), ...(conflict ? { status: "conflicting" as const } : {}) } } : {}),
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
