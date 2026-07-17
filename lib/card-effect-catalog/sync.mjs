import { createClient } from "@supabase/supabase-js";
import { fetchJsonWithinBoundary } from "../catalog/safe-json-fetch.mjs";

const POKEMON_TCG_API_URL = "https://api.pokemontcg.io/v2/cards";
const PAGE_SIZE = 250;
const MAX_PAGE_COUNT = 200;
const UPSERT_BATCH_SIZE = 500;
const SELECT_FIELDS = [
  "id",
  "name",
  "supertype",
  "subtypes",
  "abilities",
  "attacks"
].join(",");

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
    serviceRoleKey
  };
}

function createAdminSupabaseClient() {
  const { configured, supabaseUrl, serviceRoleKey } = getSupabaseAdminEnv();

  if (!configured) {
    throw new Error(
      "Missing admin Supabase environment variables. Set SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL (or NEW_SUPABASE_URL/NEW_SUPABASE_SERVICE_KEY)."
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
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

function mapTrainerSubtypeToEffectKind(subtypes) {
  const normalizedSubtypes = Array.isArray(subtypes)
    ? subtypes.map((subtype) => normalizeText(subtype))
    : [];

  if (normalizedSubtypes.includes("supporter")) return "supporter";
  if (normalizedSubtypes.includes("item")) return "item";
  if (normalizedSubtypes.includes("pokemon tool") || normalizedSubtypes.includes("tool")) return "tool";
  if (normalizedSubtypes.includes("stadium")) return "stadium";
  return null;
}

function buildRowsForCard(card, syncedAt) {
  const cardName = String(card?.name || "").trim();
  const sourceCardId = String(card?.id || "").trim();

  if (!cardName || !sourceCardId) {
    return [];
  }

  const baseRow = {
    source_card_id: sourceCardId,
    card_name: cardName,
    normalized_card_name: normalizeText(cardName),
    supertype: String(card?.supertype || "").trim(),
    subtypes: Array.isArray(card?.subtypes) ? card.subtypes : [],
    last_synced_at: syncedAt
  };

  const rows = [];
  const trainerKind = mapTrainerSubtypeToEffectKind(card?.subtypes);
  if (trainerKind) {
    rows.push({
      ...baseRow,
      effect_kind: trainerKind,
      effect_name: null,
      normalized_effect_name: "",
      effect_text: null
    });
  }

  if (Array.isArray(card?.abilities)) {
    card.abilities.forEach((ability) => {
      const effectName = String(ability?.name || "").trim();
      if (!effectName) return;

      rows.push({
        ...baseRow,
        effect_kind: "ability",
        effect_name: effectName,
        normalized_effect_name: normalizeText(effectName),
        effect_text: typeof ability?.text === "string" ? ability.text : null
      });
    });
  }

  if (Array.isArray(card?.attacks)) {
    card.attacks.forEach((attack) => {
      const effectName = String(attack?.name || "").trim();
      if (!effectName) return;

      rows.push({
        ...baseRow,
        effect_kind: "attack",
        effect_name: effectName,
        normalized_effect_name: normalizeText(effectName),
        effect_text: typeof attack?.text === "string" ? attack.text : null
      });
    });
  }

  return rows;
}

export function recordUniqueCardIds(cards, seenCardIds) {
  for (const card of cards) {
    const sourceCardId = String(card?.id || "").trim();
    const cardName = String(card?.name || "").trim();
    if (!sourceCardId || !cardName || seenCardIds.has(sourceCardId)) {
      throw new Error("Pokemon TCG API returned missing or repeated card identities.");
    }

    seenCardIds.add(sourceCardId);
  }
}

export function normalizeCardCatalogSetId(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (!/^[a-z0-9]+$/.test(normalized)) {
    throw new Error("Pokemon TCG set id must contain only letters and numbers.");
  }

  return normalized;
}

async function fetchCardPage(page, setId) {
  const searchParams = new URLSearchParams({
    page: String(page),
    pageSize: String(PAGE_SIZE),
    select: SELECT_FIELDS
  });
  if (setId) {
    searchParams.set("q", `set.id:${setId}`);
  }
  const headers = {};

  if (process.env.POKEMON_TCG_API_KEY) {
    headers["X-Api-Key"] = process.env.POKEMON_TCG_API_KEY;
  }

  return fetchJsonWithinBoundary(`${POKEMON_TCG_API_URL}?${searchParams.toString()}`, {
    allowedOrigins: ["https://api.pokemontcg.io"],
    allowedPathPrefixes: ["/v2/cards"],
    headers,
    timeoutMs: 60_000
  });
}

async function upsertBatch(supabase, rows) {
  if (rows.length === 0) {
    return;
  }

  const { error } = await supabase
    .from("card_effect_catalog")
    .upsert(rows, {
      onConflict: "source_card_id,effect_kind,normalized_effect_name"
    });

  if (error) {
    throw new Error(error.message);
  }
}

export function assertUsableCardCatalog({ cardCount, expectedCardCount, prepared }) {
  if (
    cardCount === 0 ||
    prepared === 0 ||
    !Number.isSafeInteger(expectedCardCount) ||
    expectedCardCount <= 0 ||
    cardCount !== expectedCardCount
  ) {
    throw new Error(
      "Pokemon TCG API returned an incomplete catalog; destructive publication was stopped."
    );
  }
}

export async function syncCardEffectCatalog({ logger = console, setId } = {}) {
  const supabase = createAdminSupabaseClient();
  const normalizedSetId = normalizeCardCatalogSetId(setId);
  const syncedAt = new Date().toISOString();
  let page = 1;
  let prepared = 0;
  let cardCount = 0;
  let expectedCardCount = null;
  let pendingRows = [];
  const seenCardIds = new Set();

  logger.log(
    normalizedSetId
      ? `Fetching Pokemon TCG card effect catalog for set ${normalizedSetId}...`
      : "Fetching Pokemon TCG card effect catalog..."
  );

  while (true) {
    if (page > MAX_PAGE_COUNT) {
      throw new Error("Pokemon TCG API exceeded the configured page limit.");
    }

    const payload = await fetchCardPage(page, normalizedSetId);
    const cards = Array.isArray(payload?.data) ? payload.data : [];
    const totalCount = Number(payload?.totalCount);
    const pageSize = Number(payload?.pageSize);
    const currentPage = Number(payload?.page);

    if (
      !Number.isSafeInteger(totalCount) ||
      totalCount <= 0 ||
      !Number.isSafeInteger(pageSize) ||
      pageSize <= 0 ||
      currentPage !== page ||
      (expectedCardCount !== null && expectedCardCount !== totalCount)
    ) {
      throw new Error("Pokemon TCG API returned inconsistent pagination metadata.");
    }

    expectedCardCount ??= totalCount;

    if (cards.length === 0) {
      break;
    }

    recordUniqueCardIds(cards, seenCardIds);
    cardCount = seenCardIds.size;
    cards.forEach((card) => {
      const rows = buildRowsForCard(card, syncedAt);
      prepared += rows.length;
      pendingRows.push(...rows);
    });

    while (pendingRows.length >= UPSERT_BATCH_SIZE) {
      await upsertBatch(supabase, pendingRows.splice(0, UPSERT_BATCH_SIZE));
      logger.log(`Upserted ${prepared - pendingRows.length} card effect rows...`);
    }

    if (totalCount > 0 && currentPage * pageSize >= totalCount) {
      break;
    }

    page += 1;
  }

  assertUsableCardCatalog({ cardCount, expectedCardCount, prepared });
  await upsertBatch(supabase, pendingRows);

  let deleteQuery = supabase
    .from("card_effect_catalog")
    .delete()
    .neq("last_synced_at", syncedAt);

  if (normalizedSetId) {
    deleteQuery = deleteQuery.like("source_card_id", `${normalizedSetId}-%`);
  }

  const { error: deleteError } = await deleteQuery;

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  const summary = {
    cards: cardCount,
    prepared,
    setId: normalizedSetId,
    syncedAt
  };

  logger.log("Card effect catalog sync complete.");
  return summary;
}
