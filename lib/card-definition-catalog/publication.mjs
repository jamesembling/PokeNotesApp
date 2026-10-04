import { cardDefinitionPlayedDay, standardFormatFloor, cardDefinitionAvailability } from "./legality.mjs";
import { selectRetainedCardDefinitions, CARD_DEFINITION_RETENTION_VERSION } from "./retention.mjs";
import { normalizeCardDefinitionName, isCardDefinition, isProducedCardDefinition, isCardRuleEvidence, isCardPassiveEvidence } from "./source.mjs";

/** Service-role publication reads format only, never account or raw log fields. */
export async function readSavedFormatInventory(client) {
  const formats = new Set(); let expected;
  for (let offset = 0; offset < 1000000; offset += 500) {
    const { data, error, count } = await client.from("logs").select("format", { count: "exact" }).order("format").range(offset, offset + 499);
    if (error || !Array.isArray(data) || !Number.isInteger(count) || count < 0 || expected !== undefined && count !== expected)
      throw new Error("Saved format inventory failed or changed during pagination.");
    expected = count;
    data.forEach((row) => { if (row.format !== null && typeof row.format !== "string") throw new Error("Malformed saved format."); formats.add((row.format ?? '').trim()); });
    if (offset + data.length === count) return [...formats].sort();
    if (data.length !== 500) throw new Error("Incomplete saved format inventory.");
  }
  throw new Error("Saved format inventory exceeds its bounded read.");
}
const sameInventory = (left, right) => JSON.stringify([...new Set(left)].sort()) === JSON.stringify([...new Set(right)].sort());
const RETAINED_SCOPE = "tcgdex-retained-standard-en-physical";
const MAX_REFERENCE_ROWS = 100000;
const sameValue = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const known = (value) => value !== null && value !== undefined;
const floors = (coverage) => [...new Set(coverage.retainedFormats.map(standardFormatFloor))].sort();
function diagnosticDomains(coverage) {
  if (coverage.policyVersion !== CARD_DEFINITION_RETENTION_VERSION || !Array.isArray(coverage.retainedFormats)
    || !coverage.retainedFormats.length || coverage.retainedFormats.some((format) => !standardFormatFloor(format))
    || !cardDefinitionPlayedDay(coverage.retainedOn) || !Number.isSafeInteger(coverage.storedPrintings) || coverage.storedPrintings <= 0
    || !Number.isSafeInteger(coverage.upstreamListedPrintings) || coverage.upstreamListedPrintings < coverage.storedPrintings)
    throw new Error("Invalid active retained scope; nothing was staged.");
  const domains = new Map();
  for (const format of coverage.retainedFormats) {
    const indexed = coverage.unverifiedPrintingsByFormat?.[format];
    if (!indexed || typeof indexed !== "object" || Array.isArray(indexed)) throw new Error("Invalid active diagnostic inventory; nothing was staged.");
    for (const [name, gaps] of Object.entries(indexed)) {
      if (!Array.isArray(gaps)) throw new Error("Invalid active diagnostic inventory; nothing was staged.");
      for (const gap of gaps) {
        if (!gap || typeof gap.sourceCardId !== "string" || !gap.sourceCardId
          || gap.setId !== undefined && typeof gap.setId !== "string"
          || gap.setReleaseDate !== null && typeof gap.setReleaseDate !== "string"
          || gap.effectNames !== null && (!Array.isArray(gap.effectNames) || gap.effectNames.some((effect) => typeof effect !== "string" || !effect.trim())))
          throw new Error("Invalid active diagnostic inventory; nothing was staged.");
        const key = `${standardFormatFloor(format)}\u0000${normalizeCardDefinitionName(name)}\u0000${gap.sourceCardId}`;
        const value = { ...gap, effectNames: gap.effectNames === null ? null : [...new Set(gap.effectNames.map(normalizeCardDefinitionName))].sort() };
        if (domains.has(key) && !sameValue(domains.get(key), value)) throw new Error("Conflicting active floor diagnostics; nothing was staged.");
        domains.set(key, value);
      }
    }
  }
  return domains;
}
function conflicts(previous, proposed, path, changes, omittedEffectInventory = false) {
  if (!known(previous)) return;
  if (Array.isArray(previous)) {
    // Only top-level absent Ability/attack lists normalize to []. The caller
    // may exempt that unknown inventory; nested arrays (including free attack
    // costs) and other explicitly supplied empty fields remain known values.
    if (!previous.length && omittedEffectInventory) return;
    if (!Array.isArray(proposed) || previous.length !== proposed.length) { changes.push(path); return; }
    previous.forEach((value, index) => conflicts(value, proposed[index], `${path}[${index}]`, changes));
  } else if (previous && typeof previous === "object") {
    if (!proposed || typeof proposed !== "object" || Array.isArray(proposed)) { changes.push(path); return; }
    for (const [key, value] of Object.entries(previous)) conflicts(value, proposed[key], `${path}.${key}`, changes);
  } else if (!sameValue(previous, proposed)) changes.push(path);
}
/** Compare metadata without carrying forward rows or waiving unknown evidence.
 * A legacy full archive is projected to the authorized retained floor union. */
