import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { fetchMegaPokemonForms } from "./lib/pokemon-catalog/mega-forms.mjs";

const REQUIRED_ENV_VARS = ["NEW_SUPABASE_URL", "NEW_SUPABASE_SERVICE_KEY"];

const SPECIES_PAGE_SIZE = 100;
const UPSERT_BATCH_SIZE = 50;
const MAX_NATIONAL_DEX = 1025;
const EVOLUTION_CHAIN_DELAY_MS = 200;
const SPECIES_LIST_URL = "https://pokeapi.co/api/v2/pokemon-species";
const LIMITLESS_CDN_BASE = "https://r2.limitlesstcg.net/pokemon/gen9";
const SUPPLEMENTAL_POKEMON_FORMS = [
  { slug: "ogerpon", label: "Teal Mask Ogerpon", evolves_from: null },
  { slug: "ogerpon-cornerstone", label: "Cornerstone Mask Ogerpon", evolves_from: null },
  { slug: "ogerpon-wellspring", label: "Wellspring Mask Ogerpon", evolves_from: null },
  { slug: "ogerpon-hearthflame", label: "Hearthflame Mask Ogerpon", evolves_from: null },
  { slug: "ursaluna-bloodmoon", label: "Bloodmoon Ursaluna", evolves_from: null },
  { slug: "dialga-origin", label: "Origin Forme Dialga", evolves_from: null },
  { slug: "palkia-origin", label: "Origin Forme Palkia", evolves_from: null },
  { slug: "zoroark-hisui", label: "Hisuian Zoroark", evolves_from: null },
];

for (const envVar of REQUIRED_ENV_VARS) {
  if (!process.env[envVar]) {
    console.error(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

const supabase = createClient(
  process.env.NEW_SUPABASE_URL,
  process.env.NEW_SUPABASE_SERVICE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

const evolutionChainCache = new Map();

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

function buildCatalogRow(speciesPayload, evolutionStageMap) {
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
    last_synced_at: new Date().toISOString(),
  };
}

async function upsertSingleRow(row) {
  const { error } = await supabase
    .from("pokemon_catalog")
    .upsert(row, { onConflict: "slug" });

  if (error) {
    throw new Error(error.message);
  }
}

async function upsertBatch(rows) {
  if (rows.length === 0) {
    return { succeeded: 0, failed: 0 };
  }

  const { error } = await supabase
    .from("pokemon_catalog")
    .upsert(rows, { onConflict: "slug" });

  if (!error) {
    return { succeeded: rows.length, failed: 0 };
  }

  console.error(
    `Batch upsert failed for ${rows.length} rows, retrying individually: ${error.message}`,
  );

  let succeeded = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      await upsertSingleRow(row);
      succeeded += 1;
    } catch (rowError) {
      failed += 1;
      console.error(`Failed to upsert ${row.slug}: ${rowError.message}`);
    }
  }

  return { succeeded, failed };
}

async function updateEvolvesFrom(row) {
  const { error } = await supabase
    .from("pokemon_catalog")
    .update({ evolves_from: row.evolves_from })
    .eq("slug", row.slug);

  if (error) {
    throw new Error(error.message);
  }
}

async function main() {
  console.log("Fetching Pokemon species list...");
  const speciesSummaries = await fetchSpeciesSummaries();
  console.log(`Loaded ${speciesSummaries.length} species summaries.`);

  let processed = 0;
  const catalogRows = [];

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
      const row = buildCatalogRow(speciesPayload, evolutionStageMap);
      catalogRows.push(row);
      processed += 1;

      if (processed % 50 === 0) {
        console.log(`Prepared ${processed} Pokemon...`);
      }
    } catch (error) {
      processed += 1;
      console.error(`Failed to process ${slug}: ${error.message}`);

      if (processed % 50 === 0) {
        console.log(`Prepared ${processed} Pokemon...`);
      }
    }
  }

  const megaCatalogRows = await fetchMegaPokemonForms();
  catalogRows.push(...megaCatalogRows);
  console.log(`Prepared ${megaCatalogRows.length} Mega Pokemon forms.`);

  const supplementalCatalogRows = SUPPLEMENTAL_POKEMON_FORMS.map((form) => ({
    slug: form.slug,
    label: form.label,
    national_dex: null,
    stage: "Basic",
    evolves_from: form.evolves_from,
    sprite_url: `${LIMITLESS_CDN_BASE}/${form.slug}.png`,
    name_de: null,
    name_es: null,
    name_fr: null,
    name_it: null,
    name_pt_br: null,
    last_synced_at: new Date().toISOString(),
  }));
  catalogRows.push(...supplementalCatalogRows);
  console.log(`Prepared ${supplementalCatalogRows.length} supplemental Pokemon forms.`);

  console.log("");
  console.log("Pass 1: inserting Pokemon with evolves_from set to null...");

  let pass1Succeeded = 0;
  let pass1Failed = 0;
  let pendingRows = [];

  for (const row of catalogRows) {
    pendingRows.push({ ...row, evolves_from: null });

    if (pendingRows.length >= UPSERT_BATCH_SIZE) {
      const batchResult = await upsertBatch(pendingRows);
      pass1Succeeded += batchResult.succeeded;
      pass1Failed += batchResult.failed;
      pendingRows = [];
    }
  }

  if (pendingRows.length > 0) {
    const batchResult = await upsertBatch(pendingRows);
    pass1Succeeded += batchResult.succeeded;
    pass1Failed += batchResult.failed;
  }

  console.log(`Pass 1 complete. Succeeded: ${pass1Succeeded}. Failed: ${pass1Failed}.`);
  console.log("");
  console.log("Pass 2: updating evolves_from values...");

  const evolutionRows = catalogRows.filter((row) => row.evolves_from !== null);
  let pass2Succeeded = 0;
  let pass2Failed = 0;
  let pass2Processed = 0;

  for (const row of evolutionRows) {
    try {
      await updateEvolvesFrom(row);
      pass2Succeeded += 1;
    } catch (error) {
      pass2Failed += 1;
      console.error(`Failed to update evolves_from for ${row.slug}: ${error.message}`);
    }

    pass2Processed += 1;
    if (pass2Processed % 50 === 0) {
      console.log(`Updated evolves_from for ${pass2Processed} Pokemon...`);
    }
  }

  console.log("");
  console.log("Seed complete.");
  console.log(`Pass 1 succeeded: ${pass1Succeeded}`);
  console.log(`Pass 1 failed: ${pass1Failed}`);
  console.log(`Pass 2 succeeded: ${pass2Succeeded}`);
  console.log(`Pass 2 failed: ${pass2Failed}`);
}

main().catch((error) => {
  console.error(`Fatal error: ${error.message}`);
  process.exit(1);
});
