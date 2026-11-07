import type { DeckList, DeckMatchup } from "@/types/index";
import { getReadSortedDeckCards } from "@/lib/deck-lists/read-sort";

type DeckAggregateRecord = {
  id: string;
};

function haveMatchingRecordSets<T extends DeckAggregateRecord>(
  legacyRecords: T[],
  relationalRecords: T[]
) {
  const legacyIds = new Set(legacyRecords.map((record) => record.id));
  const relationalIds = new Set(relationalRecords.map((record) => record.id));

  return (
    legacyIds.size === legacyRecords.length &&
    relationalIds.size === relationalRecords.length &&
    legacyIds.size === relationalIds.size &&
    [...legacyIds].every((id) => relationalIds.has(id))
  );
}

function resolveRecordsDuringCompatibility<T extends DeckAggregateRecord>(
  legacyRecords: T[],
  relationalRecords?: T[]
) {
  if (!relationalRecords || relationalRecords.length === 0) {
    return [...legacyRecords];
  }

  // Preserve the established relational order for fully migrated aggregates.
  if (haveMatchingRecordSets(legacyRecords, relationalRecords)) {
    return [...relationalRecords];
  }

  const relationalById = new Map(
    relationalRecords.map((record) => [record.id, record] as const)
  );
  const legacyIds = new Set(legacyRecords.map((record) => record.id));

  return [
    ...legacyRecords.map((record) => relationalById.get(record.id) ?? record),
    ...relationalRecords.filter((record) => !legacyIds.has(record.id))
  ];
}

/**
 * Accepts full Deck Lists or narrower `{ id, ... }` projections (for example
 * selection options) so option reads apply the same precedence and ordering
 * without loading card payloads.
 */
export function resolveDeckListsDuringCompatibility<T extends DeckAggregateRecord = DeckList>(
  legacyDeckLists: T[],
  relationalDeckLists?: T[]
) {
  return resolveRecordsDuringCompatibility(legacyDeckLists, relationalDeckLists);
}

export function resolveDeckMatchupsDuringCompatibility(
  legacyMatchups: DeckMatchup[],
  relationalMatchups?: DeckMatchup[]
) {
  return resolveRecordsDuringCompatibility(legacyMatchups, relationalMatchups);
}

export type DeckAggregateCompatibilityRead = {
  deckLists: DeckList[];
  matchups: DeckMatchup[];
};

/**
 * The single compatibility read boundary for a Deck Aggregate. It owns
 * relational precedence, legacy preservation, established ordering, and the
 * canonical visual-card hydration required by every aggregate caller.
 */
export function resolveDeckAggregateCompatibilityRead(args: {
  legacyDeckLists: DeckList[];
  legacyMatchups?: DeckMatchup[];
  relationalDeckLists?: DeckList[];
  relationalMatchups?: DeckMatchup[];
}): DeckAggregateCompatibilityRead {
  const deckLists = resolveRecordsDuringCompatibility(
    args.legacyDeckLists,
    args.relationalDeckLists
  ).map((deckList) => ({
    ...deckList,
    sortedCards: getReadSortedDeckCards(deckList)
  }));

  return {
    deckLists,
    matchups: resolveRecordsDuringCompatibility(
      args.legacyMatchups ?? [],
      args.relationalMatchups
    )
  };
}
