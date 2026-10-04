import { cardDefinitionPlayedDay } from "./legality.mjs";
import { selectRetainedCardDefinitions, CARD_DEFINITION_RETENTION_VERSION } from "./retention.mjs";
import { normalizeCardDefinitionName, isProducedCardDefinition } from "./source.mjs";

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
/** Stage only validated retained rows, then use the existing atomic publication RPC.
 * Its two-snapshot/24-hour retirement policy is unchanged. */
export async function publishCardDefinitionGeneration(client, { generationId, sourceManifestHash, sourceCoverage, definitions, upstreamDefinitions, expectedSavedFormats }) {
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
  const { error } = await client.from("card_definition_generations").insert({ id: generationId, source: "tcgdex", expected_count: definitions.length, source_manifest_hash: sourceManifestHash, source_coverage: sourceCoverage });
  if (error) throw new Error(error.message);
  for (let start = 0; start < definitions.length; start += 500) {
    const rows = definitions.slice(start, start + 500).map((definition) => ({ generation_id: generationId, source_card_id: definition.sourceCardId,
      normalized_card_name: normalizeCardDefinitionName(definition.name), definition }));
    const { error: rowError } = await client.from("card_definition_catalog").insert(rows);
    if (rowError) throw new Error(rowError.message);
  }
  if (!sameInventory(expectedSavedFormats, await readSavedFormatInventory(client))) throw new Error("Saved format scope changed; staged generation remains unpublished.");
  const { error: publishError } = await client.rpc("publish_card_definition_generation", { target_generation: generationId });
  if (publishError) throw new Error(publishError.message);
  const { data, error: readError } = await client.from("card_definition_active").select("generation_id").eq("singleton", true).single();
  if (readError || data?.generation_id !== generationId) throw new Error("Published generation readback failed.");
  return { generationId, storedPrintings: definitions.length, readbackVerified: true };
}
