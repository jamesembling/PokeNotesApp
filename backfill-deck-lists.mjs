import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const REQUIRED_ENV_VARS = ["NEW_SUPABASE_URL", "NEW_SUPABASE_SERVICE_KEY"];
const CARD_LINE_PATTERN = /^(\d+)\s+(.+)$/;

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

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeHeader(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function getCategoryFromHeader(line) {
  const normalized = normalizeHeader(line);

  if (
    normalized === "pokemon" ||
    normalized === "pokemon cards"
  ) {
    return "Pokemon";
  }

  if (
    normalized === "trainer" ||
    normalized === "trainers" ||
    normalized === "trainer cards"
  ) {
    return "Trainer";
  }

  if (
    normalized === "energy" ||
    normalized === "energies" ||
    normalized === "energy cards"
  ) {
    return "Energy";
  }

  if (
    normalized === "total cards" ||
    normalized === "total" ||
    normalized === "cards"
  ) {
    return "Unknown";
  }

  return null;
}

function parseDescription(description) {
  const tokens = description.trim().split(/\s+/).filter(Boolean);

  if (tokens.length < 3) {
    return {
      name: description.trim(),
      set: "",
      number: "",
    };
  }

  return {
    name: tokens.slice(0, -2).join(" "),
    set: tokens.at(-2) ?? "",
    number: tokens.at(-1) ?? "",
  };
}

function parseRawList(rawList) {
  const lines = typeof rawList === "string" ? rawList.split(/\r?\n/) : [];
  const parsedCards = [];
  let currentCategory = "Unknown";

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      continue;
    }

    const headerCategory = getCategoryFromHeader(line);
    if (headerCategory) {
      currentCategory = headerCategory;
      continue;
    }

    const match = line.match(CARD_LINE_PATTERN);
    if (!match) {
      continue;
    }

    const count = Number.parseInt(match[1], 10);
    const description = (match[2] ?? "").trim();

    if (!Number.isFinite(count) || count === 0 || !description) {
      continue;
    }

    if (getCategoryFromHeader(description)) {
      continue;
    }

    const { name, set, number } = parseDescription(description);

    if (!name) {
      continue;
    }

    parsedCards.push({
      count,
      name,
      set,
      number,
      category: currentCategory,
    });
  }

  return parsedCards;
}

async function main() {
  const summary = {
    decksProcessed: 0,
    deckListsUpdated: 0,
    cardsParsed: 0,
  };

  const { data: decks, error } = await supabase
    .from("decks")
    .select("id, deck_name, deck_lists")
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  for (const deck of safeArray(decks)) {
    summary.decksProcessed += 1;

    const deckId = typeof deck.id === "string" ? deck.id : "<unknown>";
    const deckName = typeof deck.deck_name === "string" ? deck.deck_name : "";
    const deckLists = safeArray(deck.deck_lists);

    console.log(
      `[Deck ${summary.decksProcessed}] Processing ${deckId}${deckName ? ` (${deckName})` : ""} with ${deckLists.length} deck list(s)`,
    );

    let updatedDeckLists;

    try {
      updatedDeckLists = deckLists.map((deckList, index) => {
        if (!deckList || typeof deckList !== "object" || Array.isArray(deckList)) {
          console.warn(
            `  [List ${index + 1}] Invalid deck list shape on deck ${deckId}; preserving entry and setting empty parsedCards`,
          );

          return {
            ...safeObject(deckList),
            parsedCards: [],
          };
        }

        const rawList =
          typeof deckList.rawList === "string"
            ? deckList.rawList
            : typeof deckList.raw_list === "string"
              ? deckList.raw_list
              : "";

        const listName = typeof deckList.name === "string" ? deckList.name : `List ${index + 1}`;

        try {
          const parsedCards = parseRawList(rawList);
          console.log(
            `  [List ${index + 1}] ${listName}: parsed ${parsedCards.length} card line(s)`,
          );

          return {
            ...deckList,
            parsedCards,
          };
        } catch (listError) {
          console.error(
            `  [List ${index + 1}] ${listName}: failed to parse rawList`,
            listError,
          );

          return {
            ...deckList,
            parsedCards: [],
          };
        }
      });
    } catch (deckError) {
      console.error(`Failed to build updated deck_lists for deck ${deckId}`, deckError);
      continue;
    }

    const { error: updateError } = await supabase
      .from("decks")
      .update({ deck_lists: updatedDeckLists })
      .eq("id", deckId);

    if (updateError) {
      console.error(`Failed to update deck ${deckId}`, updateError);
      continue;
    }

    const deckCardsParsed = updatedDeckLists.reduce((total, deckList) => {
      return total + safeArray(deckList.parsedCards).length;
    }, 0);

    summary.deckListsUpdated += updatedDeckLists.length;
    summary.cardsParsed += deckCardsParsed;

    console.log(
      `[Deck ${summary.decksProcessed}] Updated ${updatedDeckLists.length} deck list(s), ${deckCardsParsed} parsed card(s)`,
    );
  }

  console.log("");
  console.log("Backfill complete.");
  console.log(`Decks processed: ${summary.decksProcessed}`);
  console.log(`Deck lists updated: ${summary.deckListsUpdated}`);
  console.log(`Cards parsed: ${summary.cardsParsed}`);
}

main().catch((error) => {
  console.error("Backfill failed before processing completed.", error);
  process.exit(1);
});
