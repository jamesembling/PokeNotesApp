import { createClient } from "@/lib/supabase/server";
import { identifyLikelyArchetype } from "@/lib/log-import/identifier/archetypes";
import { loadIdentificationCatalog } from "@/lib/log-import/identifier/catalog";
import { selectDeckSprites } from "@/lib/log-import/identifier/sprites";
import { resolveLinkedDeck } from "@/lib/log-import/deck-linking";
import { normalizeText } from "@/lib/log-import/normalization";
import { measureServerCall } from "@/lib/server/perf";
import type { PlayerPokemonEvidence } from "@/lib/log-import/types";
import type { Deck, DeckCard, DeckList, DeckSummary, GoPreference } from "@/types/index";

type DeckSummaryRow = {
  id: string;
  user_id: string;
  deck_name: string;
  format: string;
  go_preference: GoPreference | null;
  deck_pokemon: unknown;
  deck_lists: unknown;
  created_at: string;
  updated_at: string;
};

type DeckRow = DeckSummaryRow & {
  core_strategy: string | null;
  general_notes: string | null;
  setup_goals: unknown;
  resource_plan: string | null;
  deck_lists: unknown;
};

type DeckLogStats = {
  total: number;
  wins: number;
  losses: number;
};

type UnlinkedLogStatsRow = {
  id: string;
  result: "Win" | "Loss";
  self_deck_name: string;
  self_deck_sprites: string;
};

type DeckListLookupRow = {
  id: string;
  user_id: string;
  deck_name: string;
  deck_lists: unknown;
};

function parsePokemonStage(value: unknown): DeckCard["stage"] {
  return value === "Basic" || value === "Stage 1" || value === "Stage 2"
    ? value
    : undefined;
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function parseDeckCard(value: unknown): DeckCard | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const count = typeof candidate.count === "number" ? candidate.count : 0;
  const name = typeof candidate.name === "string" ? candidate.name : "";
  const set = typeof candidate.set === "string" ? candidate.set : "";
  const number = typeof candidate.number === "string" ? candidate.number : "";

  if (!name || !set || !number) {
    return null;
  }

  return {
    count,
    name,
    set,
    number,
    category: typeof candidate.category === "string" ? candidate.category : undefined,
    trainerType:
      typeof candidate.trainerType === "string"
        ? candidate.trainerType
        : typeof candidate.type === "string"
          ? candidate.type
          : undefined,
    spriteUrl: typeof candidate.spriteUrl === "string" ? candidate.spriteUrl : undefined,
    stage: parsePokemonStage(candidate.stage)
  };
}

function parseDeckList(value: unknown): DeckList | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const parsedCardsSource = candidate.parsedCards ?? candidate.parsed_cards;
  const parsedCards = Array.isArray(parsedCardsSource)
    ? parsedCardsSource
        .map((card) => parseDeckCard(card))
        .filter((card): card is DeckCard => card !== null)
    : [];

  const id = typeof candidate.id === "string" ? candidate.id : "";
  const name = typeof candidate.name === "string" ? candidate.name : "";

  if (!id || !name) {
    return null;
  }

  return {
    id,
    name,
    format: typeof candidate.format === "string" ? candidate.format : "",
    date: typeof candidate.date === "string" ? candidate.date : "",
    createdBy:
      typeof candidate.createdBy === "string"
        ? candidate.createdBy
        : typeof candidate.created_by === "string"
          ? candidate.created_by
          : "",
    notes: typeof candidate.notes === "string" ? candidate.notes : "",
    rawList:
      typeof candidate.rawList === "string"
        ? candidate.rawList
        : typeof candidate.raw_list === "string"
          ? candidate.raw_list
          : "",
    parsedCards,
    createdAt:
      typeof candidate.createdAt === "string"
        ? candidate.createdAt
        : typeof candidate.created_at === "string"
          ? candidate.created_at
          : "",
    updatedAt:
      typeof candidate.updatedAt === "string"
        ? candidate.updatedAt
        : typeof candidate.updated_at === "string"
          ? candidate.updated_at
          : ""
  };
}

function parseDeckLists(value: unknown): DeckList[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => parseDeckList(entry))
    .filter((entry): entry is DeckList => entry !== null);
}

