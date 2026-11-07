import { cache } from "react";
import { getReadSortedDeckCards } from "@/lib/deck-lists/read-sort";
import { createClient } from "@/lib/supabase/server";
import { buildDeckArchetypeId } from "@/lib/decks/archetype";
import {
  resolveDeckAggregateCompatibilityRead,
  resolveDeckListsDuringCompatibility
} from "@/lib/decks/aggregate-compatibility";
import { identifyLikelyArchetype } from "@/lib/log-import/identifier/archetypes";
import { loadIdentificationCatalog } from "@/lib/log-import/identifier/catalog";
import { selectDeckSprites } from "@/lib/log-import/identifier/sprites";
import { normalizeText } from "@/lib/log-import/normalization";
import { resolvePokemonSpriteSlug } from "@/lib/pokemon/sprites";
import { measureServerCall } from "@/lib/server/perf";
import type { PlayerPokemonEvidence } from "@/lib/log-import/types";
import type { IdentificationCatalog } from "@/lib/log-import/types";
import type {
  Deck,
  DeckCard,
  DeckList,
  DeckListOption,
  DeckMatchup,
  DeckSelectionOption,
  DeckSummary,
  GoPreference
} from "@/types/index";
import { compactMap } from "@/lib/array";

const DECK_SUMMARY_SELECT = [
  "id",
  "user_id",
  "deck_name",
  "archetype_id",
  "format",
  "go_preference",
  "deck_pokemon",
  "deck_lists",
  "created_at",
  "updated_at"
].join(",");

const DECK_DETAIL_SELECT = [
  "id",
  "user_id",
  "deck_name",
  "archetype_id",
  "format",
  "go_preference",
  "deck_pokemon",
  "created_at",
  "updated_at",
  "core_strategy",
  "general_notes",
  "setup_goals",
  "resource_plan",
  "matchups",
  "deck_lists"
].join(",");

type DeckSummaryRow = {
  id: string;
  user_id: string;
  deck_name: string;
  archetype_id?: string | null;
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
  matchups?: unknown;
  deck_lists: unknown;
};

type DeckLogStats = {
  total: number;
  wins: number;
  losses: number;
};

export type DeckIndexSummary = Omit<DeckSummary, "deckLists"> & {
  deckListCount: number;
  gamesPlayed: number;
  losses: number;
  winRate: number | null;
  wins: number;
};

type DeckIndexRow = Omit<DeckSummaryRow, "deck_lists"> & {
  deck_list_count: number | null;
};

type DeckIndexPageRow = DeckIndexRow & {
  games_played: number | null;
  games_won: number | null;
  games_lost: number | null;
};

type DeckLogStatsRow = {
  deck_id: string | null;
  games_played: number | null;
  games_won: number | null;
  games_lost: number | null;
};

type DeckListLookupRow = {
  id: string;
  user_id: string;
  deck_name: string;
  archetype_id?: string | null;
  deck_lists: unknown;
};

type DeckSelectionRow = Pick<DeckSummaryRow, "id" | "deck_name" | "deck_lists">;

type DeckListRelationalRow = {
  id: string;
  deck_id: string | null;
  name: string;
  format: string | null;
  date: string | null;
  created_by: string | null;
  notes: string | null;
  raw_list: string | null;
  parsed_cards: unknown;
  sorted_cards: unknown;
  sorted_cards_version: number | null;
  created_at: string;
  updated_at: string;
};

type DeckMatchupRelationalRow = {
  id: string;
  deck_id: string;
  deck_name: string;
  deck_pokemon: unknown;
  format: string | null;
  go_preference: GoPreference | null;
  matchup_favor: DeckMatchup["matchupFavor"] | null;
  ideal_bench: string | null;
  techs_needed: string | null;
  matchup_plan: string | null;
  created_at: string;
  updated_at: string;
};

