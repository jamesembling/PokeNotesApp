import { sortDeckListCards } from "@/lib/deck-lists/sort";
import { CANONICAL_DECK_LIST_SORT_VERSION } from "@/lib/deck-lists/version";
import { parseDeckList } from "@/lib/decks/deck-list-parse";
import { getDefaultSyncedSiteFormat } from "@/lib/formats/catalog";
import { userFacingActionError } from "@/lib/server/action-errors";
import type { createClient } from "@/lib/supabase/server";
import type { DeckCard, GoPreference } from "@/types/index";
import type { Json } from "@/types/supabase";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type DeckWriteActor = {
  defaultCreatedBy: string;
  userId: string;
};

export type SaveDeckListCommand = {
  createdBy: string;
  date: string;
  deckId: string;
  deckListId: string;
  format: string;
  name: string;
  notes: string;
  rawList: string;
  submittedCreatedAt: string;
};

export type CreateDeckMatchupCommand = {
  deckId: string;
  deckName: string;
  format: string;
  goPreference: GoPreference;
  idealBench: string;
  matchupFavor: string;
  matchupId: string;
  matchupSprites: string[];
  techsNeeded: string;
};

export type UpdateDeckMatchupCommand = CreateDeckMatchupCommand & {
  matchupPlan: string;
};

export type DeckAggregateCommitResult =
  | "child-not-found"
  | "committed"
  | "conflict"
  | "deck-not-found";

export type DeckAggregateCommitPlan = {
  child: Record<string, unknown>;
  deckId: string;
  expectedChildUpdatedAt: string | null;
  kind: "deck-list" | "matchup";
  operation: "create" | "update";
  updatedAt: string;
};

export type DeckAggregateWriteAdapter = {
  commit(plan: DeckAggregateCommitPlan): Promise<DeckAggregateCommitResult>;
  loadLegacyChildren(input: {
    deckId: string;
    kind: "deck-list" | "matchup";
  }): Promise<unknown[] | null>;
};

export type DeckAggregateWriter = {
  createMatchup(
    command: CreateDeckMatchupCommand
  ): Promise<{ deckId: string; matchupId: string }>;
  saveList(command: SaveDeckListCommand): Promise<{ deckId: string; deckListId: string }>;
  updateMatchup(
    command: UpdateDeckMatchupCommand
  ): Promise<{ deckId: string; matchupId: string }>;
};

type DeckAggregateWriterDependencies = {
  actor: DeckWriteActor;
  adapter: DeckAggregateWriteAdapter;
  createId?: () => string;
  getDefaultFormat?: () => Promise<string>;
  now?: () => string;
  parseCards?: (rawList: string) => DeckCard[];
  sortCards?: (cards: DeckCard[]) => Promise<DeckCard[]>;
};

function asJson(value: unknown): Json {
  return value as Json;
}

function getJsonTimestamp(entry: Record<string, unknown>, camelKey: string, snakeKey: string) {
  return String(entry[camelKey] || entry[snakeKey] || "");
}

function normalizeMatchupSprites(values: string[]) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean))).slice(
    0,
    2
  );
}

function getRequiredMatchupFields(command: CreateDeckMatchupCommand) {
  const deckName = String(command.deckName || "").trim();
  if (!deckName) {
    throw userFacingActionError("Enter a matchup deck name before saving.");
  }

  const format = String(command.format || "").trim();
  if (!format) {
    throw userFacingActionError("Choose a format before saving this matchup.");
  }

  const matchupSprites = normalizeMatchupSprites(command.matchupSprites);
  if (matchupSprites.length === 0) {
    throw userFacingActionError("Pick at least one Pokemon sprite for the matchup.");
  }

  return {
    deckName,
    format,
    matchupSprites
  };
}

