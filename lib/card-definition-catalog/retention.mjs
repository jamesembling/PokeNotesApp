import siteFormats from "../formats/site-format-options.json" with { type: "json" };
import { partitionCardDefinitionsForFormat, standardFormatFloor, cardDefinitionAvailability, cardDefinitionPlayedDay } from "./legality.mjs";
import { hasVerifiedPrintedRegulationMarkAbsence } from "./regulation-evidence.mjs";
import { normalizeCardDefinitionName } from "./source.mjs";

export const CARD_DEFINITION_RETENTION_VERSION = "standard-saved-formats-v1";
// Read-only production format inventory, verified 2026-10-04. Live publication
// obtains and rechecks formats without selecting any other log fields.
export const RETAINED_SAVED_STANDARD_FORMATS = Object.freeze(["SVI-ASC", "SVI-JTG", "SVI-PFL", "SVI-POR", "TEF-30C", "TEF-CRI", "TEF-PBL", "TEF-POR"]);
export function currentStandardFormat() {
  const current = siteFormats.find((format) => standardFormatFloor(format));
  if (!current) throw new Error("No supported current Standard format is configured.");
  return current;
}
export function selectRetainedCardDefinitions(definitions, { savedFormats = RETAINED_SAVED_STANDARD_FORMATS, retainedOn = new Date().toISOString(), sourceManifestHash, unlistedSets = [] } = {}) {
  if (!cardDefinitionPlayedDay(retainedOn)) throw new Error("Invalid reference retention date.");
  const observedFormats = [...new Set(savedFormats.map((format) => String(format ?? '').trim()))].sort();
  const retainedFormats = [...new Set([currentStandardFormat(), ...observedFormats.filter(standardFormatFloor)])].sort();
  const unsupportedFormats = observedFormats.filter((format) => !standardFormatFloor(format));
  const selected = new Set(), unverifiedPrintingsByFormat = {}, countsByFormat = {};
  for (const declaredFormat of retainedFormats) {
    const pool = partitionCardDefinitionsForFormat(definitions, { declaredFormat, playedOn: retainedOn, purpose: "retention" }, hasVerifiedPrintedRegulationMarkAbsence);
    pool.legal.forEach((card) => selected.add(card.sourceCardId));
    const unknownByName = {};
    for (const card of [...pool.unverified, ...pool.excluded]) (unknownByName[normalizeCardDefinitionName(card.name)] ??= []).push({ sourceCardId: card.sourceCardId, setId: card.setId, setReleaseDate: card.setReleaseDate,
      effectNames: [...card.abilities, ...card.attacks].length && [...card.abilities, ...card.attacks].every((effect) => typeof effect.name === "string" && effect.name.trim())
        ? [...new Set([...card.abilities, ...card.attacks].map((effect) => normalizeCardDefinitionName(effect.name)))] : null });
    unverifiedPrintingsByFormat[declaredFormat] = unknownByName;
    countsByFormat[declaredFormat] = { legal: pool.legal.length, unverified: pool.unverified.length, olderAliases: pool.aliases.length, excluded: pool.excluded.length };
  }
  const retained = definitions.filter((card) => selected.has(card.sourceCardId));
  if (!retained.length) throw new Error("Empty retained reference pool.");
  const coverage = { scope: "tcgdex-retained-standard-en-physical", policyVersion: CARD_DEFINITION_RETENTION_VERSION,
    upstreamListedPrintings: definitions.length, storedPrintings: retained.length, sourceManifestHash,
    currentStandardFormat: currentStandardFormat(), retainedFormats, unsupportedFormats, retainedOn,
    minimumRegulationMark: retainedFormats.map(standardFormatFloor).sort()[0], unlistedSets,
    countsByFormat, unverifiedPrintingsByFormat,
    policySources: [{ sourceUrl: "https://www.pokemon.com/us/play-pokemon/about/pokemon-tcg-banned-card-list", inspectedOn: "2026-10-04", standardBans: [] }],
  };
  return { definitions: retained, sourceCoverage: coverage };
}
/** Validate snapshot context without expiring existing card facts when a new
 * game is played. Format, release and per-name gaps are checked separately. */
export function getCardDefinitionSnapshotCoverage(coverage, playedOn) {
  if (coverage === undefined || coverage?.scope === "tcgdex-listed-en-physical") return "complete";
  if (coverage?.scope !== "tcgdex-retained-standard-en-physical" || coverage.policyVersion !== CARD_DEFINITION_RETENTION_VERSION) return "incomplete";
  const captured = cardDefinitionPlayedDay(coverage.retainedOn), game = cardDefinitionPlayedDay(playedOn);
  return captured && game ? "complete" : "incomplete";
}
/** Completeness is for the retained context, never the upstream archive. Older
 * unsupported/blank formats receive a local coverage gap, not an archive fallback. */
export function getCardDefinitionScopeCoverage(coverage, name, query = {}) {
  if (coverage === undefined || coverage?.scope === "tcgdex-listed-en-physical") return "complete";
  if (getCardDefinitionSnapshotCoverage(coverage, query.playedOn) !== "complete") return "incomplete";
  if (coverage?.scope !== "tcgdex-retained-standard-en-physical" || coverage.policyVersion !== CARD_DEFINITION_RETENTION_VERSION
    || !Array.isArray(coverage.retainedFormats) || !standardFormatFloor(query.declaredFormat)) return "incomplete";
  const floor = partitionCardDefinitionsForFormat([], query).basis.minimumRegulationMark;
  const diagnosticFormat = coverage.retainedFormats.find((format) => standardFormatFloor(format) === floor);
  if (!diagnosticFormat) return "incomplete";
  const indexed = coverage.unverifiedPrintingsByFormat?.[diagnosticFormat];
  if (!indexed || typeof indexed !== "object") return "incomplete";
  const gaps = indexed[normalizeCardDefinitionName(name)] ?? [];
  if (!Array.isArray(gaps)) return "incomplete";
  const observed = query.effectNames?.map(normalizeCardDefinitionName).filter(Boolean) ?? [];
  return gaps.some((card) => {
    if (!card || typeof card.sourceCardId !== "string") return true;
    // A physical release date is not proof of digital unavailability. Missing
    // legacy set IDs cannot borrow an exact set/date announcement mapping.
    if (cardDefinitionAvailability({ setId: typeof card.setId === "string" ? card.setId : "", setReleaseDate: card.setReleaseDate }, query.playedOn).status === "unavailable") return false;
    // Only complete named supplied inventories can mirror full-source effect
    // narrowing. Empty/missing lists remain blockers, never prove absence.
    if (observed.length && Array.isArray(card.effectNames) && card.effectNames.length
      && card.effectNames.every((effect) => typeof effect === "string" && effect.trim())
      && !observed.every((effect) => card.effectNames.includes(effect))) return false;
    return true;
  }) ? "incomplete" : "complete";
}