function buildPokemonLookupKeys(rawValue: string) {
  const trimmedValue = String(rawValue || "").trim();
  if (!trimmedValue) {
    return [];
  }

  const withoutExSuffix = trimmedValue.replace(/\s+ex$/i, "").trim();
  const keys = new Set<string>([
    trimmedValue,
    normalizeText(trimmedValue)
  ]);

  if (withoutExSuffix && withoutExSuffix !== trimmedValue) {
    keys.add(withoutExSuffix);
    keys.add(normalizeText(withoutExSuffix));
  }

  return Array.from(keys);
}

function resolvePokemonSlug(rawValue: string, slugIndex: Map<string, { slug: string }>) {
  for (const key of buildPokemonLookupKeys(rawValue)) {
    if (slugIndex.has(key)) {
      return slugIndex.get(key)?.slug ?? "";
    }
  }

  return "";
}

function buildDeckSpriteEvidence(
  deckName: string,
  deckLists: DeckList[],
  slugIndex: Map<string, { slug: string }>
): PlayerPokemonEvidence {
  const lines: string[] = [];
  const mentionCounts = new Map<string, number>();
  const normalizedNames: string[] = [deckName];

  deckLists.forEach((deckList) => {
    deckList.parsedCards.forEach((card) => {
      const slug = resolvePokemonSlug(card.name, slugIndex);
      if (!slug) {
        return;
      }

      lines.push(card.name);
      normalizedNames.push(card.name);
      mentionCounts.set(slug, (mentionCounts.get(slug) ?? 0) + Math.max(card.count, 1));
    });
  });

  return {
    lines,
    normalizedText: normalizeText(normalizedNames.join(" ")),
    mentionCounts
  };
}

async function normalizeDeckPokemon(deckPokemon: string[]): Promise<string[]> {
  if (deckPokemon.length === 0) {
    return [];
  }

  const catalog = await loadIdentificationCatalog();
  const slugIndex = new Map<string, { slug: string }>();
  catalog.pokemon.bySlug.forEach((row, slug) => {
    slugIndex.set(slug, { slug });
  });
  catalog.pokemon.normalizedNameToSlug.forEach((slug, normalizedName) => {
    slugIndex.set(normalizedName, { slug });
  });

  return Array.from(
    new Set(deckPokemon.map((entry) => resolvePokemonSlug(entry, slugIndex)).filter(Boolean))
  );
}

async function deriveDeckPokemon(deckName: string, deckLists: DeckList[]): Promise<string[]> {
  if (deckLists.length === 0) {
    return [];
  }

  const catalog = await loadIdentificationCatalog();
  const slugIndex = new Map<string, { slug: string }>();
  catalog.pokemon.bySlug.forEach((row, slug) => {
    slugIndex.set(slug, { slug });
  });
  catalog.pokemon.normalizedNameToSlug.forEach((slug, normalizedName) => {
    slugIndex.set(normalizedName, { slug });
  });
  const evidence = buildDeckSpriteEvidence(deckName, deckLists, slugIndex);

  if (evidence.mentionCounts.size === 0) {
    return [];
  }

  const archetype = identifyLikelyArchetype({
    evidence,
    catalog
  });

  return selectDeckSprites({
    archetype,
    evidence,
    catalog
  }).slugs;
}

