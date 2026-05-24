import { createClient } from "@supabase/supabase-js";

const POKEMON_TCG_API_URL = "https://api.pokemontcg.io/v2/cards";
const PAGE_SIZE = 250;
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

async function fetchCardPage(page) {
  const searchParams = new URLSearchParams({
    page: String(page),
    pageSize: String(PAGE_SIZE),
    select: SELECT_FIELDS
  });
  const headers = {};

  if (process.env.POKEMON_TCG_API_KEY) {
    headers["X-Api-Key"] = process.env.POKEMON_TCG_API_KEY;
  }

  const response = await fetch(`${POKEMON_TCG_API_URL}?${searchParams.toString()}`, {
    headers
  });

  if (!response.ok) {
    throw new Error(`Pokemon TCG API request failed with ${response.status} ${response.statusText}.`);
  }

  return response.json();
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

export async function syncCardEffectCatalog({ logger = console } = {}) {
  const supabase = createAdminSupabaseClient();
  const syncedAt = new Date().toISOString();
  let page = 1;
  let prepared = 0;
  let cardCount = 0;
  let pendingRows = [];

  logger.log("Fetching Pokemon TCG card effect catalog...");

  while (true) {
    const payload = await fetchCardPage(page);
    const cards = Array.isArray(payload?.data) ? payload.data : [];

    if (cards.length === 0) {
      break;
    }

    cardCount += cards.length;
    cards.forEach((card) => {
      const rows = buildRowsForCard(card, syncedAt);
      prepared += rows.length;
      pendingRows.push(...rows);
    });

    while (pendingRows.length >= UPSERT_BATCH_SIZE) {
      await upsertBatch(supabase, pendingRows.splice(0, UPSERT_BATCH_SIZE));
      logger.log(`Upserted ${prepared - pendingRows.length} card effect rows...`);
    }

    const totalCount = Number(payload?.totalCount ?? 0);
    const pageSize = Number(payload?.pageSize ?? PAGE_SIZE);
    const currentPage = Number(payload?.page ?? page);
    if (totalCount > 0 && currentPage * pageSize >= totalCount) {
      break;
    }

    page += 1;
  }

  await upsertBatch(supabase, pendingRows);

  const { error: deleteError } = await supabase
    .from("card_effect_catalog")
    .delete()
    .neq("last_synced_at", syncedAt);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  const summary = {
    cards: cardCount,
    prepared,
    syncedAt
  };

  logger.log("Card effect catalog sync complete.");
  return summary;
}
