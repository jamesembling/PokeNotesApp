import { normalizeText } from "@/lib/log-import/normalization";
import type { CardDefinition, CardDefinitionCoverage, CardDefinitionEvidence, CardDefinitionQuery } from "./types";
import type { CardEffectLookupRow } from "@/lib/battle-log/effect-catalog";
import { SITE_FORMAT_OPTIONS } from "@/lib/formats/options";
import releaseSchedule from "@/docs/catalog-release-schedule.json";

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

function verifiedArtwork(card: CardDefinition): boolean {
  if (!card.imageUrl) return false;
  try {
    const url = new URL(card.imageUrl);
    return url.origin === "https://assets.tcgdex.net" && !url.username && !url.password && !url.search && !url.hash
      && /^\/en\/[^/]+\/[^/]+\/[^/]+\/high\.webp$/.test(url.pathname);
  } catch { return false; }
}

function possibleFunctionalReprint(left: CardDefinition, right: CardDefinition): boolean {
  const compatible = (a: unknown, b: unknown): boolean => {
    if (a === null || b === null) return true;
    if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((item, index) => compatible(item, b[index]));
    if (a && b && typeof a === "object" && typeof b === "object") return Object.keys(a).every((key) => compatible((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
    return JSON.stringify(a) === JSON.stringify(b);
  };
  return (["hp", "category", "trainerType", "stage", "types", "evolvesFrom", "rules", "abilities", "attacks"] as const)
    .every((field) => (["abilities", "attacks"].includes(field) && (left.category === "Pokemon" && !left.abilities.length && !left.attacks.length
      || right.category === "Pokemon" && !right.abilities.length && !right.attacks.length)) || compatible(left[field], right[field]));
}

/** Saved format labels identify historical rotations. Never substitute the live default.
 * Floors: official 2024/2025/2026 Standard rotation announcements on pokemon.com.
 * Upper dates are applied only for the verified release entries in the project schedule. */
function formatCandidates(candidates: CardDefinition[], declared: string | undefined): { candidates: CardDefinition[]; basis?: CardDefinitionEvidence["formatBasis"] } {
  if (!declared) return { candidates };
  const floor = ({ BRS: "F", SVI: "G", TEF: "H" } as Record<string, string>)[declared.split("-")[0]];
  if (!floor || !SITE_FORMAT_OPTIONS.some((format) => format === declared))
    return { candidates, basis: { declared, status: "unsupported" } };
  const latestReleaseDate = releaseSchedule.releases.find((release) => release.limitlessFormatCode === declared && release.status === "released")?.releaseDate;
  const released = candidates.filter((card) => !latestReleaseDate || !card.setReleaseDate || card.setReleaseDate <= latestReleaseDate);
  const current = released.filter((card) => /^[A-Z]$/.test(card.regulationMark ?? "") && card.regulationMark! >= floor);
  // Every category may have a functional reprint. Retain unknown metadata rather
  // than treating absent provider fields as proof that an old printing is illegal.
  let reprintUncertain = false;
  const surviving = released.filter((card) => {
    const marked = /^[A-Z]$/.test(card.regulationMark ?? "");
    // English pre-2020 releases predate regulation marks. A modern undated or
    // unmarked provider row remains unknown, while an old print needs a reprint.
    const predatesMarks = Boolean(card.setReleaseDate && card.setReleaseDate < "2020-01-01");
    if (marked && card.regulationMark! >= floor || !marked && !predatesMarks || current.some((legal) => possibleFunctionalReprint(card, legal))) return true;
    // Older Trainer printings can use revised wording/errata. Without a reviewed
    // reprint-family relationship, differing text proves neither legality nor
    // illegality. Keep the possibility and withhold conflicting gameplay facts.
    if (card.category === "Trainer" && current.some((legal) => legal.category === "Trainer"
      && (legal.trainerType === null || card.trainerType === null || legal.trainerType === card.trainerType))) {
      reprintUncertain = true;
      return true;
    }
    return false;
  });
  return { candidates: surviving, basis: { declared, status: !reprintUncertain && latestReleaseDate && released.every((card) => card.setReleaseDate && card.regulationMark) ? "applied" : "partial", minimumRegulationMark: floor, ...(latestReleaseDate ? { latestReleaseDate } : {}) } };
}

function agreedFacts(candidates: CardDefinition[], usable: boolean): CardDefinitionEvidence["agreedFacts"] {
  if (!usable) return {};
  const result: CardDefinitionEvidence["agreedFacts"] = {};
  for (const field of ["hp", "category", "trainerType", "stage", "types", "evolvesFrom", "rules", "abilities", "attacks"] as const) {
    const value = candidates[0][field];
    if (value !== null && candidates.every((card) => JSON.stringify(card[field]) === JSON.stringify(value)))
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
  const formatted = formatCandidates(candidates, query.declaredFormat);
  // Recorded set/collector identity is stronger evidence than a manually chosen
  // format label. Preserve that printing and explicitly report the conflict.
  const sameNumber = (value: string) => value.trim().replace(/^0+(?=\d)/, "");
  const exactCandidates = query.setId && query.localId ? candidates.filter((card) => card.setId.toLowerCase() === query.setId!.trim().toLowerCase() && sameNumber(card.localId) === sameNumber(query.localId!)) : [];
  const conflict = exactCandidates.length === 1 && !formatted.candidates.includes(exactCandidates[0]);
  candidates = exactCandidates.length === 1 ? exactCandidates : formatted.candidates;
  // IDs are provider identities, never inferred from representative artwork or a name match.
  if (query.setId) candidates = candidates.filter((card) => card.setId.toLowerCase() === query.setId!.trim().toLowerCase());
  if (query.localId) candidates = candidates.filter((card) => sameNumber(card.localId) === sameNumber(query.localId!));
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
  const selected = selectCardDefinitionPrinting(candidates);
  return {
    coverage, generation, sourceCoverage, candidates, hp,
    resolution: !candidates.length ? "missing" : exact ? "exact" : agrees ? "functional_agreement" : "ambiguous",
    definition: exact || agrees ? selected : null,
    candidatePrintingIds: candidates.map((card) => card.sourceCardId),
    selectedPrinting: selected ? { source: selected.source, sourceCardId: selected.sourceCardId, setId: selected.setId, localId: selected.localId, sourceUrl: selected.sourceUrl, ...(verifiedArtwork(selected) ? { imageUrl: selected.imageUrl } : {}) } : null,
    displayBasis: selected ? exact ? "played_evidence" : "representative" : "unavailable",
    agreedFacts: agreedFacts(candidates, usable),
    ...(formatted.basis ? { formatBasis: { ...formatted.basis, ...(conflict ? { status: "conflicting" as const } : {}) } } : {}),
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