export function createDeckAggregateWriter(
  dependencies: DeckAggregateWriterDependencies
): DeckAggregateWriter {
  const {
    actor,
    adapter,
    createId = () => crypto.randomUUID(),
    getDefaultFormat = getDefaultSyncedSiteFormat,
    now = () => new Date().toISOString(),
    parseCards = parseDeckList,
    sortCards = sortDeckListCards
  } = dependencies;

  async function saveList(command: SaveDeckListCommand) {
    const deckId = String(command.deckId || "").trim();
    const deckListId = String(command.deckListId || "").trim();

    if (!deckId) {
      throw userFacingActionError("Deck id is required.");
    }

    const existingDeckLists = await adapter.loadLegacyChildren({
      deckId,
      kind: "deck-list"
    });

    if (!existingDeckLists) {
      throw userFacingActionError("Deck could not be found.");
    }

    const existingDeckList = deckListId
      ? existingDeckLists.find(
          (entry) =>
            entry &&
            typeof entry === "object" &&
            "id" in entry &&
            String((entry as { id?: unknown }).id || "") === deckListId
        )
      : null;
    const name = String(command.name || "").trim();
    const rawList = String(command.rawList || "").trim();

    if (deckListId && !existingDeckList) {
      throw userFacingActionError("Deck list could not be found.");
    }

    if (!name) {
      throw userFacingActionError("Enter a deck list name before saving.");
    }

    if (!rawList) {
      throw userFacingActionError("Paste the deck list before saving.");
    }

    const timestamp = now();
    let parsedCards: DeckCard[];
    let sortedCards: DeckCard[];
    try {
      parsedCards = parseCards(rawList);
      sortedCards = await sortCards(parsedCards);
    } catch {
      throw userFacingActionError(
        "We couldn't apply the canonical deck ordering right now. Please try saving again in a moment."
      );
    }

    const nextDeckList = {
      id: deckListId || createId(),
      name,
      format: String(command.format || "").trim() || (await getDefaultFormat()),
      date: String(command.date || "").trim() || timestamp.slice(0, 10),
      createdBy: String(command.createdBy || "").trim() || actor.defaultCreatedBy,
      notes: String(command.notes || "").trim(),
      rawList,
      parsedCards,
      sortedCards,
      sortedCardsVersion: CANONICAL_DECK_LIST_SORT_VERSION,
      createdAt:
        String(command.submittedCreatedAt || "").trim() ||
        (deckListId
          ? String((existingDeckList as { createdAt?: unknown } | null)?.createdAt || "").trim()
          : "") ||
        timestamp,
      updatedAt: timestamp
    };

    const commitResult = await adapter.commit({
      child: nextDeckList,
      deckId,
      expectedChildUpdatedAt:
        deckListId && existingDeckList && typeof existingDeckList === "object"
          ? getJsonTimestamp(
              existingDeckList as Record<string, unknown>,
              "updatedAt",
              "updated_at"
            )
          : null,
      kind: "deck-list",
      operation: deckListId ? "update" : "create",
      updatedAt: timestamp
    });

    if (commitResult === "deck-not-found") {
      throw userFacingActionError("Deck could not be found.");
    }

    if (commitResult === "child-not-found") {
      throw userFacingActionError("Deck list could not be found.");
    }

    if (commitResult === "conflict") {
      throw userFacingActionError(
        "This deck list changed in another tab. Refresh the page and try again."
      );
    }

    return {
      deckId,
      deckListId: nextDeckList.id
    };
  }

  async function createMatchup(command: CreateDeckMatchupCommand) {
    const deckId = String(command.deckId || "").trim();

    if (!deckId) {
      throw userFacingActionError("Deck id is required.");
    }

    const existingMatchups = await adapter.loadLegacyChildren({
      deckId,
      kind: "matchup"
    });

    if (!existingMatchups) {
      throw userFacingActionError("That deck could not be found.");
    }

    const { deckName, format, matchupSprites } = getRequiredMatchupFields(command);
    const timestamp = now();
    const nextMatchup = {
      id: command.matchupId,
      deckName,
      deckPokemon: matchupSprites,
      format,
      goPreference: command.goPreference,
      matchupFavor: String(command.matchupFavor || "").trim(),
      idealBench: String(command.idealBench || ""),
      techsNeeded: String(command.techsNeeded || ""),
      matchupPlan: "",
      createdAt: timestamp,
      updatedAt: timestamp
    };
    const commitResult = await adapter.commit({
      child: nextMatchup,
      deckId,
      expectedChildUpdatedAt: null,
      kind: "matchup",
      operation: "create",
      updatedAt: timestamp
    });

    if (commitResult === "deck-not-found") {
      throw userFacingActionError("That deck could not be found.");
    }

    if (commitResult === "child-not-found") {
      throw userFacingActionError("That matchup could not be found.");
    }

    if (commitResult === "conflict") {
      throw userFacingActionError(
        "That matchup was already created in another tab. Refresh the page and try again."
      );
    }

    return {
      deckId,
      matchupId: command.matchupId
    };
  }

  async function updateMatchup(command: UpdateDeckMatchupCommand) {
    const deckId = String(command.deckId || "").trim();
    const matchupId = String(command.matchupId || "").trim();

    if (!deckId || !matchupId) {
      throw userFacingActionError("Deck and matchup ids are required.");
    }

    const existingMatchups = await adapter.loadLegacyChildren({
      deckId,
      kind: "matchup"
    });

    if (!existingMatchups) {
      throw userFacingActionError("That deck could not be found.");
    }

    const currentMatchup = existingMatchups.find((entry) => {
      if (!entry || typeof entry !== "object") {
        return false;
      }

      return String((entry as { id?: unknown }).id || "") === matchupId;
    });

    if (!currentMatchup) {
      throw userFacingActionError("That matchup could not be found.");
    }

    const { deckName, format, matchupSprites } = getRequiredMatchupFields(command);
    const timestamp = now();
    const nextMatchup = {
      ...(currentMatchup as Record<string, unknown>),
      deckName,
      deckPokemon: matchupSprites,
      format,
      goPreference: command.goPreference,
      matchupFavor: String(command.matchupFavor || "").trim(),
      idealBench: String(command.idealBench || ""),
      techsNeeded: String(command.techsNeeded || ""),
      matchupPlan: String(command.matchupPlan || ""),
      updatedAt: timestamp
    };
    const commitResult = await adapter.commit({
      child: nextMatchup,
      deckId,
      expectedChildUpdatedAt: getJsonTimestamp(
        currentMatchup as Record<string, unknown>,
        "updatedAt",
        "updated_at"
      ),
      kind: "matchup",
      operation: "update",
      updatedAt: timestamp
    });

    if (commitResult === "deck-not-found") {
      throw userFacingActionError("That deck could not be found.");
    }

    if (commitResult === "child-not-found") {
      throw userFacingActionError("That matchup could not be found.");
    }

    if (commitResult === "conflict") {
      throw userFacingActionError(
        "This matchup changed in another tab. Refresh the page and try again."
      );
    }

    return {
      deckId,
      matchupId
    };
  }

  return {
    createMatchup,
    saveList,
    updateMatchup
  };
}

