import { writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { fetchJsonWithinBoundary } from "../catalog/safe-json-fetch.mjs";
import { normalizeTcgdexCard, normalizeCardDefinitionName, isCardDefinition } from "./source.mjs";

import { createHistoricalEffectEnricher, needsEffectEnrichment } from "./enrichment.mjs";

const API = "https://api.tcgdex.net";
const BATCH = 100;
const FIELDS = `id localId name image category hp trainerType stage types evolveFrom regulationMark effect
  abilities { name effect type } attacks { name effect damage cost } set { id }`;
const options = { allowedOrigins: [API], allowedPathPrefixes: ["/v2/en/sets", "/v2/en/cards", "/v2/graphql"], timeoutMs: 60_000 };
const digest = (ids) => createHash("sha256").update([...ids].sort().join("\n")).digest("hex");
async function mapBounded(items, concurrency, run) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) { const index = next++; await run(items[index], index); }
  }));
}
async function fetchWithRetry(url, config) {
  for (let attempt = 0; ; attempt++) {
    try { return await fetchJsonWithinBoundary(url, config); }
    catch (error) {
      if (attempt >= 2 || !/failed with (429|502|503|504)|timeout|aborted/i.test(String(error))) throw error;
      await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
    }
  }
}
async function manifest() {
  const sets = await fetchJsonWithinBoundary(`${API}/v2/en/sets`, options);
  if (!Array.isArray(sets) || !sets.length || sets.length > 1000) throw new Error("Invalid TCGdex set manifest.");
  const cards = new Map();
  const gaps = [];
  await mapBounded(sets, 6, async (brief) => {
    if (typeof brief.id !== "string") throw new Error("Invalid TCGdex set identity.");
    const set = await fetchJsonWithinBoundary(`${API}/v2/en/sets/${encodeURIComponent(brief.id)}`, options);
    if (set.id !== brief.id || !set.serie?.id || !Array.isArray(set.cards)) throw new Error("Incomplete TCGdex set manifest.");
    if (set.serie.id === "tcgp") return;
    if (set.cards.length !== set.cardCount?.total) gaps.push({ setId: set.id, listed: set.cards.length, physicalTotal: set.cardCount?.total ?? null });
    for (const card of set.cards) {
      if (!card.id || !card.name || cards.has(card.id)) throw new Error("Missing or duplicate source printing identity.");
      cards.set(card.id, { card, set: { id: set.id, releaseDate: set.releaseDate } });
    }
  });
  if (!cards.size) throw new Error("Empty TCGdex corpus.");
  return { cards, hash: digest(cards.keys()), gaps };
}

