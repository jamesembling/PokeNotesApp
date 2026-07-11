import type { DeckList, DeckMatchup } from "@/types/index";

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

export function resolveDeckListsDuringCompatibility(
  legacyDeckLists: DeckList[],
  relationalDeckLists?: DeckList[]
) {
  return resolveRecordsDuringCompatibility(legacyDeckLists, relationalDeckLists);
}

export function resolveDeckMatchupsDuringCompatibility(
  legacyMatchups: DeckMatchup[],
  relationalMatchups?: DeckMatchup[]
) {
  return resolveRecordsDuringCompatibility(legacyMatchups, relationalMatchups);
}
