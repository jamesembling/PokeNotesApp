import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { getArchetypeEnrichment } from "./lib/pokemon-catalog/archetype-enrichments.mjs";

const REQUIRED_ENV_VARS = ["NEW_SUPABASE_URL", "NEW_SUPABASE_SERVICE_KEY"];
const ARCHETYPE_SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1iaD24w087dP6_Wj7z60uaKIi7XzZweRZjlkJlTfLRWc/export?format=csv&gid=0";
const ARCHETYPE_TABLE = "archetype_catalog";
const UPSERT_BATCH_SIZE = 50;
const LOOKUP_BATCH_SIZE = 1000;
const EXCLUDED_ARCHETYPE_IDS = new Set(["toedscruel-ex"]);
const EXPLICIT_NAME_TO_SLUG = {
  "teal mask ogerpon": "ogerpon",
  "cornerstone mask ogerpon": "ogerpon-cornerstone",
  "wellspring mask ogerpon": "ogerpon-wellspring",
  "hearthflame mask ogerpon": "ogerpon-hearthflame",
};

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

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "'")
    .toLowerCase()
    .replace(/[^a-z0-9'+-]+/g, " ")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTrainerPrefix(value) {
  return normalizeWhitespace(value).replace(/^[A-Za-z0-9 .-]+'s\s+/i, "").trim();
}

function pushVariant(target, value) {
  const normalized = normalizeText(stripTrainerPrefix(value));
  if (normalized) {
    target.add(normalized);
  }
}

function buildMegaVariants(label) {
  const variants = new Set();
  const megaPrefix = String(label || "").match(/^Mega\s+(.+)$/i);
  if (megaPrefix) {
    pushVariant(variants, `${megaPrefix[1]} Mega`);
  }

  const megaSuffix = String(label || "").match(/^(.+)\s+Mega(?:\s+([XY]))?$/i);
  if (megaSuffix) {
    const [, base, form] = megaSuffix;
    pushVariant(variants, `Mega ${base}${form ? ` ${form}` : ""}`);
  }

  return Array.from(variants);
}

function buildOriginVariants(label) {
  const variants = new Set();
  const originPrefix = String(label || "").match(/^Origin Forme\s+(.+)$/i);
  if (originPrefix) {
    pushVariant(variants, `${originPrefix[1]} Origin`);
    pushVariant(variants, `${originPrefix[1]} Origin Forme`);
  }

  return Array.from(variants);
}

function normalizePokemonText(value) {
  return stripTrainerPrefix(
    String(value || "")
      .trim()
      .replace(/^Stage\s+[12]\s+/i, "")
      .replace(/^Basic\s+/i, ""),
  )
    .trim()
    .replace(/\b(ex|vstar|vmax|v|gx)\b/gi, " ")
    .replace(/[’']/g, "")
    .replace(/\./g, " ")
    .replace(/:/g, " ")
    .replace(/♀/g, " f ")
    .replace(/♂/g, " m ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function buildPokemonNameCandidates(name) {
  const normalized = normalizePokemonText(name);
  if (!normalized) {
    return [];
  }

  const candidates = new Set([normalized]);
  const tokens = normalized.split(" ").filter(Boolean);

  if (tokens[0] === "mega" && tokens.length > 1) {
    candidates.add(`${tokens.slice(1).join(" ")} mega`);
  }
  if (tokens[0] === "bloodmoon" && tokens.length > 1) {
    candidates.add(`${tokens.slice(1).join(" ")} bloodmoon`);
    candidates.add(tokens.slice(1).join(" "));
  }
  if (tokens[0] === "radiant" && tokens.length > 1) {
    candidates.add(`${tokens.slice(1).join(" ")} radiant`);
    candidates.add(tokens.slice(1).join(" "));
  }

  const regionalPrefixes = new Set(["alolan", "galarian", "hisuian", "paldean"]);
  if (regionalPrefixes.has(tokens[0]) && tokens.length > 1) {
    candidates.add(`${tokens.slice(1).join(" ")} ${tokens[0]}`);
    candidates.add(tokens.slice(1).join(" "));
  }

  if (tokens.includes("ogerpon")) {
    candidates.add("ogerpon");
  }

  return Array.from(candidates);
}

function buildLegacySpriteSlug(name) {
  const clean = normalizePokemonText(name);
  const explicitMap = {
    ...EXPLICIT_NAME_TO_SLUG,
    "bloodmoon ursaluna": "ursaluna-bloodmoon",
    "mr mime": "mr-mime",
    "mr rime": "mr-rime",
    "mime jr": "mime-jr",
    "type null": "type-null",
    "ho oh": "ho-oh",
    "porygon z": "porygon-z",
    "jangmo o": "jangmo-o",
    "hakamo o": "hakamo-o",
    "kommo o": "kommo-o",
  };

  if (explicitMap[clean]) {
    return explicitMap[clean];
  }

  let tokens = clean.split(" ").filter(Boolean);
  if (tokens.length === 0) {
    return "";
  }

  if (tokens[0] === "mega" && tokens.length > 1) {
    tokens = tokens.slice(1).concat("mega");
  }
  if (tokens[0] === "bloodmoon" && tokens.length > 1) {
    tokens = tokens.slice(1).concat("bloodmoon");
  }
  if (tokens[0] === "radiant" && tokens.length > 1) {
    tokens = tokens.slice(1).concat("radiant");
  }

  const regionalPrefixes = new Set(["alolan", "galarian", "hisuian", "paldean"]);
  if (regionalPrefixes.has(tokens[0]) && tokens.length > 1) {
    tokens = tokens.slice(1).concat(tokens[0]);
  }

  return tokens.join("-").replace(/[^a-z0-9-]/g, "");
}

function buildPokemonVariants(row) {
  const variants = new Set();
  [
    row.label,
    row.name_de,
    row.name_es,
    row.name_fr,
    row.name_it,
    row.name_pt_br,
  ]
    .filter((value) => typeof value === "string" && value.trim().length > 0)
    .forEach((value) => {
      pushVariant(variants, value);
      buildMegaVariants(value).forEach((variant) => pushVariant(variants, variant));
      buildOriginVariants(value).forEach((variant) => pushVariant(variants, variant));
    });

  if (String(row.slug || "").endsWith("-hisui")) {
    const base = String(row.label || "").replace(/^Hisuian\s+/i, "");
    if (base) {
      pushVariant(variants, `${base} Hisui`);
    }
  }

  return Array.from(variants);
}

async function loadPokemonLookup() {
  const rows = [];

  for (let from = 0; ; from += LOOKUP_BATCH_SIZE) {
    const to = from + LOOKUP_BATCH_SIZE - 1;
    const { data, error } = await supabase
      .from("pokemon_catalog")
      .select("slug,label,evolves_from,name_de,name_es,name_fr,name_it,name_pt_br")
      .range(from, to);

    if (error) {
      throw new Error(`Failed to load pokemon catalog: ${error.message}`);
    }

    const batch = data ?? [];
    rows.push(...batch);

    if (batch.length < LOOKUP_BATCH_SIZE) {
      break;
    }
  }

  const nameToSlug = new Map();
  const knownSlugs = new Set();
  const slugToAncestors = new Map();
  const bySlug = new Map();

  for (const row of rows) {
    if (typeof row?.slug !== "string" || !row.slug) {
      continue;
    }

    bySlug.set(row.slug, row);
    knownSlugs.add(row.slug);
    buildPokemonVariants(row).forEach((variant) => {
      if (!nameToSlug.has(variant)) {
        nameToSlug.set(variant, row.slug);
      }
    });
  }

  for (const row of bySlug.values()) {
    const ancestors = [];
    let cursor = row.evolves_from;
    while (cursor) {
      ancestors.push(cursor);
      cursor = bySlug.get(cursor)?.evolves_from ?? null;
    }
    slugToAncestors.set(row.slug, ancestors);
  }

  return {
    knownSlugs,
    nameToSlug,
    slugToAncestors,
  };
}

function resolvePokemonSlug(name, pokemonLookup) {
  const normalizedName = normalizePokemonText(name);
  if (EXPLICIT_NAME_TO_SLUG[normalizedName]) {
    return EXPLICIT_NAME_TO_SLUG[normalizedName];
  }

  for (const candidate of buildPokemonNameCandidates(name)) {
    const matchedSlug = pokemonLookup.nameToSlug.get(candidate);
    if (matchedSlug) {
      return matchedSlug;
    }
  }

  const fallbackSlug = buildLegacySpriteSlug(name);
  if (fallbackSlug && pokemonLookup.knownSlugs.has(fallbackSlug)) {
    return fallbackSlug;
  }

  throw new Error(`Could not resolve Pokemon slug for "${name}"`);
}

function parseCsv(text) {
  const rows = [];
  let currentRow = [];
  let currentValue = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const nextCharacter = text[index + 1];

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        currentValue += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === "," && !inQuotes) {
      currentRow.push(currentValue);
      currentValue = "";
      continue;
    }

    if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }
      currentRow.push(currentValue);
      rows.push(currentRow);
      currentRow = [];
      currentValue = "";
      continue;
    }

    currentValue += character;
  }

  if (currentValue.length > 0 || currentRow.length > 0) {
    currentRow.push(currentValue);
    rows.push(currentRow);
  }

  return rows;
}

function parseNameListCell(value) {
  return normalizeWhitespace(String(value || ""))
    .replace(/[\r\n]+/g, ",")
    .replace(/[.;]+/g, ",")
    .split(",")
    .map((entry) => normalizeWhitespace(entry))
    .filter(Boolean);
}

function uniqueStrings(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function validateRequiredMatchGroups(requiredMatchGroups, context) {
  const slugToGroupIndexes = new Map();

  requiredMatchGroups.forEach((group, groupIndex) => {
    group.forEach((slug) => {
      const seenInGroups = slugToGroupIndexes.get(slug) ?? [];
      seenInGroups.push(groupIndex + 1);
      slugToGroupIndexes.set(slug, seenInGroups);
    });
  });

  const overlappingEntries = Array.from(slugToGroupIndexes.entries())
    .filter(([, groupIndexes]) => groupIndexes.length > 1)
    .map(([slug, groupIndexes]) => `${slug} (groups ${groupIndexes.join(", ")})`);

  if (overlappingEntries.length > 0) {
    throw new Error(
      `Row ${context.rowNumber} (${context.label}) has overlapping required match groups: ${overlappingEntries.join("; ")}`
    );
  }
}

function buildArchetypeId(sprites) {
  return uniqueStrings(
    sprites
      .map((value) => normalizeWhitespace(value).toLowerCase())
      .filter(Boolean),
  )
    .sort((left, right) => left.localeCompare(right))
    .join("+");
}

async function fetchArchetypeSheetCsv() {
  const response = await fetch(ARCHETYPE_SHEET_CSV_URL, {
    headers: {
      Accept: "text/csv,text/plain",
      "User-Agent": "PokeNotes Archetype Sync",
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status} ${response.statusText}`);
  }

  return response.text();
}

function parseArchetypeSheet(csvText, pokemonLookup) {
  const rows = parseCsv(csvText).filter((row) => row.some((cell) => normalizeWhitespace(cell).length > 0));
  const [headerRow, ...dataRows] = rows;

  if (!headerRow) {
    throw new Error("Archetype sheet is empty.");
  }

  const headerIndexes = new Map(
    headerRow.map((value, index) => [normalizeText(value), index]),
  );

  const requiredHeaders = [
    "archetype poke 1",
    "archetype poke 2",
    "identify from 1",
    "identify from 2",
  ];

  for (const header of requiredHeaders) {
    if (!headerIndexes.has(header)) {
      throw new Error(`Archetype sheet is missing required header: ${header}`);
    }
  }

  const parsedEntries = [];
  const seenIds = new Set();

  for (const [rowIndex, row] of dataRows.entries()) {
    const spriteLabels = [
      row[headerIndexes.get("archetype poke 1")] ?? "",
      row[headerIndexes.get("archetype poke 2")] ?? "",
    ]
      .map((value) => normalizeWhitespace(value))
      .filter(Boolean);

    if (spriteLabels.length === 0) {
      continue;
    }

    const spriteSlugs = uniqueStrings(
      spriteLabels.map((label) => resolvePokemonSlug(label, pokemonLookup)),
    );
    const id = buildArchetypeId(spriteSlugs);

    if (!id) {
      throw new Error(`Row ${rowIndex + 2} has no resolvable archetype sprites.`);
    }

    if (seenIds.has(id)) {
      throw new Error(`Row ${rowIndex + 2} duplicates archetype id ${id}.`);
    }

    seenIds.add(id);

    const requiredMatchGroups = [
      row[headerIndexes.get("identify from 1")] ?? "",
      row[headerIndexes.get("identify from 2")] ?? "",
    ]
      .map((value) => parseNameListCell(value))
      .filter((group) => group.length > 0)
      .map((group) => uniqueStrings(group.map((name) => resolvePokemonSlug(name, pokemonLookup))));

    validateRequiredMatchGroups(requiredMatchGroups, {
      rowNumber: rowIndex + 2,
      label: spriteLabels.join(" / "),
    });

    const fallbackGroups =
      requiredMatchGroups.length > 0
        ? requiredMatchGroups
        : spriteLabels.map((label) => [resolvePokemonSlug(label, pokemonLookup)]);
    const completedRequiredMatchGroups =
      spriteSlugs.length > 1
        ? spriteSlugs.reduce((groups, sprite) => {
            const ancestors = pokemonLookup.slugToAncestors.get(sprite) ?? [];
            const isCovered = groups.some(
              (group) =>
                group.includes(sprite) || ancestors.some((ancestor) => group.includes(ancestor)),
            );
            return isCovered ? groups : [...groups, uniqueStrings([sprite, ...ancestors])];
          }, fallbackGroups)
        : fallbackGroups;

    parsedEntries.push({
      id,
      label: spriteLabels.join(" / "),
      sprites: spriteSlugs,
      detectionSprites: uniqueStrings([...spriteSlugs, ...completedRequiredMatchGroups.flat()]),
      requiredMatchGroups: completedRequiredMatchGroups,
      is_excluded: EXCLUDED_ARCHETYPE_IDS.has(id),
    });
  }

  return parsedEntries;
}

async function loadExistingExcludedIds(ids) {
  const excludedIds = new Set();

  for (let index = 0; index < ids.length; index += UPSERT_BATCH_SIZE) {
    const chunk = ids.slice(index, index + UPSERT_BATCH_SIZE);

    const { data, error } = await supabase
      .from(ARCHETYPE_TABLE)
      .select("id,is_excluded")
      .in("id", chunk)
      .eq("is_excluded", true);

    if (error) {
      throw new Error(`Failed to load existing exclusions: ${error.message}`);
    }

    for (const row of data ?? []) {
      if (typeof row?.id === "string" && row.is_excluded === true) {
        excludedIds.add(row.id);
      }
    }
  }

  return excludedIds;
}

function buildUpsertRows(entries, existingExcludedIds) {
  const lastSyncedAt = new Date().toISOString();

  return entries.map((entry) => {
    const enrichment = getArchetypeEnrichment(entry.id);

    return {
      id: entry.id,
      label: entry.label,
      sprites: enrichment?.sprites ?? entry.sprites,
      detection_sprites: enrichment?.detectionSprites ?? entry.detectionSprites,
      required_match_groups: enrichment?.requiredMatchGroups ?? entry.requiredMatchGroups,
      is_excluded: entry.is_excluded || existingExcludedIds.has(entry.id),
      last_synced_at: lastSyncedAt,
    };
  });
}

async function deleteMissingRows(activeIds) {
  const { data, error } = await supabase.from(ARCHETYPE_TABLE).select("id");

  if (error) {
    throw new Error(`Failed to load existing archetype ids: ${error.message}`);
  }

  const activeIdSet = new Set(activeIds);
  const staleIds = (data ?? [])
    .map((row) => row?.id)
    .filter((id) => typeof id === "string" && id.length > 0 && !activeIdSet.has(id));

  let deleted = 0;

  for (let index = 0; index < staleIds.length; index += UPSERT_BATCH_SIZE) {
    const chunk = staleIds.slice(index, index + UPSERT_BATCH_SIZE);
    const { error: deleteError } = await supabase.from(ARCHETYPE_TABLE).delete().in("id", chunk);

    if (deleteError) {
      throw new Error(`Failed to delete stale archetypes: ${deleteError.message}`);
    }

    deleted += chunk.length;
  }

  return deleted;
}

async function upsertSingleRow(row) {
  const { error } = await supabase.from(ARCHETYPE_TABLE).upsert(row, { onConflict: "id" });

  if (error) {
    throw new Error(error.message);
  }
}

async function upsertBatch(rows) {
  if (rows.length === 0) {
    return { succeeded: 0, failed: 0 };
  }

  const { error } = await supabase.from(ARCHETYPE_TABLE).upsert(rows, { onConflict: "id" });

  if (!error) {
    return { succeeded: rows.length, failed: 0 };
  }

  console.error(
    `Batch upsert failed for ${rows.length} archetypes, retrying individually: ${error.message}`,
  );

  let succeeded = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      await upsertSingleRow(row);
      succeeded += 1;
    } catch (rowError) {
      failed += 1;
      console.error(`Failed to upsert ${row.id}: ${rowError.message}`);
    }
  }

  return { succeeded, failed };
}

async function main() {
  console.log("Loading pokemon catalog lookup...");
  const pokemonLookup = await loadPokemonLookup();

  console.log("Fetching archetype sheet...");
  const csvText = await fetchArchetypeSheetCsv();

  console.log("Parsing archetype sheet rows...");
  const parsedEntries = parseArchetypeSheet(csvText, pokemonLookup);
  const ids = parsedEntries.map((entry) => entry.id);

  console.log(`Parsed ${parsedEntries.length} archetypes from the Google Sheet.`);
  console.log("Loading existing excluded archetypes...");
  const existingExcludedIds = await loadExistingExcludedIds(ids);
  const rows = buildUpsertRows(parsedEntries, existingExcludedIds);

  let succeeded = 0;
  let failed = 0;

  for (let index = 0; index < rows.length; index += UPSERT_BATCH_SIZE) {
    const batch = rows.slice(index, index + UPSERT_BATCH_SIZE);
    const batchNumber = Math.floor(index / UPSERT_BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(rows.length / UPSERT_BATCH_SIZE);

    console.log(`Upserting batch ${batchNumber}/${totalBatches} (${batch.length} archetypes)...`);

    const result = await upsertBatch(batch);
    succeeded += result.succeeded;
    failed += result.failed;
  }

  console.log("Removing stale archetypes not present in the sheet...");
  const deleted = await deleteMissingRows(ids);

  console.log("");
  console.log("Archetype seed summary");
  console.log(`Parsed rows: ${parsedEntries.length}`);
  console.log(`Existing exclusions preserved: ${existingExcludedIds.size}`);
  console.log(`Successful upserts: ${succeeded}`);
  console.log(`Failed upserts: ${failed}`);
  console.log(`Deleted stale rows: ${deleted}`);
}

main().catch((error) => {
  console.error(`Archetype seed failed: ${error.message}`);
  process.exit(1);
});