function createSupabaseDeckAggregateWriteAdapter(input: {
  supabase: SupabaseClient;
  userId: string;
}): DeckAggregateWriteAdapter {
  const { supabase, userId } = input;

  return {
    async commit(plan) {
      const { data, error } = await supabase.rpc("commit_deck_aggregate_child", {
        p_child: asJson(plan.child),
        p_deck_id: plan.deckId,
        p_expected_child_updated_at: plan.expectedChildUpdatedAt,
        p_kind: plan.kind,
        p_operation: plan.operation,
        p_updated_at: plan.updatedAt
      });

      if (error) {
        throw error;
      }

      if (
        data === "child-not-found" ||
        data === "committed" ||
        data === "conflict" ||
        data === "deck-not-found"
      ) {
        return data;
      }

      throw new Error("Deck aggregate commit returned an unexpected status.");
    },

    async loadLegacyChildren({ deckId, kind }) {
      if (kind === "deck-list") {
        const { data, error } = await supabase
          .from("decks")
          .select("id,deck_lists")
          .eq("id", deckId)
          .eq("user_id", userId)
          .maybeSingle();

        if (error) {
          throw error;
        }

        if (!data) {
          return null;
        }

        return Array.isArray(data.deck_lists) ? data.deck_lists : [];
      }

      const { data, error } = await supabase
        .from("decks")
        .select("id,matchups")
        .eq("id", deckId)
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data) {
        return null;
      }

      return Array.isArray(data.matchups) ? data.matchups : [];
    }
  };
}

export function createServerDeckAggregateWriter(input: {
  actor: DeckWriteActor;
  supabase: SupabaseClient;
}) {
  return createDeckAggregateWriter({
    actor: input.actor,
    adapter: createSupabaseDeckAggregateWriteAdapter({
      supabase: input.supabase,
      userId: input.actor.userId
    })
  });
}
