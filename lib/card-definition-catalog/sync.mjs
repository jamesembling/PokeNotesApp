import { selectRetainedCardDefinitions, RETAINED_SAVED_STANDARD_FORMATS } from "./retention.mjs";
import { readSavedFormatInventory, publishCardDefinitionGeneration } from "./publication.mjs";
import { writeFile, mkdir } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { fetchJsonWithinBoundary } from "../catalog/safe-json-fetch.mjs";
import { normalizeTcgdexCard, normalizeCardDefinitionName, isProducedCardDefinition } from "./source.mjs";

import { cardDefinitionPlayedDay } from "./legality.mjs";
import { needsTcgdexRegulationMarkCompletion, applyTcgdexRegulationMarkCompletion } from "./tcgdex-regulation.mjs";
import { createHistoricalEffectEnricher, needsEffectEnrichment } from "./enrichment.mjs";

const API = "https://api.tcgdex.net";
const BATCH = 100;
const FIELDS = `id localId name image category hp trainerType stage types evolveFrom regulationMark energyType effect
  abilities { name effect type } attacks { name effect damage cost } set { id }`;
import reviewedMarks from "./reviewed-regulation-marks.json" with { type: "json" };
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
// Parsed public payloads preserve field presence/null exactly, not wire whitespace.
async function createPublicCapture(directory) {
  const records = [];
  if (directory) await mkdir(directory, { recursive: true });
  return {
    async record(kind, key, url, payload) {
      const bytes = JSON.stringify(payload), payloadSha256 = createHash("sha256").update(bytes).digest("hex");
      if (directory) {
        const filename = `${kind}-${encodeURIComponent(key)}.json`;
        await writeFile(`${directory}/${filename}`, bytes);
        records.push({ filename, url, capturedAt: new Date().toISOString(), payloadSha256 });
      }
      return payloadSha256;
    },
    async flush(metadata) {
      if (directory) await writeFile(`${directory}/capture.json`, JSON.stringify({ ...metadata, parsedJsonOnly: true,
        wireBytesPreserved: false, workflowRunId: /^\d+$/.test(process.env.GITHUB_RUN_ID ?? "") ? process.env.GITHUB_RUN_ID : null,
        workflowRunAttempt: /^\d+$/.test(process.env.GITHUB_RUN_ATTEMPT ?? "") ? process.env.GITHUB_RUN_ATTEMPT : null,
        responses: records }, null, 2));
    },
  };
}
// Only this known public guard contract is serialized; arbitrary client error
// messages, details, headers and environment values never enter artifacts.
function publicPublicationFailure(error) {
  const p = error?.referencePublication;
  const uuid = (v) => typeof v === "string" && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
  const publicId = (v) => typeof v === "string" && /^[A-Za-z0-9_.-]{1,160}$/.test(v);
  const day = (v) => typeof v === "string" && cardDefinitionPlayedDay(v) !== undefined;
  const kinds = ["upstream_count_shrink", "snapshot_horizon_regression", "retained_floor_removed", "diagnostic_domain_added", "diagnostic_domain_changed", "diagnostic_printing_removed", "retained_printing_removed", "operative_field_regression"];
  const field = /^(?:source|name|setId|localId|category|trainerType|setReleaseDate|regulationMark|hp|stage|types|evolvesFrom|energyType|rules|abilities|attacks|additionalPassiveTraits|ruleEvidence|passiveEvidence|effectNames)(?:\[\d+\]|\.(?:name|text|type|damage|cost))*$/;
  if (error?.code !== "REFERENCE_PUBLICATION_REGRESSION" || !p || !uuid(p.activeGenerationId) || !day(p.activeCompletedAt)
    || p.activeRetainedOn !== null && !day(p.activeRetainedOn) || !day(p.proposedRetainedOn) || !Array.isArray(p.reasons) || !p.reasons.length) return undefined;
  const reasons = [];
  for (const r of p.reasons) {
    if (!r || !kinds.includes(r.kind) || r.sourceCardId !== undefined && !publicId(r.sourceCardId)
      || r.fields !== undefined && (!Array.isArray(r.fields) || r.fields.some((v) => typeof v !== "string" || v.length > 160 || !field.test(v)))
      || r.floor !== undefined && !/^[A-J]$/.test(r.floor)
      || ["before", "after"].some((key) => r[key] !== undefined && (!Number.isSafeInteger(r[key]) || r[key] < 0))) return undefined;
    if (r.domain !== undefined) {
      const parts = typeof r.domain === "string" ? r.domain.split("\u0000") : [];
      if (parts.length !== 3 || !/^[A-J]$/.test(parts[0]) || !/^[a-z0-9'+ -]{1,200}$/.test(parts[1]) || !publicId(parts[2])) return undefined;
    }
    reasons.push(Object.fromEntries(["kind", "sourceCardId", "fields", "domain", "floor", "before", "after"].filter((key) => r[key] !== undefined).map((key) => [key, r[key]])));
  }
  return { activeGenerationId: p.activeGenerationId, activeCompletedAt: p.activeCompletedAt, activeRetainedOn: p.activeRetainedOn,
    proposedRetainedOn: p.proposedRetainedOn, reasons };
}
function limitConcurrency(max) {
  const queue = []; let active = 0;
  const drain = () => { while (active < max && queue.length) { const { run, resolve, reject } = queue.shift(); active++;
    Promise.resolve().then(run).then(resolve, reject).finally(() => { active--; drain(); }); } };
  return (run) => new Promise((resolve, reject) => { queue.push({ run, resolve, reject }); drain(); });
}
async function manifest(capture, phase) {
  const sets = await fetchJsonWithinBoundary(`${API}/v2/en/sets`, options);
  await capture.record(`${phase}-sets`, "manifest", `${API}/v2/en/sets`, sets);
  if (!Array.isArray(sets) || !sets.length || sets.length > 1000) throw new Error("Invalid TCGdex set manifest.");
  const cards = new Map();
  const gaps = [];
  await mapBounded(sets, 6, async (brief) => {
    if (typeof brief.id !== "string") throw new Error("Invalid TCGdex set identity.");
    const set = await fetchJsonWithinBoundary(`${API}/v2/en/sets/${encodeURIComponent(brief.id)}`, options);
    await capture.record(`${phase}-set`, brief.id, `${API}/v2/en/sets/${encodeURIComponent(brief.id)}`, set);
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

/** Validate the full upstream privately; only the scoped retained pool is staged.
 * No database reads/writes when dryRun is true. */
export async function syncCardDefinitionCatalog({ dryRun = false, outputPath, upstreamOutputPath, savedFormats = RETAINED_SAVED_STANDARD_FORMATS, logger = console } = {}) {
  const started = Date.now();
  const capture = await createPublicCapture(upstreamOutputPath ? `${upstreamOutputPath}.responses` : undefined);
  const captureMetadata = { startedAt: new Date().toISOString(), status: "reading" };
  let failurePhase = "first_manifest";
  try {
  const first = await manifest(capture, "first");
  captureMetadata.sourceManifestHash = first.hash;
  failurePhase = "historical_reference";
  const enrich = await createHistoricalEffectEnricher();
  const generationId = randomUUID();
  const syncedAt = new Date().toISOString();
  Object.assign(captureMetadata, { generationId, syncedAt });
  let supabase;
  if (!dryRun) {
    failurePhase = "saved_format_inventory";
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Card definition sync requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    savedFormats = await readSavedFormatInventory(supabase);
  }
  const ids = [...first.cards.keys()].sort();
  const batches = [];
  for (let i = 0; i < ids.length; i += BATCH) batches.push(ids.slice(i, i + BATCH));
  const definitions = [];
  const completeWithinBudget = limitConcurrency(2);
  const markCompletion = { checked: 0, completed: 0, unresolved: 0 };
  let prepared = 0;
  let missingHp = 0;
  let missingTrainerText = 0;
  logger.log(`Reading ${ids.length} printings in ${batches.length} GraphQL batches; ${first.gaps.length} sets have known source coverage gaps.`);
  failurePhase = "provider_cards";
  await mapBounded(batches, 4, async (batch) => {
    // GraphQL aliases use indexed identifiers; card IDs remain JSON-escaped literals.
    const query = `{${batch.map((id, i) => `c${i}:card(id:${JSON.stringify(`eq:${id}`)}){${FIELDS}}`).join("\n")}}`;
    const payload = await fetchWithRetry(`${API}/v2/graphql`, {
      ...options,
      fetchImpl: (url, init) => fetch(url, { ...init, method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", "Accept-Language": "en" }, body: JSON.stringify({ query }) })
    });
    await capture.record("graphql", batch[0], `${API}/v2/graphql`, { requestCardIds: batch, payload });
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
      await capture.record("rest-error", id, `${API}/v2/en/cards/${encodeURIComponent(id)}`, payload.data[alias]);
      logger.log(`Used complete REST definition for ${id} after GraphQL schema mismatch.`);
    });
    // Successful GraphQL aliases can still omit source fields. Complete only
    // contemporary missing marks through exact-ID REST, with a separate budget.
    await mapBounded(batch, 2, async (id, index) => {
      const alias = `c${index}`, card = payload.data[alias], entry = first.cards.get(id);
      if (!card || card.id !== id || card.name !== entry.card.name) throw new Error(`TCGdex printing changed during sync: ${id}`);
      if (!failedAliases.has(alias) && needsTcgdexRegulationMarkCompletion(card, entry.set)) {
        await completeWithinBudget(async () => {
          markCompletion.checked++;
          const secondary = await fetchWithRetry(`${API}/v2/en/cards/${encodeURIComponent(id)}`, options);
          await capture.record("rest-mark", id, `${API}/v2/en/cards/${encodeURIComponent(id)}`, secondary);
          payload.data[alias] = applyTcgdexRegulationMarkCompletion(card, secondary, entry.set, new Date().toISOString(), normalizeTcgdexCard);
          if (payload.data[alias] === card) markCompletion.unresolved++; else markCompletion.completed++;
        });
      }
    });
    const rows = await Promise.all(batch.map(async (id, i) => {
      const card = payload.data[`c${i}`];
      const entry = first.cards.get(id);
      if (!card || card.id !== id || card.name !== entry.card.name) throw new Error(`TCGdex printing changed during sync: ${JSON.stringify({ expectedId: id, actualId: card?.id, expectedName: entry.card.name, actualName: card?.name })}`);
      // GraphQL represents absent lists as null; the adapter records absent effects as empty lists.
      const normalized = normalizeTcgdexCard({ ...card, abilities: card.abilities ?? undefined, attacks: card.attacks ?? undefined }, entry.set, syncedAt);
      const review = reviewedMarks.find((known) => known.sourceCardId === id);
      if (review && !["setId", "localId", "name", "hp", "stage", "category"].every((key) => normalized[key] === review[key])) throw new Error(`Conflicting reviewed printing identity: ${id}`);
      if (review && normalized.regulationMark !== null && normalized.regulationMark !== review.regulationMark) throw new Error(`Conflicting reviewed regulation mark: ${id}`);
      const definition = await enrich(normalized);
      if (!isProducedCardDefinition(definition)) throw new Error(`Invalid enriched definition: ${id}`);
      if (definition.category === "Pokemon" && definition.hp === null) missingHp++;
      if (definition.category === "Trainer" && definition.rules === null) missingTrainerText++;
      return { generation_id: generationId, source_card_id: id, normalized_card_name: normalizeCardDefinitionName(definition.name), definition };
    }));
    definitions.push(...rows.map((row) => row.definition));
    prepared += rows.length;
    if (prepared % 2000 === 0) logger.log(`Validated ${prepared}/${ids.length} definitions...`);
  });
  failurePhase = "last_manifest";
  const last = await manifest(capture, "last");
  failurePhase = "snapshot_validation";
  if (last.hash !== first.hash || prepared !== ids.length) throw new Error("TCGdex manifest changed or snapshot incomplete; publication stopped.");
  failurePhase = "retention_selection";
  const retained = selectRetainedCardDefinitions(definitions, { savedFormats, retainedOn: syncedAt, sourceManifestHash: first.hash, unlistedSets: first.gaps });
  failurePhase = "artifact_write";
  if (upstreamOutputPath) await writeFile(upstreamOutputPath, JSON.stringify(definitions));
  if (outputPath) {
    await writeFile(outputPath, JSON.stringify(retained.definitions));
    await writeFile(`${outputPath}.generation.json`, JSON.stringify({ generationId, sourceManifestHash: first.hash, sourceCoverage: retained.sourceCoverage }));
  }
  // Persist only validated public reference data before publication guards run,
  // so a held generation remains independently inspectable outside the database.
  Object.assign(captureMetadata, { generationId, syncedAt, sourceManifestHash: first.hash, upstreamPrintings: prepared,
    retainedPrintings: retained.definitions.length, markCompletion, status: "validated" });
  await capture.flush(captureMetadata);
  if (supabase) {
    failurePhase = "publication";
    await publishCardDefinitionGeneration(supabase, { generationId, sourceManifestHash: first.hash,
      sourceCoverage: retained.sourceCoverage, definitions: retained.definitions, upstreamDefinitions: definitions, expectedSavedFormats: savedFormats });
    captureMetadata.status = "published";
  } else captureMetadata.status = "dry_run_validated";
  const summary = { dryRun, generationId, cards: retained.definitions.length, upstreamCards: prepared,
    missingHp, missingTrainerText, markCompletion, enriched: definitions.filter((card) => card.effectProvenance).length,
    remainingEffectGaps: definitions.filter(needsEffectEnrichment).length, coverageGaps: first.gaps,
    sourceCoverage: retained.sourceCoverage, sourceManifestHash: first.hash, elapsedMs: Date.now() - started };
  logger.log(JSON.stringify({ ...summary, sourceCoverage: { ...retained.sourceCoverage, unverifiedPrintingsByFormat: undefined } }));
  return summary;
  } catch (error) {
    const referencePublication = publicPublicationFailure(error);
    Object.assign(captureMetadata, { status: "failed", failurePhase: referencePublication ? "pre_staging_guard" : failurePhase,
      ...(referencePublication ? { referencePublication } : {}),
      errorClass: ["Error", "TypeError", "RangeError", "SyntaxError", "AbortError"].includes(error?.name) ? error.name : "Error" });
    throw error;
  } finally { await capture.flush(captureMetadata); }
}
