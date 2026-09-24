import { sortDeckListCards } from "@/lib/deck-lists/sort";
import { getReadSortedDeckCards } from "@/lib/deck-lists/read-sort";
import { CANONICAL_DECK_LIST_SORT_VERSION } from "@/lib/deck-lists/version";
import { getBattleLogDeckDisplayName } from "@/lib/battle-log/display";
import { interpretDeckList } from "@/lib/decks/deck-list-parse";
import { getDefaultSyncedSiteFormat } from "@/lib/formats/catalog";
import { userFacingActionError } from "@/lib/server/action-errors";
import {
  getDeckListStaleVersionMessage,
  isDeckListStaleVersionError
} from "@/lib/decks/deck-list-errors";
import type { createClient } from "@/lib/supabase/server";
import type { DeckCard, DeckList, GoPreference } from "@/types/index";
import type { Json } from "@/types/supabase";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type DeckWriteActor = {
  defaultCreatedBy: string;
  userId: string;
};

export type SaveDeckListCommand = {
  createdBy: string;
  date: string;
  deckId: string | null;
  deckListId: string;
  format: string;
  name: string;
  notes: string;
  rawList: string;
  submittedCreatedAt: string;
  submittedUpdatedAt: string;
  creationKey?: string;
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

type UpdateDeckMatchupFields = Partial<
  Pick<
    UpdateDeckMatchupCommand,
    | "deckName"
    | "format"
    | "goPreference"
    | "idealBench"
    | "matchupFavor"
    | "matchupPlan"
    | "matchupSprites"
    | "techsNeeded"
  >
>;

type UpdateDeckMatchupFieldsCommandBase = {
  deckId: string;
  matchupId: string;
};

export type UpdateDeckMatchupFieldsCommand = UpdateDeckMatchupFieldsCommandBase &
  (
    | {
      fields: Pick<
        UpdateDeckMatchupCommand,
        "idealBench" | "matchupPlan" | "techsNeeded"
      >;
      scope: "plan";
    }
    | {
      fields: Pick<
        UpdateDeckMatchupCommand,
        "format" | "goPreference" | "matchupFavor"
      >;
      scope: "header";
    }
  );

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

export type DeckListCommitPlan = {
  child: Record<string, unknown>;
  creationKey: string;
  deckId: string | null;
  expectedChildUpdatedAt: string | null;
  legacySourceDeckId?: string | null;
  operation: "create" | "update";
  updatedAt: string;
};

export type DeckListCommitResult = {
  deckId: string | null;
  deckListId: string;
  status: "committed" | "idempotent";
};

export type DeckAggregateWriteAdapter = {
  commit(plan: DeckAggregateCommitPlan): Promise<DeckAggregateCommitResult>;
  commitDeckList?(plan: DeckListCommitPlan): Promise<DeckListCommitResult>;
  loadDeckList?(input: {
    deckId: string | null;
    deckListId: string;
  }): Promise<import("@/types/index").DeckList | null>;
  loadLegacyChildren(input: {
    deckId: string;
    kind: "deck-list" | "matchup";
  }): Promise<unknown[] | null>;
};

export { isDeckListStaleVersionError } from "@/lib/decks/deck-list-errors";

export type DeckAggregateWriter = {
  createMatchup(
    command: CreateDeckMatchupCommand
  ): Promise<{ deckId: string; matchupId: string }>;
  saveList(command: SaveDeckListCommand): Promise<{ deckId: string | null; deckListId: string }>;
  updateMatchup(
    command: UpdateDeckMatchupCommand
  ): Promise<{ deckId: string; matchupId: string }>;
  updateMatchupFields(
    command: UpdateDeckMatchupFieldsCommand
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
  const matchupSprites = normalizeMatchupSprites(command.matchupSprites);
  if (matchupSprites.length === 0) {
    throw userFacingActionError("Choose at least one Pokemon for the archetype.");
  }

  const format = String(command.format || "").trim();
  if (!format) {
    throw userFacingActionError("Choose a format before saving this matchup.");
  }

  return {
    deckName: getBattleLogDeckDisplayName(command.deckName, matchupSprites),
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
    parseCards = (rawList) => interpretDeckList(rawList).cards,
    sortCards = sortDeckListCards
  } = dependencies;

  async function saveList(command: SaveDeckListCommand) {
    const deckId = String(command.deckId || "").trim() || null;
    const deckListId = String(command.deckListId || "").trim();

    if (!deckId && !adapter.commitDeckList) {
      throw userFacingActionError("Deck id is required.");
    }

    const loadedDeckList = deckListId && adapter.loadDeckList
      ? await adapter.loadDeckList({ deckId, deckListId })
      : null;
    // The server adapter can return a legacy compatibility copy from this
    // lookup. Keep that copy in the exact-source path instead of treating it
    // as a relational row and dropping _legacySourceDeckId.
    const existingDeckList = loadedDeckList?.storage === "legacy" ? null : loadedDeckList;
    const existingDeckLists = deckId && (!adapter.loadDeckList || !existingDeckList)
      ? await adapter.loadLegacyChildren({ deckId, kind: "deck-list" })
      : null;
    const legacyMatches = deckListId
      ? (existingDeckLists ?? []).filter(
          (entry) =>
            entry &&
            typeof entry === "object" &&
            "id" in entry &&
            String((entry as { id?: unknown }).id || "") === deckListId
        )
      : [];
    const legacyExistingDeckList = deckListId
      ? (legacyMatches.length === 1
          ? legacyMatches[0]
          : legacyMatches.length > 1
            ? null
            : loadedDeckList?.storage === "legacy"
              ? loadedDeckList
              : null)
      : null;
    const name = String(command.name || "").trim();
    const rawList = String(command.rawList || "").trim();

    if (deckListId && !existingDeckList) {
      if (!legacyExistingDeckList) {
        throw userFacingActionError("Deck list could not be found.");
      }
    }

    if (deckListId && !String(command.submittedUpdatedAt || "").trim()) {
      throw userFacingActionError("Deck List version is required; refresh before saving.");
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

    const operation = deckListId ? "update" : "create";
    const creationKey = operation === "create"
      ? String(command.creationKey || "").trim() || createId()
      : String(command.creationKey || "").trim() || deckListId;
    const nextDeckList = {
      id: deckListId || creationKey,
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
          ? String(
              existingDeckList?.createdAt ??
                (legacyExistingDeckList as { createdAt?: unknown } | null)?.createdAt ??
                ""
            ).trim()
          : "") ||
        timestamp,
      updatedAt: timestamp
    };

    const expectedChildUpdatedAt = deckListId
      ? String(command.submittedUpdatedAt || "").trim() || null
      : null;
    const legacySourceDeckId =
      operation === "update" && !existingDeckList && legacyExistingDeckList && deckId
        ? deckId
        : null;
    if (adapter.commitDeckList) {
      const commitResult = await adapter.commitDeckList({
        child: nextDeckList,
        creationKey,
        deckId,
        expectedChildUpdatedAt,
        legacySourceDeckId,
        operation,
        updatedAt: timestamp
      });

      return {
        deckId: commitResult.deckId,
        deckListId: commitResult.deckListId
      };
    }

    const commitResult = await adapter.commit({
      child: nextDeckList,
      deckId: deckId as string,
      expectedChildUpdatedAt,
      kind: "deck-list",
      operation,
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

  async function commitMatchupUpdate(
    command: UpdateDeckMatchupFieldsCommandBase & { fields: UpdateDeckMatchupFields },
    conflictPolicy: "fail-closed" | "retry-safe-field-patch"
  ) {
    const deckId = String(command.deckId || "").trim();
    const matchupId = String(command.matchupId || "").trim();

    if (!deckId || !matchupId) {
      throw userFacingActionError("Deck and matchup ids are required.");
    }

    const maxAttempts = conflictPolicy === "retry-safe-field-patch" ? 2 : 1;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
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

      const currentFields = currentMatchup as Record<string, unknown>;
      const mergedCommand: UpdateDeckMatchupCommand = {
        deckId,
        matchupId,
        deckName: String(command.fields.deckName ?? currentFields.deckName ?? ""),
        format: String(command.fields.format ?? currentFields.format ?? ""),
        goPreference: (command.fields.goPreference ??
          currentFields.goPreference ??
          "") as GoPreference,
        idealBench: String(command.fields.idealBench ?? currentFields.idealBench ?? ""),
        matchupFavor: String(command.fields.matchupFavor ?? currentFields.matchupFavor ?? ""),
        matchupPlan: String(command.fields.matchupPlan ?? currentFields.matchupPlan ?? ""),
        matchupSprites:
          command.fields.matchupSprites ??
          (Array.isArray(currentFields.deckPokemon)
            ? currentFields.deckPokemon.map((value) => String(value || ""))
            : []),
        techsNeeded: String(command.fields.techsNeeded ?? currentFields.techsNeeded ?? "")
      };
      const { deckName, format, matchupSprites } = getRequiredMatchupFields(mergedCommand);
      const timestamp = now();
      const nextMatchup = {
        ...currentFields,
        deckName,
        deckPokemon: matchupSprites,
        format,
        goPreference: mergedCommand.goPreference,
        matchupFavor: String(mergedCommand.matchupFavor || "").trim(),
        idealBench: String(mergedCommand.idealBench || ""),
        techsNeeded: String(mergedCommand.techsNeeded || ""),
        matchupPlan: String(mergedCommand.matchupPlan || ""),
        updatedAt: timestamp
      };
      const commitResult = await adapter.commit({
        child: nextMatchup,
        deckId,
        expectedChildUpdatedAt: getJsonTimestamp(currentFields, "updatedAt", "updated_at"),
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
        if (attempt + 1 < maxAttempts) {
          continue;
        }
        throw userFacingActionError(
          "This matchup changed in another tab. Refresh the page and try again."
        );
      }

      return {
        deckId,
        matchupId
      };
    }

    throw new Error("Unreachable matchup update state.");
  }

  async function updateMatchupFields(command: UpdateDeckMatchupFieldsCommand) {
    const fields = command.scope === "plan"
      ? {
          idealBench: command.fields.idealBench,
          matchupPlan: command.fields.matchupPlan,
          techsNeeded: command.fields.techsNeeded
        }
      : {
          format: command.fields.format,
          goPreference: command.fields.goPreference,
          matchupFavor: command.fields.matchupFavor
        };

    return commitMatchupUpdate({
      deckId: command.deckId,
      fields,
      matchupId: command.matchupId
    }, "retry-safe-field-patch");
  }

  async function updateMatchup(command: UpdateDeckMatchupCommand) {
    return commitMatchupUpdate({
      deckId: command.deckId,
      fields: {
        deckName: command.deckName,
        format: command.format,
        goPreference: command.goPreference,
        idealBench: command.idealBench,
        matchupFavor: command.matchupFavor,
        matchupPlan: command.matchupPlan,
        matchupSprites: command.matchupSprites,
        techsNeeded: command.techsNeeded
      },
      matchupId: command.matchupId
    }, "fail-closed");
  }

  return {
    createMatchup,
    saveList,
    updateMatchup,
    updateMatchupFields
  };
}

export function createSupabaseDeckAggregateWriteAdapter(input: {
  supabase: SupabaseClient;
  userId: string;
}): DeckAggregateWriteAdapter {
  const { supabase, userId } = input;

  async function commitLegacy(
    plan: DeckListCommitPlan | DeckAggregateCommitPlan
  ): Promise<DeckAggregateCommitResult> {
    const expectedChildUpdatedAt = plan.expectedChildUpdatedAt;
    if (plan.operation === "update" && !expectedChildUpdatedAt?.trim()) {
      return "conflict";
    }

    const { data, error } = await supabase.rpc("commit_deck_aggregate_child", {
      p_child: asJson(plan.child),
      p_deck_id: plan.deckId as string,
      p_expected_child_updated_at: expectedChildUpdatedAt ?? "",
      p_kind: "kind" in plan ? plan.kind : "deck-list",
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
  }

  return {
    async commitDeckList(plan: DeckListCommitPlan) {
      const { data, error } = await supabase.rpc("commit_first_class_deck_list", {
        p_creation_key: plan.creationKey,
        p_deck_id: plan.deckId,
        p_expected_updated_at: plan.expectedChildUpdatedAt,
        p_operation: plan.operation,
        p_payload: asJson({
          ...plan.child,
          ...(plan.legacySourceDeckId
            ? { _legacySourceDeckId: plan.legacySourceDeckId }
            : {})
        }),
        p_updated_at: plan.updatedAt
      });

      if (error) {
        if (isDeckListStaleVersionError(error)) {
          throw userFacingActionError(getDeckListStaleVersionMessage(error), {
            code: "DECK_LIST_STALE_VERSION"
          });
        }

        throw error;
      }

      const result = data as {
        deckList?: { deck_id?: string | null; id?: string };
        status?: "committed" | "idempotent";
      } | null;
      const deckListId = String(result?.deckList?.id || "").trim();
      if (!deckListId || (result?.status !== "committed" && result?.status !== "idempotent")) {
        throw new Error("First-class Deck List commit returned an unexpected status.");
      }

      return {
        deckId: result?.deckList?.deck_id ?? plan.deckId,
        deckListId,
        status: result.status
      } satisfies DeckListCommitResult;
    },

    async commit(plan) {
      return commitLegacy(plan);
    },

    async loadDeckList({ deckId, deckListId }) {
      function mapLegacyList(value: unknown, sourceDeckId: string): DeckList | null {
        if (!value || typeof value !== "object") {
          return null;
        }

        const legacy = value as Record<string, unknown>;
        const parsedCards = (Array.isArray(legacy.parsedCards)
          ? legacy.parsedCards
          : Array.isArray(legacy.parsed_cards)
            ? legacy.parsed_cards
            : []) as DeckCard[];
        const sortedCards = (Array.isArray(legacy.sortedCards)
          ? legacy.sortedCards
          : Array.isArray(legacy.sorted_cards)
            ? legacy.sorted_cards
            : []) as DeckCard[];
        return {
          createdAt: String(legacy.createdAt || legacy.created_at || ""),
          createdBy: String(legacy.createdBy || legacy.created_by || ""),
          date: String(legacy.date || ""),
          deckId: sourceDeckId,
          format: String(legacy.format || ""),
          id: deckListId,
          name: String(legacy.name || ""),
          notes: String(legacy.notes || ""),
          parsedCards,
          rawList: String(legacy.rawList || legacy.raw_list || ""),
          sortedCards: getReadSortedDeckCards({
            parsedCards,
            sortedCards,
            sortedCardsVersion:
              typeof legacy.sortedCardsVersion === "number"
                ? legacy.sortedCardsVersion
                : typeof legacy.sorted_cards_version === "number"
                  ? legacy.sorted_cards_version
                  : undefined
          }),
          sortedCardsVersion:
            typeof legacy.sortedCardsVersion === "number"
              ? legacy.sortedCardsVersion
              : typeof legacy.sorted_cards_version === "number"
                ? legacy.sorted_cards_version
                : undefined,
          storage: "legacy",
          updatedAt: String(legacy.updatedAt || legacy.updated_at || "")
        } satisfies DeckList;
      }

      const query = supabase
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
        .eq("id", deckListId);

      const { data, error } = await query.maybeSingle();
      if (error) {
        throw error;
      }

      const { data: targetDeck, error: targetDeckError } = deckId
        ? await supabase
            .from("decks")
            .select("id,deck_lists")
            .eq("user_id", userId)
            .eq("id", deckId)
            .maybeSingle()
        : { data: null, error: null };
      if (targetDeckError) {
        throw targetDeckError;
      }

      const legacyCandidates = deckId && targetDeck
        ? (Array.isArray(targetDeck.deck_lists) ? targetDeck.deck_lists : [])
            .filter(
              (entry) =>
                entry &&
                typeof entry === "object" &&
                String((entry as { id?: unknown }).id || "") === deckListId
            )
            .map((entry) => mapLegacyList(entry, deckId))
            .filter((entry): entry is DeckList => entry !== null)
        : [];

      if (!data) {
        if (!deckId) {
          return null;
        }
        return legacyCandidates.length === 1 ? legacyCandidates[0] : null;
      }

      if (legacyCandidates.length > 1) {
        return null;
      }

      if (legacyCandidates.length === 1) {
        return legacyCandidates[0];
      }

      const row = data as unknown as {
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
      };

      const parsedCards = (Array.isArray(row.parsed_cards) ? row.parsed_cards : []) as DeckCard[];
      const sortedCards = (Array.isArray(row.sorted_cards) ? row.sorted_cards : []) as DeckCard[];
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
        sortedCards: getReadSortedDeckCards({
          parsedCards,
          sortedCards,
          sortedCardsVersion: row.sorted_cards_version ?? undefined
        }),
        sortedCardsVersion: row.sorted_cards_version ?? undefined,
        storage: "relational",
        updatedAt: row.updated_at
      } satisfies DeckList;
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
