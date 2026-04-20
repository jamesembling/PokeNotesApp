import { createClient } from "@supabase/supabase-js";
import { buildSpecialPokemonCatalogRows } from "./special-forms.mjs";

const SPECIES_PAGE_SIZE = 100;
const UPSERT_BATCH_SIZE = 50;
const MAX_NATIONAL_DEX = 1025;
const EVOLUTION_CHAIN_DELAY_MS = 200;
const SPECIES_LIST_URL = "https://pokeapi.co/api/v2/pokemon-species";
const LIMITLESS_CDN_BASE = "https://r2.limitlesstcg.net/pokemon/gen9";

const evolutionChainCache = new Map();

function getSupabaseAdminEnv() {
  const supabaseUrl =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEW_SUPABASE_URL ||
    "";
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEW_SUPABASE_SERVICE_KEY ||
    "";

  return {
    configured: Boolean(supabaseUrl && serviceRoleKey),
    supabaseUrl,
    serviceRoleKey,
  };
}

function createAdminSupabaseClient() {
  const { configured, supabaseUrl, serviceRoleKey } = getSupabaseAdminEnv();

  if (!configured) {
    throw new Error(
      "Missing admin Supabase environment variables. Set SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL (or NEW_SUPABASE_URL/NEW_SUPABASE_SERVICE_KEY).",
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fetchJson(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status} ${response.statusText}: ${url}`);
  }

  return response.json();
}

function normalizeLanguageCode(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function titleizeSlug(slug) {
  if (typeof slug !== "string" || !slug) return "";

  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getLocalizedName(names, languageCode) {
  if (!Array.isArray(names)) return null;

  const target = normalizeLanguageCode(languageCode);
  const match = names.find((entry) => {
    const code = normalizeLanguageCode(entry?.language?.name);
    return code === target;
  });

  return typeof match?.name === "string" ? match.name : null;
}

function stageFromDepth(depth) {
  if (depth <= 0) return "Basic";
  if (depth === 1) return "Stage 1";
  return "Stage 2";
}

function walkEvolutionChain(node, parentSlug = null, depth = 0, stageMap = new Map()) {
  const slug = node?.species?.name;
  if (typeof slug !== "string" || !slug) {
    return stageMap;
  }

  const existing = stageMap.get(slug);
  const nextRecord = {
    evolvesFrom: parentSlug,
    stage: stageFromDepth(depth),
    depth,
  };

  if (!existing || depth < existing.depth) {
    stageMap.set(slug, nextRecord);
  }

  const evolvesTo = Array.isArray(node.evolves_to) ? node.evolves_to : [];
  for (const child of evolvesTo) {
    walkEvolutionChain(child, slug, depth + 1, stageMap);
  }

  return stageMap;
}

async function getEvolutionStageMap(evolutionChainUrl) {
  const cached = evolutionChainCache.get(evolutionChainUrl);
  if (cached) {
    return cached;
  }

  await sleep(EVOLUTION_CHAIN_DELAY_MS);
  const payload = await fetchJson(evolutionChainUrl);
  const stageMap = walkEvolutionChain(payload?.chain);
  evolutionChainCache.set(evolutionChainUrl, stageMap);
  return stageMap;
}

async function fetchSpeciesSummaries() {
  const summaries = [];

  for (let offset = 0; summaries.length < MAX_NATIONAL_DEX; offset += SPECIES_PAGE_SIZE) {
    const url = `${SPECIES_LIST_URL}?limit=${SPECIES_PAGE_SIZE}&offset=${offset}`;
    const payload = await fetchJson(url);
    const results = Array.isArray(payload?.results) ? payload.results : [];

    if (results.length === 0) {
      break;
    }

    summaries.push(...results);
  }

  return summaries.slice(0, MAX_NATIONAL_DEX);
}

function buildCatalogRow(speciesPayload, evolutionStageMap, lastSyncedAt) {
  const slug = speciesPayload?.name;
  const nationalDex = speciesPayload?.id;

  if (typeof slug !== "string" || !slug) {
    throw new Error("Species payload missing valid name");
  }

  if (typeof nationalDex !== "number" || !Number.isInteger(nationalDex)) {
    throw new Error(`Species ${slug} missing valid national dex number`);
  }

  const names = Array.isArray(speciesPayload.names) ? speciesPayload.names : [];
  const englishName = getLocalizedName(names, "en");
  const evolutionMeta = evolutionStageMap.get(slug) ?? {
    evolvesFrom: null,
    stage: "Basic",
  };

  return {
    slug,
    label: englishName ?? titleizeSlug(slug),
    national_dex: nationalDex,
    stage: evolutionMeta.stage,
    evolves_from: evolutionMeta.evolvesFrom,
    sprite_url: `${LIMITLESS_CDN_BASE}/${slug}.png`,
    name_de: getLocalizedName(names, "de"),
    name_es: getLocalizedName(names, "es"),
    name_fr: getLocalizedName(names, "fr"),
    name_it: getLocalizedName(names, "it"),
    name_pt_br: getLocalizedName(names, "pt-br"),
    last_synced_at: lastSyncedAt,
  };
}

async function upsertSingleRow(supabase, row) {
  const { error } = await supabase
    .from("pokemon_catalog")
    .upsert(row, { onConflict: "slug" });

  if (error) {
    throw new Error(error.message);
  }
}

async function upsertBatch(supabase, rows) {
  if (rows.length === 0) {
    return { succeeded: 0, failed: 0 };
  }

  const { error } = await supabase
    .from("pokemon_catalog")
    .upsert(rows, { onConflict: "slug" });

  if (!error) {
    return { succeeded: rows.length, failed: 0 };
  }

  let succeeded = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      await upsertSingleRow(supabase, row);
      succeeded += 1;
    } catch {
      failed += 1;
    }
  }

  return { succeeded, failed };
}

async function updateEvolvesFrom(supabase, row) {
  const { error } = await supabase
    .from("pokemon_catalog")
    .update({ evolves_from: row.evolves_from })
    .eq("slug", row.slug);

  if (error) {
    throw new Error(error.message);
  }
}

export async function syncPokemonCatalog({ logger = console } = {}) {
  const supabase = createAdminSupabaseClient();

  logger.log("Fetching Pokemon species list...");
  const speciesSummaries = await fetchSpeciesSummaries();
  logger.log(`Loaded ${speciesSummaries.length} species summaries.`);

  let processed = 0;
  const catalogRows = [];
  const syncedAt = new Date().toISOString();

  for (const summary of speciesSummaries) {
    const slug = summary?.name ?? "unknown";

    try {
      const speciesPayload = await fetchJson(summary.url);

      if (speciesPayload.id > MAX_NATIONAL_DEX) {
        continue;
      }

      const evolutionChainUrl = speciesPayload?.evolution_chain?.url;
      if (typeof evolutionChainUrl !== "string" || !evolutionChainUrl) {
        throw new Error(`Species ${slug} missing evolution chain URL`);
      }

      const evolutionStageMap = await getEvolutionStageMap(evolutionChainUrl);
      const row = buildCatalogRow(speciesPayload, evolutionStageMap, syncedAt);
      catalogRows.push(row);
      processed += 1;

      if (processed % 50 === 0) {
        logger.log(`Prepared ${processed} Pokemon...`);
      }
    } catch (error) {
      processed += 1;
      logger.error(`Failed to process ${slug}: ${error.message}`);

      if (processed % 50 === 0) {
        logger.log(`Prepared ${processed} Pokemon...`);
      }
    }
  }

  const megaCatalogRows = buildSpecialPokemonCatalogRows({
    category: "mega",
    lastSyncedAt: syncedAt,
  });
  catalogRows.push(...megaCatalogRows);
  logger.log(`Prepared ${megaCatalogRows.length} Mega Pokemon forms.`);

  const supplementalCatalogRows = buildSpecialPokemonCatalogRows({
    category: "special-form",
    lastSyncedAt: syncedAt,
  });
  catalogRows.push(...supplementalCatalogRows);
  logger.log(`Prepared ${supplementalCatalogRows.length} supplemental Pokemon forms.`);

  logger.log("Pass 1: inserting Pokemon with evolves_from set to null...");

  let pass1Succeeded = 0;
  let pass1Failed = 0;
  let pendingRows = [];

  for (const row of catalogRows) {
    pendingRows.push({ ...row, evolves_from: null });

    if (pendingRows.length >= UPSERT_BATCH_SIZE) {
      const batchResult = await upsertBatch(supabase, pendingRows);
      pass1Succeeded += batchResult.succeeded;
      pass1Failed += batchResult.failed;
      pendingRows = [];
    }
  }

  if (pendingRows.length > 0) {
    const batchResult = await upsertBatch(supabase, pendingRows);
    pass1Succeeded += batchResult.succeeded;
    pass1Failed += batchResult.failed;
  }

  logger.log(`Pass 1 complete. Succeeded: ${pass1Succeeded}. Failed: ${pass1Failed}.`);
  logger.log("Pass 2: updating evolves_from values...");

  const evolutionRows = catalogRows.filter((row) => row.evolves_from !== null);
  let pass2Succeeded = 0;
  let pass2Failed = 0;
  let pass2Processed = 0;

  for (const row of evolutionRows) {
    try {
      await updateEvolvesFrom(supabase, row);
      pass2Succeeded += 1;
    } catch (error) {
      pass2Failed += 1;
      logger.error(`Failed to update evolves_from for ${row.slug}: ${error.message}`);
    }

    pass2Processed += 1;
    if (pass2Processed % 50 === 0) {
      logger.log(`Updated evolves_from for ${pass2Processed} Pokemon...`);
    }
  }

  const summary = {
    prepared: catalogRows.length,
    pass1Succeeded,
    pass1Failed,
    pass2Succeeded,
    pass2Failed,
    syncedAt,
  };

  logger.log("Pokemon catalog sync complete.");
  return summary;
}
