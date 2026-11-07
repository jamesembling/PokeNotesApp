import { createClient } from "@/lib/supabase/server";
import { getReadSortedDeckCards } from "@/lib/deck-lists/read-sort";
import { makeDeckListSelectionKey } from "@/lib/log-import/deck-list-selection";
import {
  resolveDeckListReference,
  type DeckListReferenceRecord,
  type ResolvedDeckListReference
} from "@/lib/decks/deck-list-reference";
import type { DeckCard, DeckList, DeckListSelectionOption } from "@/types/index";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type DeckListSelectionSource = DeckListSelectionOption & {
  source?: "legacy" | "relational";
};

export type ValidatedDeckListReference = ResolvedDeckListReference;

export type DeckListUsageCount = {
  battleLogs: number;
  losses: number;
  tournaments: number;
  wins: number;
};

type DeckListRow = {
  created_at: string;
  created_by: string | null;
  date: string | null;
  deck_id: string | null;
  format: string | null;
  id: string;
  name: string;
  notes: string | null;
  parsed_cards: unknown;
  raw_list: string | null;
  sorted_cards: unknown;
  sorted_cards_version: number | null;
  updated_at: string;
  user_id: string;
};

type DeckListReferenceRow = Pick<
  DeckListRow,
  "deck_id" | "id" | "name" | "user_id"
>;

type LegacyDeckRow = {
  deck_lists: unknown;
  deck_name: string;
  id: string;
};

type LegacyDeckListValue = Record<string, unknown>;

const DECK_LIST_SELECT = [
  "id",
  "deck_id",
  "user_id",
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
].join(",");

function parseCards(value: unknown): DeckCard[] {
  return Array.isArray(value) ? (value as DeckCard[]) : [];
}

function mapDeckList(row: DeckListRow): DeckList {
  const parsedCards = parseCards(row.parsed_cards);
  const sortedCards = getReadSortedDeckCards({
    parsedCards,
    sortedCards: parseCards(row.sorted_cards),
    sortedCardsVersion: row.sorted_cards_version ?? undefined
  });

  return {
    createdAt: row.created_at,
    createdBy: row.created_by ?? "",
    date: row.date ?? "",
    deckId: row.deck_id,
    format: row.format ?? "",
    id: row.id,
    name: row.name,
    notes: row.notes ?? "",
    parsedCards,
    rawList: row.raw_list ?? "",
    sortedCards,
    sortedCardsVersion: row.sorted_cards_version ?? undefined,
    storage: "relational",
    updatedAt: row.updated_at
  };
}

function parseLegacyDeckList(value: unknown, deckId: string): DeckList | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const legacy = value as LegacyDeckListValue;
  const id = String(legacy.id || "").trim();
  const name = String(legacy.name || "").trim();
  if (!id || !name || !deckId) {
    return null;
  }

  const parsedCards = parseCards(legacy.parsedCards ?? legacy.parsed_cards);
  const sortedCards = parseCards(legacy.sortedCards ?? legacy.sorted_cards);
  const sortedCardsVersion =
    typeof (legacy.sortedCardsVersion ?? legacy.sorted_cards_version) === "number"
      ? Number(legacy.sortedCardsVersion ?? legacy.sorted_cards_version)
      : undefined;

  return {
    createdAt: String(legacy.createdAt || legacy.created_at || ""),
    createdBy: String(legacy.createdBy || legacy.created_by || ""),
    date: String(legacy.date || ""),
    deckId,
    format: String(legacy.format || ""),
    id,
    name,
    notes: String(legacy.notes || ""),
    parsedCards,
    rawList: String(legacy.rawList || legacy.raw_list || ""),
    sortedCards: getReadSortedDeckCards({
      parsedCards,
      sortedCards,
      sortedCardsVersion
    }),
    sortedCardsVersion,
    storage: "legacy",
    updatedAt: String(legacy.updatedAt || legacy.updated_at || "")
  };
}

