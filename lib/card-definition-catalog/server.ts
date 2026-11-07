import { createPublicClient } from "@/lib/supabase/public";
import { normalizeText } from "@/lib/log-import/normalization";
import { buildCardDefinitionIndex, resolveCardDefinition } from "./resolve";
import { isCardDefinition } from "./source.mjs";
import type { CardDefinition, CardDefinitionCoverage, CardDefinitionEvidenceByName, CardDefinitionEvidence, CardDefinitionQuery } from "./types";

const TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_NAMES = 512;
const BATCH_NAMES = 40;
const PAGE_SIZE = 500;
const MAX_BATCH_ROWS = 10000;
const cache = new Map<string, { expires: number; rows: CardDefinition[] }>();
let activeCache: { id: string; completedAt: string; sourceCoverage: CardDefinitionEvidence["sourceCoverage"]; expires: number } | null = null;

/** Batched raw retained-row lookup, independent of account data and artwork.
 * Preserve the complete union candidates for exact recorded identity lookup;
 * the following resolver applies format/date/effect scope from sourceCoverage. */
export async function loadCardDefinitions(names: readonly string[], signal?: AbortSignal, _context?: Pick<CardDefinitionQuery, "declaredFormat" | "playedOn">): Promise<CardDefinitionEvidenceByName> {
  void _context; // Context belongs to resolution; raw exact-printing lookup preserves the retained union.
  const uniqueNames = [...new Set(names.map(normalizeText).filter(Boolean))].sort();
  const result: CardDefinitionEvidenceByName = {};
  const empty = buildCardDefinitionIndex([]);
  for (const name of uniqueNames) result[name] = resolveCardDefinition(empty, { name }, "unavailable");
  if (!uniqueNames.length) return result;
  try {
    const supabase = createPublicClient();
    const requestSignal = signal ?? AbortSignal.timeout(8000);
    let active = activeCache && activeCache.expires > Date.now() ? activeCache : null;
    if (!active) {
      const { data: pointer, error } = await supabase.from("card_definition_active")
        .select("generation_id,generation:card_definition_generations(id,completed_at,source_coverage)")
        .eq("singleton", true).abortSignal(requestSignal).maybeSingle();
      const generation = pointer?.generation;
      if (error || !generation?.completed_at) return result;
      active = { id: generation.id, completedAt: generation.completed_at, sourceCoverage: generation.source_coverage as CardDefinitionEvidence["sourceCoverage"], expires: Date.now() + TTL_MS };
      activeCache = active;
    }
    const age = Date.now() - Date.parse(active.completedAt);
    // Publication age does not invalidate supplied card text or HP. Retain the
    // last published data while refreshes catch up; reject invalid provenance.
    if (!Number.isFinite(age) || age < 0) {
      for (const name of uniqueNames) result[name] = { ...resolveCardDefinition(empty, { name }, "stale", active.id), sourceCoverage: active.sourceCoverage };
      return result;
    }
    const generationId = active.id;
    const missing: string[] = [];
    for (const name of uniqueNames) {
      const hit = cache.get(`${generationId}:${name}`);
      if (hit && hit.expires > Date.now()) result[name] = resolveCardDefinition(buildCardDefinitionIndex(hit.rows), { name }, "complete", generationId);
      else missing.push(name);
    }
    const batches: string[][] = [];
    for (let i = 0; i < missing.length; i += BATCH_NAMES) batches.push(missing.slice(i, i + BATCH_NAMES));
    await Promise.all(batches.map(async (batch) => {
      let coverage: CardDefinitionCoverage = "complete";
      let rows: CardDefinition[] = [];
      try {
        let expected: number | null = null;
        for (let offset = 0; offset < MAX_BATCH_ROWS; offset += PAGE_SIZE) {
          const { data, error, count } = await supabase.from("card_definition_catalog")
            .select("definition", { count: "exact" }).eq("generation_id", generationId)
            .in("normalized_card_name", batch).order("source_card_id")
            .range(offset, offset + PAGE_SIZE - 1).abortSignal(requestSignal);
          if (error || !Array.isArray(data) || !Number.isInteger(count) || count! > MAX_BATCH_ROWS
            || (expected !== null && expected !== count) || data.some((row) => !isCardDefinition(row.definition))) {
            coverage = "incomplete"; break;
          }
          expected = count;
          rows.push(...data.map((row) => row.definition as CardDefinition));
          if (rows.length === expected) break;
          if (data.length !== PAGE_SIZE) { coverage = "incomplete"; break; }
        }
        if (rows.length !== expected) coverage = "incomplete";
        if (coverage !== "complete") rows = [];
      } catch { coverage = "unavailable"; }
      const index = buildCardDefinitionIndex(rows);
      for (const name of batch) {
        result[name] = resolveCardDefinition(index, { name }, coverage, generationId);
        if (coverage === "complete") {
          cache.set(`${generationId}:${name}`, { expires: Date.now() + TTL_MS, rows: index.get(name) ?? [] });
          while (cache.size > MAX_CACHE_NAMES) cache.delete(cache.keys().next().value!);
        }
      }
    }));
  } catch { /* Unavailable metadata degrades to explicit unknown facts. */ }
  if (activeCache) for (const value of Object.values(result)) {
    if (value.generation === activeCache.id) value.sourceCoverage = activeCache.sourceCoverage;
  }
  return result;
}
