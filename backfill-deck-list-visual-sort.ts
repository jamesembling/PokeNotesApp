import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { interpretDeckList } from "@/lib/decks/deck-list-parse";
import { sortDeckListCards } from "@/lib/deck-lists/sort";
import { CANONICAL_DECK_LIST_SORT_VERSION } from "@/lib/deck-lists/version";
import type { DeckCard } from "@/types/index";

type DeckRow = {
  id: string;
  deck_lists: unknown;
  deck_name: string | null;
};

type DeckListRecord = Record<string, unknown>;

const env = {
  url: process.env.NEW_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  serviceKey: process.env.NEW_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
};

const shouldApply = process.argv.includes("--apply");
const targetDeckId = readArg("--deck-id");
const targetListId = readArg("--list-id");

if (!env.url || !env.serviceKey) {
  throw new Error(
    "Missing Supabase environment. Set NEW_SUPABASE_URL and NEW_SUPABASE_SERVICE_KEY."
  );
}

const supabase = createClient(env.url, env.serviceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

function readArg(name: string) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : "";

  return value && !value.startsWith("--") ? value : "";
}

function asDeckListArray(value: unknown): DeckListRecord[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is DeckListRecord => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry))
    : [];
}

function asDeckCardArray(value: unknown): DeckCard[] {
  return Array.isArray(value) ? (value as DeckCard[]) : [];
}

function getRawList(deckList: DeckListRecord) {
  return typeof deckList.rawList === "string"
    ? deckList.rawList
    : typeof deckList.raw_list === "string"
      ? deckList.raw_list
      : "";
}

function getListId(deckList: DeckListRecord) {
  return typeof deckList.id === "string" ? deckList.id : "";
}

function getListName(deckList: DeckListRecord) {
  return typeof deckList.name === "string" ? deckList.name : "Unnamed list";
}

function hasCurrentVisualSort(deckList: DeckListRecord) {
  return (
    deckList.sortedCardsVersion === CANONICAL_DECK_LIST_SORT_VERSION &&
    asDeckCardArray(deckList.sortedCards).length > 0
  );
}

async function loadDeckRows() {
  let query = supabase
    .from("decks")
    .select("id,deck_name,deck_lists")
    .order("updated_at", { ascending: false });

  if (targetDeckId) {
    query = query.eq("id", targetDeckId);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data ?? []) as DeckRow[];
}

async function main() {
  const summary = {
    decksScanned: 0,
    decksUpdated: 0,
    listsScanned: 0,
    listsUpdated: 0,
    listsSkipped: 0
  };

  for (const deck of await loadDeckRows()) {
    summary.decksScanned += 1;
    const deckLists = asDeckListArray(deck.deck_lists);
    let deckChanged = false;

    const nextDeckLists = [];
    for (const deckList of deckLists) {
      const listId = getListId(deckList);
      summary.listsScanned += 1;

      if (targetListId && listId !== targetListId) {
        summary.listsSkipped += 1;
        nextDeckLists.push(deckList);
        continue;
      }

      if (hasCurrentVisualSort(deckList)) {
        summary.listsSkipped += 1;
        nextDeckLists.push(deckList);
        continue;
      }

      const parsedCards =
        asDeckCardArray(deckList.parsedCards).length > 0
          ? asDeckCardArray(deckList.parsedCards)
          : interpretDeckList(getRawList(deckList)).cards;

      const sortedCards = await sortDeckListCards(parsedCards);
      deckChanged = true;
      summary.listsUpdated += 1;

      console.log(
        `${shouldApply ? "Updating" : "Would update"} ${deck.deck_name || deck.id} / ${getListName(deckList)} (${listId || "missing id"}): ${sortedCards.length} sorted card rows`
      );

      nextDeckLists.push({
        ...deckList,
        parsedCards,
        sortedCards,
        sortedCardsVersion: CANONICAL_DECK_LIST_SORT_VERSION
      });
    }

    if (!deckChanged) {
      continue;
    }

    if (shouldApply) {
      const { error } = await supabase
        .from("decks")
        .update({ deck_lists: nextDeckLists })
        .eq("id", deck.id);

      if (error) {
        throw error;
      }
    }

    summary.decksUpdated += 1;
  }

  console.log("");
  console.log(`${shouldApply ? "Applied" : "Dry run"} deck-list visual sort backfill.`);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error("Deck-list visual sort backfill failed.", error);
  process.exit(1);
});