function mergeDeckListReadModels(
  relationalLists: DeckList[],
  legacyLists: DeckList[]
): DeckList[] {
  const byIdentity = new Map<string, DeckList>();
  const ambiguousLegacy = new Set<string>();
  const identity = (list: DeckList) => `${list.id}\u0000${list.deckId ?? ""}`;

  relationalLists.forEach((list) => {
    byIdentity.set(identity(list), list);
  });

  legacyLists.forEach((list) => {
    const key = identity(list);
    if (byIdentity.has(key)) {
      return;
    }
    if (ambiguousLegacy.has(key)) {
      return;
    }
    if (legacyLists.filter((candidate) => identity(candidate) === key).length > 1) {
      byIdentity.delete(key);
      ambiguousLegacy.add(key);
      return;
    }
    byIdentity.set(key, list);
  });

  return Array.from(byIdentity.values()).sort((left, right) => {
    const updatedAt = right.updatedAt.localeCompare(left.updatedAt);
    if (updatedAt !== 0) {
      return updatedAt;
    }
    const id = left.id.localeCompare(right.id);
    if (id !== 0) {
      return id;
    }
    return (left.deckId ?? "").localeCompare(right.deckId ?? "");
  });
}

function mapReference(row: DeckListReferenceRow): DeckListReferenceRecord {
  return {
    deckId: row.deck_id,
    id: row.id,
    name: row.name,
    source: "relational",
    userId: row.user_id
  };
}

function parseLegacyReference(
  value: unknown,
  deckId: string,
  userId: string
): DeckListReferenceRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const id = String(candidate.id || "").trim();
  const name = String(candidate.name || "").trim();
  if (!id || !name) {
    return null;
  }

  return { deckId, id, name, source: "legacy", userId };
}

function parseLegacyReferences(row: LegacyDeckRow, userId: string) {
  if (!Array.isArray(row.deck_lists)) {
    return [];
  }

  return row.deck_lists
    .map((value) => parseLegacyReference(value, row.id, userId))
    .filter((value): value is DeckListReferenceRecord => value !== null);
}

export function buildDeckListSelectionOptions(
  sources: DeckListSelectionSource[]
): DeckListSelectionOption[] {
  const grouped = new Map<string, DeckListSelectionSource[]>();
  for (const source of sources) {
    const identity = `${source.id}\u0000${source.deckId ?? ""}`;
    const entries = grouped.get(identity) ?? [];
    entries.push(source);
    grouped.set(identity, entries);
  }

  const result: DeckListSelectionOption[] = [];
  for (const entries of grouped.values()) {
    const relational = entries.filter((entry) => entry.source === "relational");
    if (relational.length === 1) {
      const { source: _source, selectionKey: _selectionKey, ...option } = relational[0];
      result.push({
        ...option,
        selectionKey: makeDeckListSelectionKey({ deckId: option.deckId, deckListId: option.id })
      });
      continue;
    }

    if (entries.length === 1) {
      const { source: _source, selectionKey: _selectionKey, ...option } = entries[0];
      result.push({
        ...option,
        selectionKey: makeDeckListSelectionKey({ deckId: option.deckId, deckListId: option.id })
      });
    }
  }

  return result;
}