export function getCardDefinitionPublicationRegressions(active, proposal) {
  const reasons = [];
  const previousScope = active.sourceCoverage;
  if (!previousScope || ![RETAINED_SCOPE, "tcgdex-listed-en-physical"].includes(previousScope.scope))
    throw new Error("Unsupported active reference scope; nothing was staged.");
  const retained = previousScope.scope === RETAINED_SCOPE;
  const previousRows = retained ? active.definitions : selectRetainedCardDefinitions(active.definitions, {
    savedFormats: proposal.sourceCoverage.retainedFormats, retainedOn: proposal.sourceCoverage.retainedOn,
    sourceManifestHash: proposal.sourceCoverage.sourceManifestHash,
  }).definitions;
  const nextRows = new Map(proposal.definitions.map((card) => [card.sourceCardId, card]));
  const nextUpstream = new Map((proposal.upstreamDefinitions ?? []).map((card) => [card.sourceCardId, card]));
  const previousUpstream = retained ? previousScope.upstreamListedPrintings : previousScope.listedPrintings;
  if (!Number.isSafeInteger(previousUpstream) || previousUpstream < active.definitions.length)
    throw new Error("Invalid active upstream count; nothing was staged.");
  if (proposal.sourceCoverage.upstreamListedPrintings < previousUpstream) reasons.push({ kind: "upstream_count_shrink", before: previousUpstream, after: proposal.sourceCoverage.upstreamListedPrintings });
  if (retained) {
    const oldDomains = diagnosticDomains(previousScope), newDomains = diagnosticDomains(proposal.sourceCoverage);
    const oldFloors = floors(previousScope), nextFloors = floors(proposal.sourceCoverage);
    if (cardDefinitionPlayedDay(proposal.sourceCoverage.retainedOn) < cardDefinitionPlayedDay(previousScope.retainedOn)) reasons.push({ kind: "snapshot_horizon_regression" });
    for (const floor of oldFloors) if (!nextFloors.includes(floor)) reasons.push({ kind: "retained_floor_removed", floor });
    for (const [domain, gap] of newDomains) {
      if (!oldFloors.includes(domain.split("\u0000")[0])) continue;
      // A newly indexed, exactly unavailable launch is not a new possible
      // printing at capture. It remains indexed for later query-time guards.
      const previous = oldDomains.get(domain);
      if (!previous && cardDefinitionAvailability({ setId: gap.setId ?? "", setReleaseDate: gap.setReleaseDate }, proposal.sourceCoverage.retainedOn).status === "unavailable") continue;
      if (!previous) reasons.push({ kind: "diagnostic_domain_added", domain });
      else {
        const fields = [];
        for (const field of ["setId", "setReleaseDate", "effectNames"]) conflicts(previous[field], gap[field], field, fields);
        if (fields.length) reasons.push({ kind: "diagnostic_domain_changed", domain, fields });
      }
    }
    for (const [domain, previous] of oldDomains) {
      if (newDomains.has(domain) || nextRows.has(previous.sourceCardId)) continue;
      // A resolved legal row can close a gap. Otherwise its disappearance from
      // the compact index must still be supported by the validated upstream,
      // rather than silently certifying that a lost printing never existed.
      const supplied = nextUpstream.get(previous.sourceCardId);
      if (!supplied) { reasons.push({ kind: "diagnostic_printing_removed", domain, sourceCardId: previous.sourceCardId }); continue; }
      const namedEffects = [...supplied.abilities, ...supplied.attacks];
      const effectNames = namedEffects.length && namedEffects.every((effect) => typeof effect.name === "string" && effect.name.trim())
        ? [...new Set(namedEffects.map((effect) => normalizeCardDefinitionName(effect.name)))].sort() : null;
      const fields = [];
      for (const field of ["setId", "setReleaseDate"]) conflicts(previous[field], supplied[field], field, fields);
      conflicts(previous.effectNames, effectNames, "effectNames", fields);
      if (normalizeCardDefinitionName(supplied.name) !== domain.split("\u0000")[1]) fields.push("name");
      if (fields.length) reasons.push({ kind: "diagnostic_domain_changed", domain, fields });
    }
  }
  for (const previous of previousRows) {
    const next = nextRows.get(previous.sourceCardId);
    if (!next) { reasons.push({ kind: "retained_printing_removed", sourceCardId: previous.sourceCardId }); continue; }
    const fields = [];
    const completeRules = previous.ruleEvidence?.scope === "printed_rule_box" && previous.ruleEvidence.status !== "unknown" && isCardRuleEvidence(previous);
    const completePassive = previous.passiveEvidence?.status === "verified_complete" && isCardPassiveEvidence(previous);
    for (const field of ["source", "name", "setId", "localId", "category", "trainerType", "setReleaseDate", "regulationMark", "hp", "stage", "types", "evolvesFrom", "energyType", "rules", "abilities", "attacks", "additionalPassiveTraits"])
      conflicts(previous[field], next[field], field, fields, field === "attacks" || field === "abilities" && !completePassive);
    if (completeRules && (next.ruleEvidence?.scope !== "printed_rule_box" || next.ruleEvidence.status !== previous.ruleEvidence.status || !isCardRuleEvidence(next))) fields.push("ruleEvidence");
    if (completePassive && (next.passiveEvidence?.status !== "verified_complete" || !isCardPassiveEvidence(next))) fields.push("passiveEvidence");
    if (fields.length) reasons.push({ kind: "operative_field_regression", sourceCardId: previous.sourceCardId, fields });
  }
  return reasons;
}
async function activePointer(client) {
  const { data, error } = await client.from("card_definition_active").select("generation_id").eq("singleton", true).maybeSingle();
  if (error || data !== null && (!data || typeof data.generation_id !== "string" || !data.generation_id)) throw new Error("Active reference pointer read failed; nothing was staged.");
  return data?.generation_id ?? null;
}
async function readActiveReference(client) {
  const generationId = await activePointer(client);
  if (generationId === null) {
    const { count, error } = await client.from("card_definition_generations").select("id", { count: "exact", head: true }).not("completed_at", "is", null).limit(1);
    if (error || count !== 0 || await activePointer(client) !== null) throw new Error("Active reference pointer is missing or changed; nothing was staged.");
    return null;
  }
  const { data: generation, error } = await client.from("card_definition_generations").select("id,completed_at,expected_count,source_coverage").eq("id", generationId).single();
  if (error || generation?.id !== generationId || typeof generation.completed_at !== "string" || generation.completed_at.length <= 10 || !cardDefinitionPlayedDay(generation.completed_at)
    || !Number.isSafeInteger(generation.expected_count) || generation.expected_count <= 0 || generation.expected_count > MAX_REFERENCE_ROWS)
    throw new Error("Active reference generation is incomplete or malformed; nothing was staged.");
  const scopeCount = generation.source_coverage?.scope === RETAINED_SCOPE ? generation.source_coverage.storedPrintings : generation.source_coverage?.listedPrintings;
  if (scopeCount !== generation.expected_count) throw new Error("Active reference scope count does not match its generation; nothing was staged.");
  const definitions = [], seen = new Set();
  for (let offset = 0; offset < MAX_REFERENCE_ROWS; offset += 500) {
    const { data, error: rowError, count } = await client.from("card_definition_catalog").select("generation_id,source_card_id,definition", { count: "exact" }).eq("generation_id", generationId).order("source_card_id").range(offset, offset + 499);
    if (rowError || !Array.isArray(data) || count !== generation.expected_count || data.length > 500)
      throw new Error("Active reference row inventory changed or failed; nothing was staged.");
    for (const row of data) {
      if (row.generation_id !== generationId || !isCardDefinition(row.definition) || row.source_card_id !== row.definition.sourceCardId || seen.has(row.source_card_id))
        throw new Error("Active reference rows are malformed or duplicated; nothing was staged.");
      seen.add(row.source_card_id); definitions.push(row.definition);
    }
    if (definitions.length === count) break;
    if (data.length !== 500 || definitions.length > count) throw new Error("Active reference pagination is incomplete; nothing was staged.");
  }
  if (definitions.length !== generation.expected_count || await activePointer(client) !== generationId)
    throw new Error("Active reference snapshot changed before staging.");
  return { generationId, completedAt: generation.completed_at, sourceCoverage: generation.source_coverage, definitions };
}
/** Stage only validated retained rows, then use the existing atomic publication RPC.
 * Its two-snapshot/24-hour retirement policy is unchanged. */