/** Full provider-listed English physical-card snapshot; no writes when dryRun is true. */
export async function syncCardDefinitionCatalog({ dryRun = false, outputPath, logger = console } = {}) {
  const started = Date.now();
  const first = await manifest();
  const enrich = await createHistoricalEffectEnricher();
  const generationId = randomUUID();
  const syncedAt = new Date().toISOString();
  let supabase;
  if (!dryRun) {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Card definition sync requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await supabase.from("card_definition_generations").insert({ id: generationId, source: "tcgdex", expected_count: first.cards.size, source_manifest_hash: first.hash, source_coverage: { scope: "tcgdex-listed-en-physical", listedPrintings: first.cards.size, unlistedSets: first.gaps } });
    if (error) throw new Error(error.message);
  }
  const ids = [...first.cards.keys()].sort();
  const batches = [];
  for (let i = 0; i < ids.length; i += BATCH) batches.push(ids.slice(i, i + BATCH));
  const definitions = [];
  let prepared = 0;
  let missingHp = 0;
  let missingTrainerText = 0;
  logger.log(`Reading ${ids.length} printings in ${batches.length} GraphQL batches; ${first.gaps.length} sets have known source coverage gaps.`);
  await mapBounded(batches, 4, async (batch) => {
    // GraphQL aliases use indexed identifiers; card IDs remain JSON-escaped literals.
    const query = `{${batch.map((id, i) => `c${i}:card(id:${JSON.stringify(`eq:${id}`)}){${FIELDS}}`).join("\n")}}`;
    const payload = await fetchWithRetry(`${API}/v2/graphql`, {
      ...options,
      fetchImpl: (url, init) => fetch(url, { ...init, method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", "Accept-Language": "en" }, body: JSON.stringify({ query }) })
    });
    if (!payload.data) throw new Error(`TCGdex GraphQL returned no card data: ${JSON.stringify(payload.errors).slice(0, 1000)}`);
    // The GraphQL schema has stricter numeric/null constraints than REST on some old cards.
    // Re-read only affected aliases from the same provider's complete REST card endpoint.
    const failedAliases = new Set();
    for (const error of payload.errors ?? []) {
      const alias = error.path?.[0];
      if (typeof alias !== "string" || !/^c\d+$/.test(alias) || Number(alias.slice(1)) >= batch.length) throw new Error("Unscoped TCGdex GraphQL failure.");
      failedAliases.add(alias);
    }
    await mapBounded([...failedAliases], 2, async (alias) => {
      const id = batch[Number(alias.slice(1))];
      payload.data[alias] = await fetchWithRetry(`${API}/v2/en/cards/${encodeURIComponent(id)}`, options);
      logger.log(`Used complete REST definition for ${id} after GraphQL schema mismatch.`);
    });
    const rows = await Promise.all(batch.map(async (id, i) => {
      const card = payload.data[`c${i}`];
      const entry = first.cards.get(id);
      if (!card || card.id !== id || card.name !== entry.card.name) throw new Error(`TCGdex printing changed during sync: ${JSON.stringify({ expectedId: id, actualId: card?.id, expectedName: entry.card.name, actualName: card?.name })}`);
      // GraphQL represents absent lists as null; the adapter records absent effects as empty lists.
      const definition = await enrich(normalizeTcgdexCard({ ...card, abilities: card.abilities ?? undefined, attacks: card.attacks ?? undefined }, entry.set, syncedAt));
      if (!isCardDefinition(definition)) throw new Error(`Invalid enriched definition: ${id}`);
      if (definition.category === "Pokemon" && definition.hp === null) missingHp++;
      if (definition.category === "Trainer" && definition.rules === null) missingTrainerText++;
      return { generation_id: generationId, source_card_id: id, normalized_card_name: normalizeCardDefinitionName(definition.name), definition };
    }));
    definitions.push(...rows.map((row) => row.definition));
    if (supabase) {
      const { error } = await supabase.from("card_definition_catalog").insert(rows);
      if (error) throw new Error(error.message);
    }
    prepared += rows.length;
    if (prepared % 2000 === 0) logger.log(`Validated ${prepared}/${ids.length} definitions...`);
  });
  const last = await manifest();
  if (last.hash !== first.hash || prepared !== ids.length) throw new Error("TCGdex manifest changed or snapshot incomplete; publication stopped.");
  if (supabase) {
    const { error } = await supabase.rpc("publish_card_definition_generation", { target_generation: generationId });
    if (error) throw new Error(error.message);
    const { data, error: readError } = await supabase.from("card_definition_active").select("generation_id").eq("singleton", true).single();
    if (readError || data.generation_id !== generationId) throw new Error("Published generation readback failed.");
  }
  if (outputPath) await writeFile(outputPath, JSON.stringify(definitions));
  const summary = { dryRun, generationId, cards: prepared, missingHp, missingTrainerText, enriched: definitions.filter((card) => card.effectProvenance).length, remainingEffectGaps: definitions.filter(needsEffectEnrichment).length, coverageGaps: first.gaps, sourceManifestHash: first.hash, elapsedMs: Date.now() - started };
  logger.log(JSON.stringify(summary));
  return summary;
}
