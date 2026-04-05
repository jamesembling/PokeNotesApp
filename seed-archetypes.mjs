import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const REQUIRED_ENV_VARS = ["NEW_SUPABASE_URL", "NEW_SUPABASE_SERVICE_KEY"];

const LIMITLESS_DECKS_URL = "https://limitlesstcg.com/decks";
const ARCHETYPE_TABLE = "archetype_catalog";
const UPSERT_BATCH_SIZE = 50;
const EXCLUDED_ARCHETYPE_IDS = new Set(["toedscruel-ex"]);
const SPRITE_SRC_PATTERN =
  /https:\/\/(?:r2\.limitlesstcg\.net|limitless3\.limitlesstcg\.net)\/pokemon\/gen9\/([a-z0-9-]+)\.png/gi;

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

function stripTags(value) {
  return value.replace(/<[^>]*>/g, " ");
}

function decodeHtmlEntities(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

function parseLabel(anchorHtml) {
  return normalizeWhitespace(decodeHtmlEntities(stripTags(anchorHtml)));
}

function extractSprites(rowHtml) {
  const sprites = [];
  const seen = new Set();

  for (const match of rowHtml.matchAll(SPRITE_SRC_PATTERN)) {
    const slug = match[1]?.trim();
    if (!slug || seen.has(slug)) {
      continue;
    }

    seen.add(slug);
    sprites.push(slug);
  }

  return sprites;
}

function parseArchetypeRows(html) {
  const rows = html.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? [];
  const parsedEntries = [];
  const skipped = {
    other: 0,
    emptyId: 0,
    noSprites: 0,
    noAnchor: 0,
    blankLabel: 0,
  };

  for (const rowHtml of rows) {
    const cells = rowHtml.match(/<td\b[\s\S]*?<\/td>/gi) ?? [];
    if (cells.length < 3) {
      skipped.noAnchor += 1;
      continue;
    }

    const spriteCellHtml = cells[1] ?? "";
    const linkCellHtml = cells[2] ?? "";
    const anchorMatch = linkCellHtml.match(
      /<a\b[^>]*href="\/decks\/(\d+)"[^>]*>([\s\S]*?)<\/a>/i,
    );

    if (!anchorMatch) {
      skipped.noAnchor += 1;
      continue;
    }

    const imageTags = spriteCellHtml.match(/<img\b[^>]*>/gi) ?? [];
    if (imageTags.length === 0) {
      skipped.noSprites += 1;
      continue;
    }

    const sprites = [];
    const seen = new Set();

    for (const imageTag of imageTags) {
      const altMatch = imageTag.match(/\balt="([^"]+)"/i);
      const alt = normalizeWhitespace(decodeHtmlEntities(altMatch?.[1] ?? ""));
      if (!alt || seen.has(alt)) {
        continue;
      }

      seen.add(alt);
      sprites.push(alt);
    }

    const id = sprites[0] ?? "";
    const label = parseLabel(anchorMatch[2] ?? "");

    if (!id) {
      skipped.emptyId += 1;
      continue;
    }

    if (!label) {
      skipped.blankLabel += 1;
      continue;
    }

    if (id === "other") {
      skipped.other += 1;
      continue;
    }

    if (sprites.length === 0) {
      skipped.noSprites += 1;
      continue;
    }

    parsedEntries.push({
      id,
      label,
      sprites,
      is_excluded: EXCLUDED_ARCHETYPE_IDS.has(id),
    });
  }

  return { parsedEntries, skipped };
}

async function fetchDeckIndexHtml() {
  const response = await fetch(LIMITLESS_DECKS_URL, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "PokeNotes Archetype Sync",
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status} ${response.statusText}`);
  }

  return response.text();
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

  return entries.map((entry) => ({
    id: entry.id,
    label: entry.label,
    sprites: entry.sprites,
    is_excluded: entry.is_excluded || existingExcludedIds.has(entry.id),
    last_synced_at: lastSyncedAt,
  }));
}

async function upsertSingleRow(row) {
  const { error } = await supabase
    .from(ARCHETYPE_TABLE)
    .upsert(row, { onConflict: "id" });

  if (error) {
    throw new Error(error.message);
  }
}

async function upsertBatch(rows) {
  if (rows.length === 0) {
    return { succeeded: 0, failed: 0 };
  }

  const { error } = await supabase
    .from(ARCHETYPE_TABLE)
    .upsert(rows, { onConflict: "id" });

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
  console.log("Fetching Limitless archetype index...");
  const html = await fetchDeckIndexHtml();

  console.log("Parsing archetype rows...");
  const { parsedEntries, skipped } = parseArchetypeRows(html);
  const ids = parsedEntries.map((entry) => entry.id);

  console.log(`Parsed ${parsedEntries.length} archetypes with sprites.`);
  console.log(
    `Skipped rows: other=${skipped.other}, emptyId=${skipped.emptyId}, noSprites=${skipped.noSprites}, blankLabel=${skipped.blankLabel}`,
  );

  console.log("Loading existing excluded archetypes...");
  const existingExcludedIds = await loadExistingExcludedIds(ids);
  const rows = buildUpsertRows(parsedEntries, existingExcludedIds);

  let succeeded = 0;
  let failed = 0;

  for (let index = 0; index < rows.length; index += UPSERT_BATCH_SIZE) {
    const batch = rows.slice(index, index + UPSERT_BATCH_SIZE);
    const batchNumber = Math.floor(index / UPSERT_BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(rows.length / UPSERT_BATCH_SIZE);

    console.log(
      `Upserting batch ${batchNumber}/${totalBatches} (${batch.length} archetypes)...`,
    );

    const result = await upsertBatch(batch);
    succeeded += result.succeeded;
    failed += result.failed;
  }

  console.log("");
  console.log("Archetype seed summary");
  console.log(`Parsed rows: ${parsedEntries.length}`);
  console.log(`Existing exclusions preserved: ${existingExcludedIds.size}`);
  console.log(`Successful upserts: ${succeeded}`);
  console.log(`Failed upserts: ${failed}`);
}

main().catch((error) => {
  console.error(`Archetype seed failed: ${error.message}`);
  process.exit(1);
});