export async function publishCardDefinitionGeneration(client, { generationId, sourceManifestHash, sourceCoverage, definitions, upstreamDefinitions, expectedSavedFormats, beforePublish }) {
  if (beforePublish !== undefined && typeof beforePublish !== "function") throw new Error("Invalid publication boundary hook; nothing was staged.");
  if (!Array.isArray(upstreamDefinitions) || !upstreamDefinitions.length || upstreamDefinitions.some((card) => !isProducedCardDefinition(card))
    || new Set(upstreamDefinitions.map((card) => card.sourceCardId)).size !== upstreamDefinitions.length) throw new Error("Invalid upstream generation; nothing was staged.");
  const capture = upstreamDefinitions[0].syncedAt;
  if (typeof capture !== "string" || capture.length <= 10 || !cardDefinitionPlayedDay(capture)
    || upstreamDefinitions.some((card) => card.syncedAt !== capture)) throw new Error("Invalid upstream generation capture; nothing was staged.");
  if (sourceCoverage?.retainedOn !== capture) throw new Error("Invalid retained generation capture; nothing was staged.");
  const expectedScope = selectRetainedCardDefinitions(upstreamDefinitions, { savedFormats: expectedSavedFormats, retainedOn: sourceCoverage?.retainedOn,
    sourceManifestHash, unlistedSets: sourceCoverage?.unlistedSets });
  if (sourceCoverage?.scope !== "tcgdex-retained-standard-en-physical" || sourceCoverage.policyVersion !== CARD_DEFINITION_RETENTION_VERSION || sourceCoverage.storedPrintings !== definitions.length
    || sourceCoverage.upstreamListedPrintings < definitions.length || sourceCoverage.sourceManifestHash !== sourceManifestHash
    || JSON.stringify(sourceCoverage) !== JSON.stringify(expectedScope.sourceCoverage) || JSON.stringify(definitions) !== JSON.stringify(expectedScope.definitions)
    || !definitions.length || new Set(definitions.map((card) => card.sourceCardId)).size !== definitions.length || definitions.some((card) => !isProducedCardDefinition(card)))
    throw new Error("Invalid retained generation; nothing was staged.");
  if (!sameInventory(expectedSavedFormats, await readSavedFormatInventory(client))) throw new Error("Saved format scope changed before staging.");
  const active = await readActiveReference(client);
  if (active) {
    const regressions = getCardDefinitionPublicationRegressions(active, { sourceCoverage, definitions, upstreamDefinitions });
    if (regressions.length) throw Object.assign(new Error(`Reference publication held before staging: ${JSON.stringify(regressions)}`), {
      code: "REFERENCE_PUBLICATION_REGRESSION",
      referencePublication: {
        activeGenerationId: active.generationId,
        activeCompletedAt: active.completedAt,
        activeRetainedOn: active.sourceCoverage.scope === RETAINED_SCOPE ? active.sourceCoverage.retainedOn : null,
        proposedRetainedOn: sourceCoverage.retainedOn,
        reasons: regressions,
      },
    });
  }
  const { error } = await client.from("card_definition_generations").insert({ id: generationId, source: "tcgdex", expected_count: definitions.length, source_manifest_hash: sourceManifestHash, source_coverage: sourceCoverage });
  if (error) throw new Error(error.message);
  for (let start = 0; start < definitions.length; start += 500) {
    const rows = definitions.slice(start, start + 500).map((definition) => ({ generation_id: generationId, source_card_id: definition.sourceCardId,
      normalized_card_name: normalizeCardDefinitionName(definition.name), definition }));
    const { error: rowError } = await client.from("card_definition_catalog").insert(rows);
    if (rowError) throw new Error(rowError.message);
  }
  if (!sameInventory(expectedSavedFormats, await readSavedFormatInventory(client))) throw new Error("Saved format scope changed; staged generation remains unpublished.");
  // Controlled workflow publications are serialized. This detects a changed
  // pointer; it is not a general atomic compare-and-swap across other writers.
  if (await activePointer(client) !== (active?.generationId ?? null)) throw new Error("Active reference changed; staged generation remains unpublished.");
  if (beforePublish) await beforePublish();
  const { error: publishError } = await client.rpc("publish_card_definition_generation", { target_generation: generationId });
  if (publishError) throw new Error(publishError.message);
  const { data, error: readError } = await client.from("card_definition_active").select("generation_id").eq("singleton", true).single();
  if (readError || data?.generation_id !== generationId) throw new Error("Published generation readback failed.");
  return { generationId, storedPrintings: definitions.length, readbackVerified: true };
}