async function getFirstClassReference(
  supabase: SupabaseClient,
  userId: string,
  deckListId: string
): Promise<DeckListReferenceRecord | null> {
  const { data, error } = await supabase
    .from("deck_lists")
    .select("id,deck_id,user_id,name")
    .eq("user_id", userId)
    .eq("id", deckListId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapReference(data as DeckListReferenceRow) : null;
}

async function getLegacyReference(
  supabase: SupabaseClient,
  userId: string,
  linkedDeckId: string | null,
  linkedDeckListId: string
): Promise<DeckListReferenceRecord | null> {
  let query = supabase
    .from("decks")
    .select("id,deck_name,deck_lists")
    .eq("user_id", userId);
  if (linkedDeckId) {
    query = query.eq("id", linkedDeckId);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  const candidates = ((data ?? []) as unknown as LegacyDeckRow[])
    .flatMap((row) => parseLegacyReferences(row, userId))
    .filter((row) => row.id === linkedDeckListId);

  return candidates.length === 1 ? candidates[0] : null;
}

export function resolveDeckListByIdentity(
  relationalList: DeckList | null,
  legacyCandidates: DeckList[],
  requestedDeckId: string | null | undefined,
  requestedStrategyExists: boolean
) {
  if (!relationalList) {
    return legacyCandidates.length === 1 ? legacyCandidates[0] : null;
  }

  if (!requestedDeckId || !requestedStrategyExists) {
    return relationalList;
  }

  if (legacyCandidates.length > 1) {
    return null;
  }

  const legacyCandidate = legacyCandidates[0];
  if (!legacyCandidate || legacyCandidate.deckId === relationalList.deckId) {
    return relationalList;
  }

  return legacyCandidate;
}

export async function validateDeckListReference(input: {
  linkedDeckId?: string | null;
  linkedDeckListId?: string | null;
  supabase: SupabaseClient;
  userId: string;
}): Promise<ValidatedDeckListReference> {
  const linkedDeckId = String(input.linkedDeckId || "").trim() || null;
  const linkedDeckListId = String(input.linkedDeckListId || "").trim() || null;

  if (linkedDeckId) {
    const { data, error } = await input.supabase
      .from("decks")
      .select("id")
      .eq("user_id", input.userId)
      .eq("id", linkedDeckId)
      .maybeSingle();
    if (error) {
      throw error;
    }
    if (!data) {
      throw new Error("Deck Strategy could not be found.");
    }
  }

  if (!linkedDeckListId) {
    if (!linkedDeckId) {
      return { deckId: null, deckListId: null, list: null };
    }

    return { deckId: linkedDeckId, deckListId: null, list: null };
  }

  const firstClassList = await getFirstClassReference(
    input.supabase,
    input.userId,
    linkedDeckListId
  );
  const list = linkedDeckId && firstClassList?.deckId !== linkedDeckId
    ? (await getLegacyReference(
        input.supabase,
        input.userId,
        linkedDeckId,
        linkedDeckListId
      )) ?? firstClassList
    : firstClassList ?? (linkedDeckId
        ? await getLegacyReference(
            input.supabase,
            input.userId,
            linkedDeckId,
            linkedDeckListId
          )
        : null);

  return resolveDeckListReference({
    linkedDeckId,
    linkedDeckListId,
    list,
    userId: input.userId
  });
}

export async function getDeckListById(
  userId: string,
  deckListId: string,
  deckId?: string | null
): Promise<DeckList | null> {
  const supabase = await createClient();
  const listQuery = supabase
    .from("deck_lists")
    .select(DECK_LIST_SELECT)
    .eq("user_id", userId)
    .eq("id", deckListId);
  const { data, error } = await listQuery.maybeSingle();

  if (error) {
    throw error;
  }

  const relationalList = data ? mapDeckList(data as unknown as DeckListRow) : null;

  async function getLegacyCandidates(targetDeckId?: string | null) {
    let deckQuery = supabase
      .from("decks")
      .select("id,deck_name,deck_lists")
      .eq("user_id", userId);
    if (targetDeckId) {
      deckQuery = deckQuery.eq("id", targetDeckId);
    }
    const { data: decks, error: deckError } = await deckQuery;
    if (deckError) {
      throw deckError;
    }

    return ((decks ?? []) as unknown as LegacyDeckRow[]).flatMap((deck) =>
      (Array.isArray(deck.deck_lists) ? deck.deck_lists : [])
        .map((value) => parseLegacyDeckList(value, deck.id))
        .filter((value): value is DeckList => value !== null)
        .filter((value) => value.id === deckListId)
    );
  }

  if (relationalList) {
    if (!deckId) {
      return relationalList;
    }

    const { data: targetDeck, error: targetDeckError } = await supabase
      .from("decks")
      .select("id")
      .eq("user_id", userId)
      .eq("id", deckId)
      .maybeSingle();
    if (targetDeckError) {
      throw targetDeckError;
    }

    const legacyCandidates = targetDeck ? await getLegacyCandidates(deckId) : [];
    return resolveDeckListByIdentity(
      relationalList,
      legacyCandidates,
      deckId,
      Boolean(targetDeck)
    );
  }

  const candidates = await getLegacyCandidates(deckId);
  return resolveDeckListByIdentity(null, candidates, deckId, Boolean(deckId));
}

export async function getDeckLists(userId: string): Promise<DeckList[]> {
  const supabase = await createClient();
  const [listResult, deckResult] = await Promise.all([
    supabase.from("deck_lists").select(DECK_LIST_SELECT).eq("user_id", userId),
    supabase.from("decks").select("id,deck_name,deck_lists").eq("user_id", userId)
  ]);

  if (listResult.error) {
    throw listResult.error;
  }
  if (deckResult.error) {
    throw deckResult.error;
  }

  const relationalLists = ((listResult.data ?? []) as unknown as DeckListRow[]).map(mapDeckList);
  const legacyLists = ((deckResult.data ?? []) as unknown as LegacyDeckRow[]).flatMap((deck) =>
    (Array.isArray(deck.deck_lists) ? deck.deck_lists : [])
      .map((value) => parseLegacyDeckList(value, deck.id))
      .filter((value): value is DeckList => value !== null)
  );

  return mergeDeckListReadModels(relationalLists, legacyLists);
}

export async function getDeckListUsageCounts(
  userId: string,
  deckListIds: string[]
): Promise<Map<string, DeckListUsageCount>> {
  const uniqueDeckListIds = Array.from(new Set(deckListIds));
  if (uniqueDeckListIds.length === 0) {
    return new Map();
  }

  const supabase = await createClient();
  const [logResult, tournamentResult] = await Promise.all([
    supabase
      .from("logs")
      .select("linked_deck_list_id,result")
      .eq("user_id", userId)
      .in("linked_deck_list_id", uniqueDeckListIds),
    supabase
      .from("tournaments")
      .select("linked_deck_list_id")
      .eq("user_id", userId)
      .in("linked_deck_list_id", uniqueDeckListIds)
  ]);

  if (logResult.error) {
    throw logResult.error;
  }
  if (tournamentResult.error) {
    throw tournamentResult.error;
  }

  const counts = new Map<string, DeckListUsageCount>(
    uniqueDeckListIds.map((id) => [
      id,
      { battleLogs: 0, losses: 0, tournaments: 0, wins: 0 }
    ])
  );
  for (const row of logResult.data ?? []) {
    const deckListId = row.linked_deck_list_id;
    if (deckListId && counts.has(deckListId)) {
      const usage = counts.get(deckListId)!;
      usage.battleLogs += 1;
      if (row.result === "Win") {
        usage.wins += 1;
      } else if (row.result === "Loss") {
        usage.losses += 1;
      }
    }
  }
  for (const row of tournamentResult.data ?? []) {
    const deckListId = row.linked_deck_list_id;
    if (deckListId && counts.has(deckListId)) {
      counts.get(deckListId)!.tournaments += 1;
    }
  }

  return counts;
}

export async function getOwnedDeckStrategyOptions(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("decks")
    .select("id,deck_name")
    .eq("user_id", userId)
    .order("deck_name", { ascending: true });

  if (error) {
    throw error;
  }

  return ((data ?? []) as Array<{ id: string; deck_name: string }>).map((row) => ({
    id: row.id,
    name: row.deck_name
  }));
}

export async function getDeckListSelectionOptions(
  userId: string
): Promise<DeckListSelectionOption[]> {
  const supabase = await createClient();
  const [listResult, deckResult] = await Promise.all([
    supabase.from("deck_lists").select("id,deck_id,user_id,name").eq("user_id", userId),
    supabase.from("decks").select("id,deck_name,deck_lists").eq("user_id", userId)
  ]);

  if (listResult.error) {
    throw listResult.error;
  }
  if (deckResult.error) {
    throw deckResult.error;
  }

  const deckRows = (deckResult.data ?? []) as unknown as LegacyDeckRow[];
  const deckNames = new Map(deckRows.map((row) => [row.id, row.deck_name] as const));
  const relationalSources: DeckListSelectionSource[] = (
    (listResult.data ?? []) as unknown as DeckListReferenceRow[]
  ).map((row) => ({
    deckId: row.deck_id,
    deckName: row.deck_id ? deckNames.get(row.deck_id) ?? null : null,
    id: row.id,
    name: row.name,
    source: "relational"
  }));

  const legacySources: DeckListSelectionSource[] = deckRows
    .flatMap((row) => parseLegacyReferences(row, userId))
    .map((row) => ({
      deckId: row.deckId,
      deckName: deckNames.get(row.deckId ?? "") ?? null,
      id: row.id,
      name: row.name,
      source: "legacy" as const
    }));

  const options = buildDeckListSelectionOptions([...relationalSources, ...legacySources]);
  return options.map((option) => ({
    ...option,
    source: relationalSources.some(
      (source) => source.id === option.id && source.deckId === option.deckId
    )
      ? "relational"
      : "legacy"
  }));
}