type DeckMappingContext = {
  catalog: IdentificationCatalog;
  slugIndex: Map<string, { slug: string }>;
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
  const sortedCardsSource = candidate.sortedCards ?? candidate.sorted_cards;
  const storedSortedCards = Array.isArray(sortedCardsSource)
    ? sortedCardsSource
        .map((card) => parseDeckCard(card))
        .filter((card): card is DeckCard => card !== null)
    : [];

  const id = typeof candidate.id === "string" ? candidate.id : "";
  const name = typeof candidate.name === "string" ? candidate.name : "";

  if (!id || !name) {
    return null;
  }

  const sortedCardsVersion =
    typeof candidate.sortedCardsVersion === "number"
      ? candidate.sortedCardsVersion
      : typeof candidate.sorted_cards_version === "number"
        ? candidate.sorted_cards_version
        : undefined;

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
    sortedCards: getReadSortedDeckCards({
      parsedCards,
      sortedCards: storedSortedCards,
      sortedCardsVersion
    }),
    sortedCardsVersion,
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

function mapRelationalDeckList(row: DeckListRelationalRow): DeckList {
  const parsedCards = Array.isArray(row.parsed_cards)
    ? row.parsed_cards
        .map((card) => parseDeckCard(card))
        .filter((card): card is DeckCard => card !== null)
    : [];
  const sortedCards = getReadSortedDeckCards({
    parsedCards,
    sortedCards: Array.isArray(row.sorted_cards)
      ? row.sorted_cards
          .map((card) => parseDeckCard(card))
          .filter((card): card is DeckCard => card !== null)
      : [],
    sortedCardsVersion: row.sorted_cards_version ?? undefined
  });

  return {
    deckId: row.deck_id,
    id: row.id,
    name: row.name,
    format: row.format ?? "",
    date: row.date ?? "",
    createdBy: row.created_by ?? "",
    notes: row.notes ?? "",
    rawList: row.raw_list ?? "",
    parsedCards,
    sortedCards,
    sortedCardsVersion: row.sorted_cards_version ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapDeckListOptions(deckLists: readonly DeckListOption[]): DeckListOption[] {
  return deckLists.map((deckList) => ({
    id: deckList.id,
    name: deckList.name
  }));
}

function parseDeckMatchup(value: unknown): DeckMatchup | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const id = typeof candidate.id === "string" ? candidate.id : "";
  const deckName = typeof candidate.deckName === "string"
    ? candidate.deckName
    : typeof candidate.deck_name === "string"
      ? candidate.deck_name
      : "";
  const createdAt = typeof candidate.createdAt === "string"
    ? candidate.createdAt
    : typeof candidate.created_at === "string"
      ? candidate.created_at
      : "";
  const updatedAt = typeof candidate.updatedAt === "string"
    ? candidate.updatedAt
    : typeof candidate.updated_at === "string"
      ? candidate.updated_at
      : createdAt;

  if (!id || !deckName) {
    return null;
  }

  return {
    id,
    deckName,
    deckPokemon: parseStringArray(candidate.deckPokemon ?? candidate.deck_pokemon),
    format:
      typeof candidate.format === "string"
        ? candidate.format
        : "",
    goPreference:
      candidate.goPreference === "First" || candidate.goPreference === "Second"
        ? candidate.goPreference
        : candidate.go_preference === "First" || candidate.go_preference === "Second"
          ? candidate.go_preference
          : "",
    matchupFavor:
      candidate.matchupFavor === "Heavily Favoured" ||
      candidate.matchupFavor === "Slightly Favoured" ||
      candidate.matchupFavor === "Even" ||
      candidate.matchupFavor === "Slightly Unfavoured" ||
      candidate.matchupFavor === "Heavily Unfavoured"
        ? candidate.matchupFavor
        : candidate.matchup_favor === "Heavily Favoured" ||
            candidate.matchup_favor === "Slightly Favoured" ||
            candidate.matchup_favor === "Even" ||
            candidate.matchup_favor === "Slightly Unfavoured" ||
            candidate.matchup_favor === "Heavily Unfavoured"
          ? candidate.matchup_favor
          : "",
    idealBench:
      typeof candidate.idealBench === "string"
        ? candidate.idealBench
        : typeof candidate.ideal_bench === "string"
          ? candidate.ideal_bench
          : "",
    techsNeeded:
      typeof candidate.techsNeeded === "string"
        ? candidate.techsNeeded
        : typeof candidate.techs_needed === "string"
          ? candidate.techs_needed
          : "",
    matchupPlan:
      typeof candidate.matchupPlan === "string"
        ? candidate.matchupPlan
        : typeof candidate.matchup_plan === "string"
          ? candidate.matchup_plan
          : "",
    createdAt,
    updatedAt
  };
}

function parseDeckMatchups(value: unknown): DeckMatchup[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => parseDeckMatchup(entry))
    .filter((entry): entry is DeckMatchup => entry !== null);
}

function mapRelationalDeckMatchup(row: DeckMatchupRelationalRow): DeckMatchup {
  return {
    id: row.id,
    deckName: row.deck_name,
    deckPokemon: parseStringArray(row.deck_pokemon),
    format: row.format ?? "",
    goPreference:
      row.go_preference === "First" || row.go_preference === "Second"
        ? row.go_preference
        : "",
    matchupFavor:
      row.matchup_favor === "Heavily Favoured" ||
      row.matchup_favor === "Slightly Favoured" ||
      row.matchup_favor === "Even" ||
      row.matchup_favor === "Slightly Unfavoured" ||
      row.matchup_favor === "Heavily Unfavoured"
        ? row.matchup_favor
        : "",
    idealBench: row.ideal_bench ?? "",
    techsNeeded: row.techs_needed ?? "",
    matchupPlan: row.matchup_plan ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function stripDeckListCards(deckList: DeckList): DeckList {
  return {
    ...deckList,
    parsedCards: [],
    sortedCards: []
  };
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

async function loadDeckMappingContext(): Promise<DeckMappingContext> {
  const catalog = await loadIdentificationCatalog();
  const slugIndex = new Map<string, { slug: string }>();

  catalog.pokemon.bySlug.forEach((_row, slug) => {
    slugIndex.set(slug, { slug });
  });
  catalog.pokemon.normalizedNameToSlug.forEach((slug, normalizedName) => {
    slugIndex.set(normalizedName, { slug });
  });

  return {
    catalog,
    slugIndex
  };
}

async function normalizeDeckPokemon(
  deckPokemon: string[],
  slugIndex: DeckMappingContext["slugIndex"]
): Promise<string[]> {
  if (deckPokemon.length === 0) {
    return [];
  }

  return Array.from(
    new Set(
      compactMap(deckPokemon, (entry) => {
          const trimmedEntry = String(entry || "").trim();
          if (!trimmedEntry) {
            return "";
          }

          return resolvePokemonSlug(trimmedEntry, slugIndex) || trimmedEntry;
        })
    )
  );
}

async function deriveDeckPokemon(
  deckName: string,
  deckLists: DeckList[],
  context: DeckMappingContext
): Promise<string[]> {
  if (deckLists.length === 0) {
    return [];
  }
  const { catalog, slugIndex } = context;
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

async function mapDeckSummary(
  row: DeckSummaryRow,
  context: DeckMappingContext,
  deckListsOverride?: DeckList[]
): Promise<DeckSummary> {
  const parsedDeckLists = resolveDeckAggregateCompatibilityRead({
    legacyDeckLists: parseDeckLists(row.deck_lists),
    relationalDeckLists: deckListsOverride
  }).deckLists;
  const storedDeckPokemon = parseStringArray(row.deck_pokemon);
  const normalizedStoredDeckPokemon = await normalizeDeckPokemon(storedDeckPokemon, context.slugIndex);
  const deckPokemon =
    normalizedStoredDeckPokemon.length > 0
      ? normalizedStoredDeckPokemon
      : await deriveDeckPokemon(row.deck_name, parsedDeckLists, context);
  const archetypeId = String(row.archetype_id || "").trim() || buildDeckArchetypeId(deckPokemon);

  return {
    id: row.id,
    userId: row.user_id,
    deckName: row.deck_name,
    archetypeId,
    format: row.format,
    goPreference: row.go_preference ?? "",
    deckPokemon,
    deckLists: parsedDeckLists.map(stripDeckListCards),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapDeckSelectionWithLists(
  row: DeckSelectionRow,
  relationalDeckListOptions: Map<string, DeckListOption[]>
): DeckSelectionOption {
  // Same precedence and ordering as the aggregate read, applied to the
  // `{ id, name }` projection so option reads skip card payloads and sorting.
  const deckLists = resolveDeckListsDuringCompatibility(
    mapDeckListOptions(parseDeckLists(row.deck_lists)),
    relationalDeckListOptions.get(row.id)
  );

  return {
    id: row.id,
    deckName: row.deck_name,
    deckLists: mapDeckListOptions(deckLists)
  };
}

function mapDeckIndexRow(row: DeckIndexRow): DeckIndexSummary {
  const storedDeckPokemon = parseStringArray(row.deck_pokemon);
  const deckPokemon = Array.from(
    new Set(compactMap(storedDeckPokemon, (entry) => resolvePokemonSpriteSlug(entry)))
  );
  const archetypeId = String(row.archetype_id || "").trim() || buildDeckArchetypeId(deckPokemon);

  return {
    id: row.id,
    userId: row.user_id,
    deckName: row.deck_name,
    archetypeId,
    format: row.format,
    goPreference: row.go_preference ?? "",
    deckPokemon,
    deckListCount: Math.max(0, Number(row.deck_list_count ?? 0)),
    gamesPlayed: 0,
    losses: 0,
    winRate: null,
    wins: 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function applyDeckLogStats(
  decks: DeckIndexSummary[],
  statsRows: DeckLogStatsRow[]
): DeckIndexSummary[] {
  const statsByDeckId = new Map(
    statsRows
      .filter((row): row is DeckLogStatsRow & { deck_id: string } => Boolean(row.deck_id))
      .map((row) => [
        row.deck_id,
        {
          gamesPlayed: Number(row.games_played ?? 0),
          losses: Number(row.games_lost ?? 0),
          wins: Number(row.games_won ?? 0)
        }
      ])
  );

  return decks.map((deck) => {
    const stats = statsByDeckId.get(deck.id);

    if (!stats) {
      return deck;
    }

    return {
      ...deck,
      gamesPlayed: stats.gamesPlayed,
      losses: stats.losses,
      winRate: stats.gamesPlayed > 0 ? Math.round((stats.wins / stats.gamesPlayed) * 100) : null,
      wins: stats.wins
    };
  });
}

async function getDeckLogStatsForIndex(
  userId: string,
  deckIds: string[]
): Promise<DeckLogStatsRow[]> {
  if (deckIds.length === 0) {
    return [];
  }

  const supabase = await createClient();
  const { data, error } = await measureServerCall("db.decks.indexStatsReadModel", async () =>
    await supabase
      .from("deck_log_stats")
      .select("deck_id,games_played,games_won,games_lost")
      .eq("user_id", userId)
      .in("deck_id", deckIds)
  );

  if (error) {
    throw error;
  }

  return (((data ?? []) as unknown) as DeckLogStatsRow[]);
}

async function getRelationalDeckListsByDeckId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  deckIds: string[]
): Promise<Map<string, DeckList[]>> {
  const resolvedDeckIds = Array.from(new Set(deckIds.filter(Boolean)));
  if (resolvedDeckIds.length === 0) {
    return new Map();
  }

  const { data, error } = await measureServerCall("db.decks.relationalDeckLists", async () =>
    await supabase
      .from("deck_lists")
      .select([
        "id",
        "deck_id",
        "name",
        "format",
        "date",
        "created_by",
        "notes",
        "raw_list",
        "parsed_cards",
        "sorted_cards",
        "sorted_cards_version",
        "created_at",
        "updated_at"
      ].join(","))
      .eq("user_id", userId)
      .in("deck_id", resolvedDeckIds)
      .order("position", { ascending: true })
      .order("created_at", { ascending: false })
  );

  if (error) {
    throw error;
  }

  const byDeckId = new Map<string, DeckList[]>();
  (((data ?? []) as unknown) as DeckListRelationalRow[]).forEach((row) => {
    if (!row.deck_id) {
      return;
    }
    const deckLists = byDeckId.get(row.deck_id) ?? [];
    deckLists.push(mapRelationalDeckList(row));
    byDeckId.set(row.deck_id, deckLists);
  });

  return byDeckId;
}

type DeckListOptionRow = {
  id: string;
  deck_id: string | null;
  name: string;
};

/**
 * Reads only the `{ id, name }` projection of relational Deck Lists, grouped
 * by Deck Strategy, in the same order as `getRelationalDeckListsByDeckId`.
 * `"all"` reads every strategy-linked list for the account, which lets callers
 * that select all of the account's decks issue this query in parallel.
 */
async function getRelationalDeckListOptionsByDeckId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  deckIds: string[] | "all"
): Promise<Map<string, DeckListOption[]>> {
  const resolvedDeckIds = deckIds === "all" ? null : Array.from(new Set(deckIds.filter(Boolean)));
  if (resolvedDeckIds?.length === 0) {
    return new Map();
  }

  const { data, error } = await measureServerCall(
    "db.decks.relationalDeckListOptions",
    async () => {
      const query = supabase.from("deck_lists").select("id,deck_id,name").eq("user_id", userId);
      const scopedQuery = resolvedDeckIds
        ? query.in("deck_id", resolvedDeckIds)
        : query.not("deck_id", "is", null);

      return await scopedQuery
        .order("position", { ascending: true })
        .order("created_at", { ascending: false });
    }
  );

  if (error) {
    throw error;
  }

  const byDeckId = new Map<string, DeckListOption[]>();
  ((data ?? []) as unknown as DeckListOptionRow[]).forEach((row) => {
    if (!row.deck_id) {
      return;
    }
    const options = byDeckId.get(row.deck_id) ?? [];
    options.push({ id: row.id, name: row.name });
    byDeckId.set(row.deck_id, options);
  });

  return byDeckId;
}

async function getRelationalDeckMatchupsByDeckId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  deckIds: string[]
): Promise<Map<string, DeckMatchup[]>> {
  const resolvedDeckIds = Array.from(new Set(deckIds.filter(Boolean)));
  if (resolvedDeckIds.length === 0) {
    return new Map();
  }

  const { data, error } = await measureServerCall("db.decks.relationalDeckMatchups", async () =>
    await supabase
      .from("deck_matchups")
      .select([
        "id",
        "deck_id",
        "deck_name",
        "deck_pokemon",
        "format",
        "go_preference",
        "matchup_favor",
        "ideal_bench",
        "techs_needed",
        "matchup_plan",
        "created_at",
        "updated_at"
      ].join(","))
      .eq("user_id", userId)
      .in("deck_id", resolvedDeckIds)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true })
  );

  if (error) {
    throw error;
  }

  const byDeckId = new Map<string, DeckMatchup[]>();
  (((data ?? []) as unknown) as DeckMatchupRelationalRow[]).forEach((row) => {
    const matchups = byDeckId.get(row.deck_id) ?? [];
    matchups.push(mapRelationalDeckMatchup(row));
    byDeckId.set(row.deck_id, matchups);
  });

  return byDeckId;
}

async function mapDeckWithRelations(
  row: DeckRow,
  context: DeckMappingContext,
  deckListsOverride?: DeckList[],
  matchupsOverride?: DeckMatchup[]
): Promise<Deck> {
  const aggregate = resolveDeckAggregateCompatibilityRead({
    legacyDeckLists: parseDeckLists(row.deck_lists),
    legacyMatchups: parseDeckMatchups(row.matchups),
    relationalDeckLists: deckListsOverride,
    relationalMatchups: matchupsOverride
  });
  const sourceDeckLists = aggregate.deckLists;
  const deckSummary = await mapDeckSummary(row, context, sourceDeckLists);

  return {
    ...deckSummary,
    coreStrategy: row.core_strategy ?? "",
    generalNotes: row.general_notes ?? "",
    setupGoals: parseStringArray(row.setup_goals),
    resourcePlan: row.resource_plan ?? "",
    matchups: aggregate.matchups,
    deckLists: aggregate.deckLists
  };
}

export const getDecks = cache(async function getDecks(userId: string): Promise<DeckSummary[]> {
  const supabase = await createClient();

  const { data, error } = await measureServerCall("db.decks.list", async () =>
    await supabase
      .from("decks")
      .select(DECK_SUMMARY_SELECT)
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
  );

  if (error) {
    throw error;
  }

  const rows = ((data ?? []) as unknown) as DeckSummaryRow[];
  if (rows.length === 0) {
    return [];
  }

  const [relationalDeckLists, mappingContext] = await Promise.all([
    getRelationalDeckListsByDeckId(
      supabase,
      userId,
      rows.map((row) => row.id)
    ),
    loadDeckMappingContext()
  ]);
  return await Promise.all(
    rows.map((row) => mapDeckSummary(row, mappingContext, relationalDeckLists.get(row.id)))
  );
});

export const decksDbTestHooks = {
  createClient,
  getDecks: async (userId: string) => await getDecks(userId),
  getDeckLogStatsForIndex: async (userId: string, deckIds: string[]) =>
    await getDeckLogStatsForIndex(userId, deckIds)
};

function needsDeckIndexCompatibilityFallback(rows: DeckIndexRow[]) {
  return rows.some(
    (row) =>
      parseStringArray(row.deck_pokemon).length === 0 &&
      Number(row.deck_list_count ?? 0) > 0
  );
}

async function loadDeckIndexCompatibilityFallback(userId: string) {
  const decks = await decksDbTestHooks.getDecks(userId);
  const deckIndexSummaries = decks.map(({ deckLists, ...deck }) => ({
    ...deck,
    deckListCount: deckLists.length,
    gamesPlayed: 0,
    losses: 0,
    winRate: null,
    wins: 0
  }));

  return applyDeckLogStats(
    deckIndexSummaries,
    await decksDbTestHooks.getDeckLogStatsForIndex(
      userId,
      deckIndexSummaries.map((deck) => deck.id)
    )
  );
}

export const getDeckIndexSummaries = cache(async function getDeckIndexSummaries(
  userId: string
): Promise<DeckIndexSummary[]> {
  const supabase = await decksDbTestHooks.createClient();
  const pageResult = await measureServerCall("db.decks.indexPageRpc", async () =>
    await supabase.rpc("get_deck_index_page_data")
  );

  if (!pageResult.error && Array.isArray(pageResult.data)) {
    const rows = ((pageResult.data ?? []) as unknown) as DeckIndexPageRow[];
    if (needsDeckIndexCompatibilityFallback(rows)) {
      return await loadDeckIndexCompatibilityFallback(userId);
    }

    return rows.map((row) => {
      const deck = mapDeckIndexRow(row);
      const gamesPlayed = Number(row.games_played ?? 0);
      const wins = Number(row.games_won ?? 0);

      return {
        ...deck,
        gamesPlayed,
        losses: Number(row.games_lost ?? 0),
        winRate: gamesPlayed > 0 ? Math.round((wins / gamesPlayed) * 100) : null,
        wins
      };
    });
  }

  const { data, error } = await measureServerCall("db.decks.indexRpc", async () =>
    await supabase.rpc("get_deck_index")
  );

  if (error) {
    return await loadDeckIndexCompatibilityFallback(userId);
  }

  const rows = (((data ?? []) as unknown) as DeckIndexRow[]);
  if (rows.length === 0) {
    return [];
  }

  if (needsDeckIndexCompatibilityFallback(rows)) {
    return await loadDeckIndexCompatibilityFallback(userId);
  }

  const decks = rows.map(mapDeckIndexRow);
  return applyDeckLogStats(
    decks,
    await getDeckLogStatsForIndex(userId, decks.map((deck) => deck.id))
  );
});

export const getDeckSelectionOptions = cache(async function getDeckSelectionOptions(
  userId: string
): Promise<DeckSelectionOption[]> {
  const supabase = await createClient();
  const [{ data, error }, relationalDeckListOptions] = await Promise.all([
    measureServerCall("db.decks.selectionOptions", async () =>
      await supabase
        .from("decks")
        .select(["id", "deck_name", "deck_lists"].join(","))
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
    ),
    getRelationalDeckListOptionsByDeckId(supabase, userId, "all")
  ]);

  if (error) {
    throw error;
  }

  const rows = ((data ?? []) as unknown) as DeckSelectionRow[];
  return rows.map((row) => mapDeckSelectionWithLists(row, relationalDeckListOptions));
});

export const getDeckSelectionOptionsByIds = cache(async function getDeckSelectionOptionsByIds(
  userId: string,
  deckIds: string[]
): Promise<DeckSelectionOption[]> {
  const resolvedDeckIds = Array.from(
    new Set(
      compactMap(deckIds, (deckId) => String(deckId || "").trim())
    )
  );

  if (resolvedDeckIds.length === 0) {
    return [];
  }

  const supabase = await createClient();
  const [{ data, error }, relationalDeckListOptions] = await Promise.all([
    measureServerCall("db.decks.selectionOptionsByIds", async () =>
      await supabase
        .from("decks")
        .select(["id", "deck_name", "deck_lists"].join(","))
        .eq("user_id", userId)
        .in("id", resolvedDeckIds)
    ),
    getRelationalDeckListOptionsByDeckId(supabase, userId, resolvedDeckIds)
  ]);

  if (error) {
    throw error;
  }

  const rows = ((data ?? []) as unknown) as DeckSelectionRow[];
  return rows.map((row) => mapDeckSelectionWithLists(row, relationalDeckListOptions));
});

export const getDeckById = cache(async function getDeckById(
  userId: string,
  deckId: string
): Promise<Deck | null> {
  const supabase = await createClient();

  // The child reads are keyed by the requested id and owner, so they run
  // alongside the parent read instead of after it.
  const [{ data, error }, mappingContext, relationalDeckLists, relationalDeckMatchups] =
    await Promise.all([
      measureServerCall("db.decks.byId", async () =>
        await supabase
          .from("decks")
          .select(DECK_DETAIL_SELECT)
          .eq("user_id", userId)
          .eq("id", deckId)
          .maybeSingle()
      ),
      loadDeckMappingContext(),
      getRelationalDeckListsByDeckId(supabase, userId, [deckId]),
      getRelationalDeckMatchupsByDeckId(supabase, userId, [deckId])
    ]);

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  const row = (data as unknown) as DeckRow;

  return await mapDeckWithRelations(
    row,
    mappingContext,
    relationalDeckLists.get(row.id),
    relationalDeckMatchups.get(row.id)
  );
});

export async function getDeckWithList(
  userId: string,
  deckId: string,
  listId: string
): Promise<{ deckName: string; deckList: DeckList } | null> {
  const supabase = await createClient();
  const [deckResult, listResult] = await Promise.all([
    measureServerCall("db.decks.listDeckById", async () =>
      await supabase
        .from("decks")
        .select(["id", "user_id", "deck_name", "deck_lists"].join(","))
        .eq("user_id", userId)
        .eq("id", deckId)
        .maybeSingle()
    ),
    measureServerCall("db.decks.relationalListById", async () =>
      await supabase
        .from("deck_lists")
        .select([
          "id",
          "deck_id",
          "name",
          "format",
          "date",
          "created_by",
          "notes",
          "raw_list",
          "parsed_cards",
          "sorted_cards",
          "sorted_cards_version",
          "created_at",
          "updated_at"
        ].join(","))
        .eq("user_id", userId)
        .eq("id", listId)
        .maybeSingle()
    )
  ]);

  if (deckResult.error) {
    throw deckResult.error;
  }

  if (listResult.error) {
    throw listResult.error;
  }

  if (!deckResult.data) {
    return null;
  }

  const row = (deckResult.data as unknown) as DeckListLookupRow;
  const relationalDeckList = listResult.data
    ? mapRelationalDeckList((listResult.data as unknown) as DeckListRelationalRow)
    : null;
  const legacyDeckList = parseDeckLists(row.deck_lists).find((entry) => entry.id === listId);
  const deckList =
    relationalDeckList && (relationalDeckList.deckId === deckId || !legacyDeckList)
      ? relationalDeckList
      : legacyDeckList ?? relationalDeckList;

  if (!deckList) {
    return null;
  }
  return {
    deckName: row.deck_name,
    deckList: {
      ...deckList,
      sortedCards: getReadSortedDeckCards(deckList)
    }
  };
}

export async function getDeckWithMatchup(
  userId: string,
  deckId: string,
  matchupId: string
): Promise<{ deckName: string; deckPokemon: string[]; matchup: DeckMatchup } | null> {
  const supabase = await createClient();
  const [{ data, error }, deck] = await Promise.all([
    measureServerCall("db.decks.relationalMatchupById", async () =>
      await supabase
        .from("deck_matchups")
        .select([
          "id",
          "deck_id",
          "deck_name",
          "deck_pokemon",
          "format",
          "go_preference",
          "matchup_favor",
          "ideal_bench",
          "techs_needed",
          "matchup_plan",
          "created_at",
          "updated_at"
        ].join(","))
        .eq("user_id", userId)
        .eq("deck_id", deckId)
        .eq("id", matchupId)
        .maybeSingle()
    ),
    getDeckById(userId, deckId)
  ]);

  if (error) {
    throw error;
  }

  if (!deck) {
    return null;
  }

  const matchup = data
    ? mapRelationalDeckMatchup((data as unknown) as DeckMatchupRelationalRow)
    : deck.matchups.find((entry) => entry.id === matchupId);
  if (!matchup) {
    return null;
  }

  return {
    deckName: deck.deckName,
    deckPokemon: deck.deckPokemon,
    matchup
  };
}

export async function getDeckLogStats(
  userId: string,
  deckId: string
): Promise<DeckLogStats> {
  if (!deckId) {
    return {
      total: 0,
      wins: 0,
      losses: 0
    };
  }

  const supabase = await createClient();
  const { data, error } = await measureServerCall("db.decks.detailStatsReadModel", async () =>
    await supabase
      .from("deck_log_stats")
      .select("games_played,games_won,games_lost")
      .eq("user_id", userId)
      .eq("deck_id", deckId)
      .maybeSingle()
  );

  if (error) {
    throw error;
  }

  const row = ((data ?? null) as unknown) as Omit<DeckLogStatsRow, "deck_id"> | null;

  return {
    total: Number(row?.games_played ?? 0),
    wins: Number(row?.games_won ?? 0),
    losses: Number(row?.games_lost ?? 0)
  };
}
