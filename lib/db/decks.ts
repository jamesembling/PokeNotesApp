import { createClient } from "@/lib/supabase/server";
import type { Deck, DeckCard, DeckList, DeckSummary, GoPreference } from "@/types/index";

type DeckSummaryRow = {
  id: string;
  user_id: string;
  deck_name: string;
  format: string;
  go_preference: GoPreference | null;
  deck_pokemon: unknown;
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

type ResultCountRow = {
  result: "Win" | "Loss";
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

function mapDeckSummary(row: DeckSummaryRow): DeckSummary {
  return {
    id: row.id,
    userId: row.user_id,
    deckName: row.deck_name,
    format: row.format,
    goPreference: row.go_preference ?? "",
    deckPokemon: parseStringArray(row.deck_pokemon),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapDeck(row: DeckRow): Deck {
  return {
    ...mapDeckSummary(row),
    coreStrategy: row.core_strategy ?? "",
    generalNotes: row.general_notes ?? "",
    setupGoals: parseStringArray(row.setup_goals),
    resourcePlan: row.resource_plan ?? "",
    deckLists: parseDeckLists(row.deck_lists)
  };
}

export async function getDecks(userId: string): Promise<DeckSummary[]> {
  const supabase = createClient();

  const { data, error } = await supabase
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
        "updated_at"
      ].join(",")
    )
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) {
    throw error;
  }

  const rows = ((data ?? []) as unknown) as DeckSummaryRow[];
  return rows.map(mapDeckSummary);
}

export async function getDeckById(userId: string, deckId: string): Promise<Deck | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("decks")
    .select("*")
    .eq("user_id", userId)
    .eq("id", deckId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return mapDeck((data as unknown) as DeckRow);
}

export async function getDeckWithList(
  userId: string,
  deckId: string,
  listId: string
): Promise<{ deck: Deck; deckList: DeckList } | null> {
  const deck = await getDeckById(userId, deckId);

  if (!deck) {
    return null;
  }

  const deckList = deck.deckLists.find((entry) => entry.id === listId);

  if (!deckList) {
    return null;
  }

  return { deck, deckList };
}

export async function getDeckLogStats(
  userId: string,
  deckId: string
): Promise<DeckLogStats> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("logs")
    .select("result")
    .eq("user_id", userId)
    .eq("linked_deck_id", deckId);

  if (error) {
    throw error;
  }

  const rows = ((data ?? []) as unknown) as ResultCountRow[];
  let wins = 0;
  let losses = 0;

  rows.forEach((row) => {
    if (row.result === "Win") {
      wins += 1;
    } else if (row.result === "Loss") {
      losses += 1;
    }
  });

  return {
    total: rows.length,
    wins,
    losses
  };
}