async function mapDeckSummary(row: DeckSummaryRow): Promise<DeckSummary> {
  const deckLists = parseDeckLists(row.deck_lists);
  const storedDeckPokemon = parseStringArray(row.deck_pokemon);
  const normalizedStoredDeckPokemon = await normalizeDeckPokemon(storedDeckPokemon);
  const deckPokemon =
    normalizedStoredDeckPokemon.length > 0
      ? normalizedStoredDeckPokemon
      : await deriveDeckPokemon(row.deck_name, deckLists);

  return {
    id: row.id,
    userId: row.user_id,
    deckName: row.deck_name,
    format: row.format,
    goPreference: row.go_preference ?? "",
    deckPokemon,
    deckLists,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function mapDeck(row: DeckRow): Promise<Deck> {
  return {
    ...(await mapDeckSummary(row)),
    coreStrategy: row.core_strategy ?? "",
    generalNotes: row.general_notes ?? "",
    setupGoals: parseStringArray(row.setup_goals),
    resourcePlan: row.resource_plan ?? "",
    deckLists: parseDeckLists(row.deck_lists)
  };
}

export async function getDecks(userId: string): Promise<DeckSummary[]> {
  const supabase = createClient();

  const { data, error } = await measureServerCall("db.decks.list", async () =>
    await supabase
      .from("decks")
      .select(
        [
          "id",
          "user_id",
          "deck_name",
          "format",
          "go_preference",
          "deck_pokemon",
          "deck_lists",
          "created_at",
          "updated_at"
        ].join(",")
      )
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
  );

  if (error) {
    throw error;
  }

  const rows = ((data ?? []) as unknown) as DeckSummaryRow[];
  return await Promise.all(rows.map((row) => mapDeckSummary(row)));
}

export async function getDeckById(userId: string, deckId: string): Promise<Deck | null> {
  const supabase = createClient();

  const { data, error } = await measureServerCall("db.decks.byId", async () =>
    await supabase
      .from("decks")
      .select(
        [
          "id",
          "user_id",
          "deck_name",
          "format",
          "go_preference",
          "deck_pokemon",
          "created_at",
          "updated_at",
          "core_strategy",
          "general_notes",
          "setup_goals",
          "resource_plan",
          "deck_lists"
        ].join(",")
      )
      .eq("user_id", userId)
      .eq("id", deckId)
      .maybeSingle()
  );

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return await mapDeck((data as unknown) as DeckRow);
}

export async function getDeckWithList(
  userId: string,
  deckId: string,
  listId: string
): Promise<{ deckName: string; deckList: DeckList } | null> {
  const supabase = createClient();
  const { data, error } = await measureServerCall("db.decks.listById", async () =>
    await supabase
      .from("decks")
      .select(["id", "user_id", "deck_name", "deck_lists"].join(","))
      .eq("user_id", userId)
      .eq("id", deckId)
      .maybeSingle()
  );

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  const row = (data as unknown) as DeckListLookupRow;
  const deckLists = parseDeckLists(row.deck_lists);
  const deckList = deckLists.find((entry) => entry.id === listId);

  if (!deckList) {
    return null;
  }

  return {
    deckName: row.deck_name,
    deckList
  };
}

export async function getDeckLogStats(
  userId: string,
  deckId: string
): Promise<DeckLogStats> {
  const supabase = createClient();
  const [total, wins, losses] = await measureServerCall("db.decks.logStats.explicit", async () => {
    const baseQuery = supabase.from("logs").select("id", { count: "exact", head: true });
    const [{ count: totalCount, error: totalError }, { count: winsCount, error: winsError }, { count: lossesCount, error: lossesError }] =
      await Promise.all([
        baseQuery.eq("user_id", userId).eq("linked_deck_id", deckId),
        supabase
          .from("logs")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("linked_deck_id", deckId)
          .eq("result", "Win"),
        supabase
          .from("logs")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("linked_deck_id", deckId)
          .eq("result", "Loss")
      ]);

    if (totalError) {
      throw totalError;
    }

    if (winsError) {
      throw winsError;
    }

    if (lossesError) {
      throw lossesError;
    }

    return [totalCount ?? 0, winsCount ?? 0, lossesCount ?? 0] as const;
  });

  const [decks, unlinkedLogsData] = await Promise.all([
    getDecks(userId),
    measureServerCall("db.decks.logStats.unlinked", async () =>
      await supabase
        .from("logs")
        .select("id,result,self_deck_name,self_deck_sprites")
        .eq("user_id", userId)
        .is("linked_deck_id", null)
    )
  ]);

  const { data: unlinkedRows, error: unlinkedError } = unlinkedLogsData;
  if (unlinkedError) {
    throw unlinkedError;
  }

  const inferredStats = (((unlinkedRows ?? []) as unknown) as UnlinkedLogStatsRow[]).reduce(
    (stats, row) => {
      const resolvedDeckId = resolveLinkedDeck(decks, {
        selfDeckName: row.self_deck_name,
        selfDeckSprites: parseStringArray(row.self_deck_sprites),
        linkedDeckId: undefined
      });

      if (resolvedDeckId !== deckId) {
        return stats;
      }

      stats.total += 1;
      if (row.result === "Win") {
        stats.wins += 1;
      } else if (row.result === "Loss") {
        stats.losses += 1;
      }

      return stats;
    },
    { total: 0, wins: 0, losses: 0 }
  );

  return {
    total: total + inferredStats.total,
    wins: wins + inferredStats.wins,
    losses: losses + inferredStats.losses
  };
}
