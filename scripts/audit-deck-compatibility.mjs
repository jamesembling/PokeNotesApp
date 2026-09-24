#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { parse as parseDotenv } from "dotenv";

const DEFAULT_PAGE_SIZE = 500;

export const DECK_COMPATIBILITY_COUNT_KEYS = [
  "decksAudited",
  "invalidDeckIdCount",
  "duplicateDeckIdCount",
  "invalidLegacyListContainerDeckCount",
  "legacyListRecordCount",
  "relationalListRecordCount",
  "standaloneListRecordCount",
  "standaloneListInvalidIdentityCount",
  "standaloneListDuplicateIdentityCount",
  "standaloneListLegacyCopyCount",
  "decksWithListCountMismatch",
  "legacyListInvalidIdCount",
  "legacyListDuplicateCompositeCount",
  "legacyListCrossParentIdReuseCount",
  "relationalListInvalidIdCount",
  "relationalListDuplicateCompositeCount",
  "relationalListCrossParentIdReuseCount",
  "relationalListOrphanCount",
  "relationalListOwnerMismatchCount",
  "legacyOnlyListCompositeCount",
  "legacyOnlyListIdAtDifferentParentCount",
  "legacyOnlyListGlobalIdAbsentCount",
  "relationalOnlyListCompositeCount",
  "relationalOnlyListIdAtDifferentParentCount",
  "relationalOnlyListGlobalIdAbsentCount",
  "overlappingListCompositeCount",
  "overlappingListScalarMismatchCount",
  "overlappingListOrderMismatchCount",
  "overlappingListParsedCardsMismatchCount",
  "overlappingListSortedCardsMismatchCount",
  "invalidLegacyMatchupContainerDeckCount",
  "legacyMatchupRecordCount",
  "relationalMatchupRecordCount",
  "decksWithMatchupCountMismatch",
  "legacyMatchupInvalidIdCount",
  "legacyMatchupDuplicateCompositeCount",
  "legacyMatchupCrossParentIdReuseCount",
  "relationalMatchupInvalidIdCount",
  "relationalMatchupDuplicateCompositeCount",
  "relationalMatchupCrossParentIdReuseCount",
  "relationalMatchupOrphanCount",
  "relationalMatchupOwnerMismatchCount",
  "legacyOnlyMatchupCompositeCount",
  "legacyOnlyMatchupIdAtDifferentParentCount",
  "legacyOnlyMatchupGlobalIdAbsentCount",
  "relationalOnlyMatchupCompositeCount",
  "relationalOnlyMatchupIdAtDifferentParentCount",
  "relationalOnlyMatchupGlobalIdAbsentCount",
  "overlappingMatchupCompositeCount",
  "overlappingMatchupScalarMismatchCount",
  "overlappingMatchupOrderMismatchCount",
  "overlappingMatchupPokemonMismatchCount"
];

const LIST_ISSUE_COUNT_KEYS = [
  "standaloneListInvalidIdentityCount",
  "standaloneListDuplicateIdentityCount",
  "standaloneListLegacyCopyCount",
  "invalidLegacyListContainerDeckCount",
  "decksWithListCountMismatch",
  "legacyListInvalidIdCount",
  "legacyListDuplicateCompositeCount",
  "legacyListCrossParentIdReuseCount",
  "relationalListInvalidIdCount",
  "relationalListDuplicateCompositeCount",
  "relationalListCrossParentIdReuseCount",
  "relationalListOrphanCount",
  "relationalListOwnerMismatchCount",
  "legacyOnlyListCompositeCount",
  "relationalOnlyListCompositeCount",
  "overlappingListScalarMismatchCount",
  "overlappingListOrderMismatchCount",
  "overlappingListParsedCardsMismatchCount",
  "overlappingListSortedCardsMismatchCount"
];

const MATCHUP_ISSUE_COUNT_KEYS = [
  "invalidLegacyMatchupContainerDeckCount",
  "decksWithMatchupCountMismatch",
  "legacyMatchupInvalidIdCount",
  "legacyMatchupDuplicateCompositeCount",
  "legacyMatchupCrossParentIdReuseCount",
  "relationalMatchupInvalidIdCount",
  "relationalMatchupDuplicateCompositeCount",
  "relationalMatchupCrossParentIdReuseCount",
  "relationalMatchupOrphanCount",
  "relationalMatchupOwnerMismatchCount",
  "legacyOnlyMatchupCompositeCount",
  "relationalOnlyMatchupCompositeCount",
  "overlappingMatchupScalarMismatchCount",
  "overlappingMatchupOrderMismatchCount",
  "overlappingMatchupPokemonMismatchCount"
];

const ISSUE_COUNT_KEYS = [
  "invalidDeckIdCount",
  "duplicateDeckIdCount",
  ...LIST_ISSUE_COUNT_KEYS,
  ...MATCHUP_ISSUE_COUNT_KEYS
];

function emptyCounts() {
  return Object.fromEntries(DECK_COMPATIBILITY_COUNT_KEYS.map((key) => [key, 0]));
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function asText(value) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

function asIdentifier(value) {
  return asText(value).trim();
}

function asNullableNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asTimestamp(value) {
  const text = asText(value);
  const timestamp = Date.parse(text);
  return text && Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : text;
}

function canonicalizeJson(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalizeJson(entry));
  }

  const record = asRecord(value);
  if (record) {
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .filter((key) => record[key] !== undefined)
        .map((key) => [key, canonicalizeJson(record[key])])
    );
  }

  return value === undefined ? null : value;
}

function jsonValuesMatch(left, right) {
  return JSON.stringify(canonicalizeJson(left)) === JSON.stringify(canonicalizeJson(right));
}

function compositeKey(deckId, recordId) {
  return JSON.stringify([deckId, recordId]);
}

function legacyDeckList(entry, deckId, position) {
  const record = asRecord(entry);
  if (!record) {
    return null;
  }

  const id = asIdentifier(record.id);
  if (!id) {
    return null;
  }

  return {
    deckId,
    id,
    key: compositeKey(deckId, id),
    parsedCards: firstDefined(record.parsedCards, record.parsed_cards, []),
    scalars: {
      createdAt: asTimestamp(firstDefined(record.createdAt, record.created_at)),
      createdBy: asText(firstDefined(record.createdBy, record.created_by)),
      date: asText(record.date),
      format: asText(record.format),
      name: asText(record.name),
      notes: asText(record.notes),
      position,
      rawList: asText(firstDefined(record.rawList, record.raw_list)),
      sortedCardsVersion: asNullableNumber(
        firstDefined(record.sortedCardsVersion, record.sorted_cards_version)
      ),
      updatedAt: asTimestamp(firstDefined(record.updatedAt, record.updated_at))
    },
    sortedCards: firstDefined(record.sortedCards, record.sorted_cards, [])
  };
}

function relationalDeckList(row) {
  const record = asRecord(row);
  if (!record) {
    return null;
  }

  const deckId = asIdentifier(record.deck_id);
  const id = asIdentifier(record.id);
  if (!deckId || !id) {
    return null;
  }

  return {
    deckId,
    id,
    key: compositeKey(deckId, id),
    parsedCards: firstDefined(record.parsed_cards, []),
    scalars: {
      createdAt: asTimestamp(record.created_at),
      createdBy: asText(record.created_by),
      date: asText(record.date),
      format: asText(record.format),
      name: asText(record.name),
      notes: asText(record.notes),
      position: Number.isInteger(record.position) ? record.position : 0,
      rawList: asText(record.raw_list),
      sortedCardsVersion: asNullableNumber(record.sorted_cards_version),
      updatedAt: asTimestamp(record.updated_at)
    },
    sortedCards: firstDefined(record.sorted_cards, []),
    userId: asIdentifier(record.user_id)
  };
}

function legacyDeckMatchup(entry, deckId, position) {
  const record = asRecord(entry);
  if (!record) {
    return null;
  }

  const id = asIdentifier(record.id);
  if (!id) {
    return null;
  }

  return {
    deckId,
    deckPokemon: firstDefined(record.deckPokemon, record.deck_pokemon, []),
    id,
    key: compositeKey(deckId, id),
    scalars: {
      createdAt: asTimestamp(firstDefined(record.createdAt, record.created_at)),
      deckName: asText(firstDefined(record.deckName, record.deck_name)),
      format: asText(record.format),
      goPreference: asText(firstDefined(record.goPreference, record.go_preference)),
      idealBench: asText(firstDefined(record.idealBench, record.ideal_bench)),
      matchupFavor: asText(firstDefined(record.matchupFavor, record.matchup_favor)),
      matchupPlan: asText(firstDefined(record.matchupPlan, record.matchup_plan)),
      position,
      techsNeeded: asText(firstDefined(record.techsNeeded, record.techs_needed)),
      updatedAt: asTimestamp(firstDefined(record.updatedAt, record.updated_at))
    }
  };
}

function relationalDeckMatchup(row) {
  const record = asRecord(row);
  if (!record) {
    return null;
  }

  const deckId = asIdentifier(record.deck_id);
  const id = asIdentifier(record.id);
  if (!deckId || !id) {
    return null;
  }

  return {
    deckId,
    deckPokemon: firstDefined(record.deck_pokemon, []),
    id,
    key: compositeKey(deckId, id),
    scalars: {
      createdAt: asTimestamp(record.created_at),
      deckName: asText(record.deck_name),
      format: asText(record.format),
      goPreference: asText(record.go_preference),
      idealBench: asText(record.ideal_bench),
      matchupFavor: asText(record.matchup_favor),
      matchupPlan: asText(record.matchup_plan),
      position: Number.isInteger(record.position) ? record.position : 0,
      techsNeeded: asText(record.techs_needed),
      updatedAt: asTimestamp(record.updated_at)
    },
    userId: asIdentifier(record.user_id)
  };
}

function indexUniqueRecords(records, duplicateCountKey, counts) {
  const byKey = new Map();

  for (const record of records) {
    if (byKey.has(record.key)) {
      counts[duplicateCountKey] += 1;
      continue;
    }
    byKey.set(record.key, record);
  }

  return byKey;
}

function countCrossParentIdReuses(records) {
  const firstParentById = new Map();
  let reuseCount = 0;

  for (const record of records) {
    const firstParent = firstParentById.get(record.id);
    if (firstParent === undefined) {
      firstParentById.set(record.id, record.deckId);
    } else if (firstParent !== record.deckId) {
      reuseCount += 1;
    }
  }

  return reuseCount;
}

function recordIds(recordsByKey) {
  return new Set(Array.from(recordsByKey.values(), (record) => record.id));
}

function compareRecordIndexes({
  counts,
  legacyByKey,
  legacyOnlyCountKey,
  overlapCountKey,
  relationalByKey,
  relationalOnlyCountKey,
  legacyIdAtDifferentParentCountKey,
  legacyGlobalIdAbsentCountKey,
  relationalIdAtDifferentParentCountKey,
  relationalGlobalIdAbsentCountKey,
  compareOverlap
}) {
  const legacyIds = recordIds(legacyByKey);
  const relationalIds = recordIds(relationalByKey);

  for (const [key, legacyRecord] of legacyByKey) {
    const relationalRecord = relationalByKey.get(key);
    if (!relationalRecord) {
      counts[legacyOnlyCountKey] += 1;
      if (relationalIds.has(legacyRecord.id)) {
        counts[legacyIdAtDifferentParentCountKey] += 1;
      } else {
        counts[legacyGlobalIdAbsentCountKey] += 1;
      }
      continue;
    }

    counts[overlapCountKey] += 1;
    compareOverlap(legacyRecord, relationalRecord);
  }

  for (const [key, relationalRecord] of relationalByKey) {
    if (!legacyByKey.has(key)) {
      counts[relationalOnlyCountKey] += 1;
      if (legacyIds.has(relationalRecord.id)) {
        counts[relationalIdAtDifferentParentCountKey] += 1;
      } else {
        counts[relationalGlobalIdAbsentCountKey] += 1;
      }
    }
  }
}

function scalarFieldsMatchIgnoringVersionAndOrdinal(left, right) {
  // updatedAt is a version token rather than content: set_updated_at assigns
  // the relational row its own timestamp while the RPC updates both stores.
  // position is a storage ordinal, so compare the visible order separately.
  const comparable = (scalars) => Object.fromEntries(
    Object.entries(scalars).filter(([key]) => key !== "updatedAt" && key !== "position")
  );
  return jsonValuesMatch(comparable(left), comparable(right));
}

function countOrderingMismatches(legacyRecords, relationalRecords, createdAtDirection) {
  const legacyByDeck = new Map();
  const relationalByDeck = new Map();
  for (const record of legacyRecords) {
    const records = legacyByDeck.get(record.deckId) ?? [];
    records.push(record);
    legacyByDeck.set(record.deckId, records);
  }
  for (const record of relationalRecords) {
    const records = relationalByDeck.get(record.deckId) ?? [];
    records.push(record);
    relationalByDeck.set(record.deckId, records);
  }

  let mismatchCount = 0;
  for (const deckId of new Set([...legacyByDeck.keys(), ...relationalByDeck.keys()])) {
    const legacy = legacyByDeck.get(deckId) ?? [];
    const relational = relationalByDeck.get(deckId) ?? [];
    if (legacy.length !== relational.length) {
      continue; // Missing and extra records already have dedicated blocking counts.
    }

    const legacyKeys = new Set(legacy.map((record) => record.key));
    if (relational.some((record) => !legacyKeys.has(record.key))) {
      continue; // Identity gaps are already reported by the compatibility comparison.
    }

    const orderedLegacy = [...legacy].sort((left, right) => left.scalars.position - right.scalars.position);
    const orderedRelational = [...relational].sort((left, right) => {
      const position = left.scalars.position - right.scalars.position;
      if (position !== 0) {
        return position;
      }
      const createdAt = left.scalars.createdAt.localeCompare(right.scalars.createdAt) * createdAtDirection;
      return createdAt || left.id.localeCompare(right.id);
    });
    const hasAmbiguousOrder = orderedRelational.some((record, index) => {
      const previous = orderedRelational[index - 1];
      return previous && previous.scalars.position === record.scalars.position &&
        previous.scalars.createdAt === record.scalars.createdAt;
    });
    if (hasAmbiguousOrder || orderedLegacy.some((record, index) => record.key !== orderedRelational[index].key)) {
      mismatchCount += 1;
    }
  }
  return mismatchCount;
}

export function aggregateDeckCompatibility({ decks = [], deckLists = [], deckMatchups = [] }) {
  const counts = emptyCounts();
  const deckById = new Map();
  const legacyLists = [];
  const legacyMatchups = [];
  const legacyListCountByDeck = new Map();
  const legacyMatchupCountByDeck = new Map();
  const standaloneListIdentities = new Set();
  const standaloneListDuplicateIdentities = new Set();

  counts.decksAudited = decks.length;
  counts.relationalListRecordCount = deckLists.length;
  counts.relationalMatchupRecordCount = deckMatchups.length;

  for (const rawDeck of decks) {
    const deck = asRecord(rawDeck);
    const deckId = asIdentifier(deck?.id);
    if (!deckId) {
      counts.invalidDeckIdCount += 1;
      continue;
    }
    if (deckById.has(deckId)) {
      counts.duplicateDeckIdCount += 1;
      continue;
    }

    deckById.set(deckId, {
      id: deckId,
      userId: asIdentifier(deck?.user_id)
    });

    const rawLists = deck?.deck_lists;
    const listEntries = Array.isArray(rawLists) ? rawLists : [];
    if (!Array.isArray(rawLists)) {
      counts.invalidLegacyListContainerDeckCount += 1;
    }
    counts.legacyListRecordCount += listEntries.length;
    legacyListCountByDeck.set(deckId, listEntries.length);
    listEntries.forEach((entry, position) => {
      const parsed = legacyDeckList(entry, deckId, position);
      if (parsed) {
        legacyLists.push(parsed);
      } else {
        counts.legacyListInvalidIdCount += 1;
      }
    });

    const rawMatchups = deck?.matchups;
    const matchupEntries = Array.isArray(rawMatchups) ? rawMatchups : [];
    if (!Array.isArray(rawMatchups)) {
      counts.invalidLegacyMatchupContainerDeckCount += 1;
    }
    counts.legacyMatchupRecordCount += matchupEntries.length;
    legacyMatchupCountByDeck.set(deckId, matchupEntries.length);
    matchupEntries.forEach((entry, position) => {
      const parsed = legacyDeckMatchup(entry, deckId, position);
      if (parsed) {
        legacyMatchups.push(parsed);
      } else {
        counts.legacyMatchupInvalidIdCount += 1;
      }
    });
  }

  const relationalLists = [];
  const relationalListCountByDeck = new Map();
  for (const row of deckLists) {
    if (!asIdentifier(asRecord(row)?.deck_id)) {
      counts.standaloneListRecordCount += 1;
      const userId = asIdentifier(asRecord(row)?.user_id);
      const id = asIdentifier(asRecord(row)?.id);
      if (!userId || !id) {
        counts.standaloneListInvalidIdentityCount += 1;
        continue;
      }
      const identity = JSON.stringify([userId, id]);
      if (standaloneListIdentities.has(identity) && !standaloneListDuplicateIdentities.has(identity)) {
        standaloneListDuplicateIdentities.add(identity);
        counts.standaloneListDuplicateIdentityCount += 1;
      }
      standaloneListIdentities.add(identity);
      continue;
    }
    const parsed = relationalDeckList(row);
    if (!parsed) {
      counts.relationalListInvalidIdCount += 1;
      continue;
    }
    relationalLists.push(parsed);
    relationalListCountByDeck.set(
      parsed.deckId,
      (relationalListCountByDeck.get(parsed.deckId) ?? 0) + 1
    );
    const parent = deckById.get(parsed.deckId);
    if (!parent) {
      counts.relationalListOrphanCount += 1;
    } else if (parent.userId !== parsed.userId) {
      counts.relationalListOwnerMismatchCount += 1;
    }
  }

  for (const record of legacyLists) {
    const ownerId = deckById.get(record.deckId)?.userId;
    if (ownerId && standaloneListIdentities.has(JSON.stringify([ownerId, record.id]))) {
      counts.standaloneListLegacyCopyCount += 1;
    }
  }

  const relationalMatchups = [];
  const relationalMatchupCountByDeck = new Map();
  for (const row of deckMatchups) {
    const parsed = relationalDeckMatchup(row);
    if (!parsed) {
      counts.relationalMatchupInvalidIdCount += 1;
      continue;
    }
    relationalMatchups.push(parsed);
    relationalMatchupCountByDeck.set(
      parsed.deckId,
      (relationalMatchupCountByDeck.get(parsed.deckId) ?? 0) + 1
    );
    const parent = deckById.get(parsed.deckId);
    if (!parent) {
      counts.relationalMatchupOrphanCount += 1;
    } else if (parent.userId !== parsed.userId) {
      counts.relationalMatchupOwnerMismatchCount += 1;
    }
  }

  for (const deckId of deckById.keys()) {
    if ((legacyListCountByDeck.get(deckId) ?? 0) !== (relationalListCountByDeck.get(deckId) ?? 0)) {
      counts.decksWithListCountMismatch += 1;
    }
    if (
      (legacyMatchupCountByDeck.get(deckId) ?? 0) !==
      (relationalMatchupCountByDeck.get(deckId) ?? 0)
    ) {
      counts.decksWithMatchupCountMismatch += 1;
    }
  }

  const legacyListsByKey = indexUniqueRecords(
    legacyLists,
    "legacyListDuplicateCompositeCount",
    counts
  );
  const relationalListsByKey = indexUniqueRecords(
    relationalLists,
    "relationalListDuplicateCompositeCount",
    counts
  );
  counts.legacyListCrossParentIdReuseCount = countCrossParentIdReuses(legacyListsByKey.values());
  counts.relationalListCrossParentIdReuseCount = countCrossParentIdReuses(
    relationalListsByKey.values()
  );
  compareRecordIndexes({
    counts,
    legacyByKey: legacyListsByKey,
    legacyOnlyCountKey: "legacyOnlyListCompositeCount",
    overlapCountKey: "overlappingListCompositeCount",
    relationalByKey: relationalListsByKey,
    relationalOnlyCountKey: "relationalOnlyListCompositeCount",
    legacyIdAtDifferentParentCountKey: "legacyOnlyListIdAtDifferentParentCount",
    legacyGlobalIdAbsentCountKey: "legacyOnlyListGlobalIdAbsentCount",
    relationalIdAtDifferentParentCountKey: "relationalOnlyListIdAtDifferentParentCount",
    relationalGlobalIdAbsentCountKey: "relationalOnlyListGlobalIdAbsentCount",
    compareOverlap(legacyRecord, relationalRecord) {
      if (!scalarFieldsMatchIgnoringVersionAndOrdinal(legacyRecord.scalars, relationalRecord.scalars)) {
        counts.overlappingListScalarMismatchCount += 1;
      }
      if (!jsonValuesMatch(legacyRecord.parsedCards, relationalRecord.parsedCards)) {
        counts.overlappingListParsedCardsMismatchCount += 1;
      }
      if (!jsonValuesMatch(legacyRecord.sortedCards, relationalRecord.sortedCards)) {
        counts.overlappingListSortedCardsMismatchCount += 1;
      }
    }
  });
  counts.overlappingListOrderMismatchCount = countOrderingMismatches(
    legacyLists,
    relationalLists,
    -1
  );

  const legacyMatchupsByKey = indexUniqueRecords(
    legacyMatchups,
    "legacyMatchupDuplicateCompositeCount",
    counts
  );
  const relationalMatchupsByKey = indexUniqueRecords(
    relationalMatchups,
    "relationalMatchupDuplicateCompositeCount",
    counts
  );
  counts.legacyMatchupCrossParentIdReuseCount = countCrossParentIdReuses(
    legacyMatchupsByKey.values()
  );
  counts.relationalMatchupCrossParentIdReuseCount = countCrossParentIdReuses(
    relationalMatchupsByKey.values()
  );
  compareRecordIndexes({
    counts,
    legacyByKey: legacyMatchupsByKey,
    legacyOnlyCountKey: "legacyOnlyMatchupCompositeCount",
    overlapCountKey: "overlappingMatchupCompositeCount",
    relationalByKey: relationalMatchupsByKey,
    relationalOnlyCountKey: "relationalOnlyMatchupCompositeCount",
    legacyIdAtDifferentParentCountKey: "legacyOnlyMatchupIdAtDifferentParentCount",
    legacyGlobalIdAbsentCountKey: "legacyOnlyMatchupGlobalIdAbsentCount",
    relationalIdAtDifferentParentCountKey: "relationalOnlyMatchupIdAtDifferentParentCount",
    relationalGlobalIdAbsentCountKey: "relationalOnlyMatchupGlobalIdAbsentCount",
    compareOverlap(legacyRecord, relationalRecord) {
      if (!scalarFieldsMatchIgnoringVersionAndOrdinal(legacyRecord.scalars, relationalRecord.scalars)) {
        counts.overlappingMatchupScalarMismatchCount += 1;
      }
      if (!jsonValuesMatch(legacyRecord.deckPokemon, relationalRecord.deckPokemon)) {
        counts.overlappingMatchupPokemonMismatchCount += 1;
      }
    }
  });
  counts.overlappingMatchupOrderMismatchCount = countOrderingMismatches(
    legacyMatchups,
    relationalMatchups,
    1
  );

  return counts;
}

function reasonWithCount(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}.`;
}

export function buildDeckCompatibilityReport(countsInput) {
  const counts = Object.fromEntries(
    DECK_COMPATIBILITY_COUNT_KEYS.map((key) => [
      key,
      Number.isSafeInteger(countsInput?.[key]) && countsInput[key] >= 0 ? countsInput[key] : 0
    ])
  );
  const reasons = [];

  if (counts.invalidDeckIdCount) {
    reasons.push(
      reasonWithCount(
        counts.invalidDeckIdCount,
        "deck record has an invalid ID",
        "deck records have invalid IDs"
      )
    );
  }
  if (counts.duplicateDeckIdCount) {
    reasons.push(
      reasonWithCount(
        counts.duplicateDeckIdCount,
        "deck record repeats an existing ID",
        "deck records repeat existing IDs"
      )
    );
  }
  if (counts.invalidLegacyListContainerDeckCount) {
    reasons.push(reasonWithCount(counts.invalidLegacyListContainerDeckCount, "deck has a malformed legacy list container", "decks have malformed legacy list containers"));
  }
  if (counts.standaloneListInvalidIdentityCount) {
    reasons.push(reasonWithCount(counts.standaloneListInvalidIdentityCount, "standalone Deck List has an invalid owner or ID", "standalone Deck Lists have an invalid owner or ID"));
  }
  if (counts.standaloneListDuplicateIdentityCount) {
    reasons.push(reasonWithCount(counts.standaloneListDuplicateIdentityCount, "standalone Deck List repeats an account-scoped identity", "standalone Deck Lists repeat account-scoped identities"));
  }
  if (counts.standaloneListLegacyCopyCount) {
    reasons.push(reasonWithCount(counts.standaloneListLegacyCopyCount, "standalone Deck List also appears in a legacy Deck Aggregate", "standalone Deck Lists also appear in legacy Deck Aggregates"));
  }
  if (counts.decksWithListCountMismatch) {
    reasons.push(reasonWithCount(counts.decksWithListCountMismatch, "deck has different legacy and relational list totals", "decks have different legacy and relational list totals"));
  }
  if (counts.legacyListInvalidIdCount || counts.legacyListDuplicateCompositeCount) {
    reasons.push(
      reasonWithCount(
        counts.legacyListInvalidIdCount + counts.legacyListDuplicateCompositeCount,
        "legacy list record has an invalid or duplicate same-parent identity",
        "legacy list records have invalid or duplicate same-parent identities"
      )
    );
  }
  if (counts.legacyListCrossParentIdReuseCount) {
    reasons.push(
      reasonWithCount(
        counts.legacyListCrossParentIdReuseCount,
        "legacy list ID reuse occurs across different parent decks",
        "legacy list ID reuses occur across different parent decks"
      )
    );
  }
  if (counts.relationalListInvalidIdCount || counts.relationalListDuplicateCompositeCount) {
    reasons.push(
      reasonWithCount(
        counts.relationalListInvalidIdCount + counts.relationalListDuplicateCompositeCount,
        "relational list record has an invalid or duplicate same-parent identity",
        "relational list records have invalid or duplicate same-parent identities"
      )
    );
  }
  if (counts.relationalListCrossParentIdReuseCount) {
    reasons.push(
      reasonWithCount(
        counts.relationalListCrossParentIdReuseCount,
        "relational list ID reuse occurs across different parent decks",
        "relational list ID reuses occur across different parent decks"
      )
    );
  }
  if (counts.relationalListOrphanCount) {
    reasons.push(reasonWithCount(counts.relationalListOrphanCount, "relational list record has no parent deck", "relational list records have no parent deck"));
  }
  if (counts.relationalListOwnerMismatchCount) {
    reasons.push(reasonWithCount(counts.relationalListOwnerMismatchCount, "relational list record has inconsistent ownership", "relational list records have inconsistent ownership"));
  }
  if (counts.legacyOnlyListCompositeCount) {
    reasons.push(
      reasonWithCount(
        counts.legacyOnlyListCompositeCount,
        "legacy list occurrence has no relational record under the same parent deck",
        "legacy list occurrences have no relational record under the same parent deck"
      )
    );
  }
  if (counts.legacyOnlyListIdAtDifferentParentCount) {
    reasons.push(
      reasonWithCount(
        counts.legacyOnlyListIdAtDifferentParentCount,
        "legacy list occurrence uses an ID found relationally under a different parent deck",
        "legacy list occurrences use IDs found relationally under different parent decks"
      )
    );
  }
  if (counts.legacyOnlyListGlobalIdAbsentCount) {
    reasons.push(
      reasonWithCount(
        counts.legacyOnlyListGlobalIdAbsentCount,
        "legacy list occurrence uses an ID absent from all relational list rows",
        "legacy list occurrences use IDs absent from all relational list rows"
      )
    );
  }
  if (counts.relationalOnlyListCompositeCount) {
    reasons.push(
      reasonWithCount(
        counts.relationalOnlyListCompositeCount,
        "relational list occurrence has no legacy record under the same parent deck",
        "relational list occurrences have no legacy record under the same parent deck"
      )
    );
  }
  if (counts.relationalOnlyListIdAtDifferentParentCount) {
    reasons.push(
      reasonWithCount(
        counts.relationalOnlyListIdAtDifferentParentCount,
        "relational list occurrence uses an ID found in legacy JSON under a different parent deck",
        "relational list occurrences use IDs found in legacy JSON under different parent decks"
      )
    );
  }
  if (counts.relationalOnlyListGlobalIdAbsentCount) {
    reasons.push(
      reasonWithCount(
        counts.relationalOnlyListGlobalIdAbsentCount,
        "relational list occurrence uses an ID absent from all legacy list records",
        "relational list occurrences use IDs absent from all legacy list records"
      )
    );
  }
  if (counts.overlappingListScalarMismatchCount) {
    reasons.push(reasonWithCount(counts.overlappingListScalarMismatchCount, "overlapping list record has different scalar fields", "overlapping list records have different scalar fields"));
  }
  if (counts.overlappingListOrderMismatchCount) {
    reasons.push(reasonWithCount(counts.overlappingListOrderMismatchCount, "deck has different Deck List ordering across compatibility stores", "decks have different Deck List ordering across compatibility stores"));
  }
  if (counts.overlappingListParsedCardsMismatchCount) {
    reasons.push(reasonWithCount(counts.overlappingListParsedCardsMismatchCount, "overlapping list record has different parsed-card data", "overlapping list records have different parsed-card data"));
  }
  if (counts.overlappingListSortedCardsMismatchCount) {
    reasons.push(reasonWithCount(counts.overlappingListSortedCardsMismatchCount, "overlapping list record has different sorted-card data", "overlapping list records have different sorted-card data"));
  }

  if (counts.invalidLegacyMatchupContainerDeckCount) {
    reasons.push(reasonWithCount(counts.invalidLegacyMatchupContainerDeckCount, "deck has a malformed legacy matchup container", "decks have malformed legacy matchup containers"));
  }
  if (counts.decksWithMatchupCountMismatch) {
    reasons.push(reasonWithCount(counts.decksWithMatchupCountMismatch, "deck has different legacy and relational matchup totals", "decks have different legacy and relational matchup totals"));
  }
  if (counts.legacyMatchupInvalidIdCount || counts.legacyMatchupDuplicateCompositeCount) {
    reasons.push(
      reasonWithCount(
        counts.legacyMatchupInvalidIdCount + counts.legacyMatchupDuplicateCompositeCount,
        "legacy matchup record has an invalid or duplicate same-parent identity",
        "legacy matchup records have invalid or duplicate same-parent identities"
      )
    );
  }
  if (counts.legacyMatchupCrossParentIdReuseCount) {
    reasons.push(
      reasonWithCount(
        counts.legacyMatchupCrossParentIdReuseCount,
        "legacy matchup ID reuse occurs across different parent decks",
        "legacy matchup ID reuses occur across different parent decks"
      )
    );
  }
  if (counts.relationalMatchupInvalidIdCount || counts.relationalMatchupDuplicateCompositeCount) {
    reasons.push(
      reasonWithCount(
        counts.relationalMatchupInvalidIdCount + counts.relationalMatchupDuplicateCompositeCount,
        "relational matchup record has an invalid or duplicate same-parent identity",
        "relational matchup records have invalid or duplicate same-parent identities"
      )
    );
  }
  if (counts.relationalMatchupCrossParentIdReuseCount) {
    reasons.push(
      reasonWithCount(
        counts.relationalMatchupCrossParentIdReuseCount,
        "relational matchup ID reuse occurs across different parent decks",
        "relational matchup ID reuses occur across different parent decks"
      )
    );
  }
  if (counts.relationalMatchupOrphanCount) {
    reasons.push(reasonWithCount(counts.relationalMatchupOrphanCount, "relational matchup record has no parent deck", "relational matchup records have no parent deck"));
  }
  if (counts.relationalMatchupOwnerMismatchCount) {
    reasons.push(reasonWithCount(counts.relationalMatchupOwnerMismatchCount, "relational matchup record has inconsistent ownership", "relational matchup records have inconsistent ownership"));
  }
  if (counts.legacyOnlyMatchupCompositeCount) {
    reasons.push(
      reasonWithCount(
        counts.legacyOnlyMatchupCompositeCount,
        "legacy matchup occurrence has no relational record under the same parent deck",
        "legacy matchup occurrences have no relational record under the same parent deck"
      )
    );
  }
  if (counts.legacyOnlyMatchupIdAtDifferentParentCount) {
    reasons.push(
      reasonWithCount(
        counts.legacyOnlyMatchupIdAtDifferentParentCount,
        "legacy matchup occurrence uses an ID found relationally under a different parent deck",
        "legacy matchup occurrences use IDs found relationally under different parent decks"
      )
    );
  }
  if (counts.legacyOnlyMatchupGlobalIdAbsentCount) {
    reasons.push(
      reasonWithCount(
        counts.legacyOnlyMatchupGlobalIdAbsentCount,
        "legacy matchup occurrence uses an ID absent from all relational matchup rows",
        "legacy matchup occurrences use IDs absent from all relational matchup rows"
      )
    );
  }
  if (counts.relationalOnlyMatchupCompositeCount) {
    reasons.push(
      reasonWithCount(
        counts.relationalOnlyMatchupCompositeCount,
        "relational matchup occurrence has no legacy record under the same parent deck",
        "relational matchup occurrences have no legacy record under the same parent deck"
      )
    );
  }
  if (counts.relationalOnlyMatchupIdAtDifferentParentCount) {
    reasons.push(
      reasonWithCount(
        counts.relationalOnlyMatchupIdAtDifferentParentCount,
        "relational matchup occurrence uses an ID found in legacy JSON under a different parent deck",
        "relational matchup occurrences use IDs found in legacy JSON under different parent decks"
      )
    );
  }
  if (counts.relationalOnlyMatchupGlobalIdAbsentCount) {
    reasons.push(
      reasonWithCount(
        counts.relationalOnlyMatchupGlobalIdAbsentCount,
        "relational matchup occurrence uses an ID absent from all legacy matchup records",
        "relational matchup occurrences use IDs absent from all legacy matchup records"
      )
    );
  }
  if (counts.overlappingMatchupScalarMismatchCount) {
    reasons.push(reasonWithCount(counts.overlappingMatchupScalarMismatchCount, "overlapping matchup record has different scalar fields", "overlapping matchup records have different scalar fields"));
  }
  if (counts.overlappingMatchupOrderMismatchCount) {
    reasons.push(reasonWithCount(counts.overlappingMatchupOrderMismatchCount, "deck has different Deck Matchup ordering across compatibility stores", "decks have different Deck Matchup ordering across compatibility stores"));
  }
  if (counts.overlappingMatchupPokemonMismatchCount) {
    reasons.push(reasonWithCount(counts.overlappingMatchupPokemonMismatchCount, "overlapping matchup record has different Pokemon data", "overlapping matchup records have different Pokemon data"));
  }

  const safeToCutOver = ISSUE_COUNT_KEYS.every((key) => counts[key] === 0);
  if (safeToCutOver) {
    reasons.push("No compatibility mismatches were detected.");
  }

  return {
    safeToCutOver,
    reasons,
    counts
  };
}

export function formatDeckCompatibilityReport(report) {
  const counts = Object.fromEntries(
    DECK_COMPATIBILITY_COUNT_KEYS.map((key) => [key, report.counts[key]])
  );
  return JSON.stringify(
    {
      safeToCutOver: report.safeToCutOver,
      reasons: [...report.reasons],
      counts
    },
    null,
    2
  );
}

export async function fetchAllPages(fetchPage, pageSize = DEFAULT_PAGE_SIZE) {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1) {
    throw new Error("Page size must be a positive integer.");
  }

  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) {
      throw error;
    }
    const page = Array.isArray(data) ? data : [];
    rows.push(...page);
    if (page.length < pageSize) {
      return rows;
    }
  }
}

function readLocalEnv() {
  const values = {};
  for (const file of [".env", ".env.local"]) {
    if (existsSync(file)) {
      Object.assign(values, parseDotenv(readFileSync(file)));
    }
  }
  return values;
}

function firstConfiguredValue(envFiles, names) {
  for (const name of names) {
    if (process.env[name]) {
      return process.env[name];
    }
    if (envFiles[name]) {
      return envFiles[name];
    }
  }
  return "";
}

function createReadOnlyAuditClient() {
  const envFiles = readLocalEnv();
  const supabaseUrl = firstConfiguredValue(envFiles, [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEW_SUPABASE_URL"
  ]);
  const serviceRoleKey = firstConfiguredValue(envFiles, [
    "SUPABASE_SERVICE_ROLE_KEY",
    "NEW_SUPABASE_SERVICE_KEY"
  ]);

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase audit access is not configured.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

export async function readDeckCompatibilityRows(client, pageSize = DEFAULT_PAGE_SIZE) {
  const [decks, deckLists, deckMatchups] = await Promise.all([
    fetchAllPages(
      (from, to) =>
        client
          .from("decks")
          .select("id,user_id,deck_lists,matchups")
          .order("id", { ascending: true })
          .range(from, to),
      pageSize
    ),
    fetchAllPages(
      (from, to) =>
        client
          .from("deck_lists")
          .select(
            "id,deck_id,user_id,name,format,date,created_by,notes,raw_list,parsed_cards,sorted_cards,sorted_cards_version,position,created_at,updated_at"
          )
          .order("deck_id", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
      pageSize
    ),
    fetchAllPages(
      (from, to) =>
        client
          .from("deck_matchups")
          .select(
            "id,deck_id,user_id,deck_name,deck_pokemon,format,go_preference,matchup_favor,ideal_bench,techs_needed,matchup_plan,position,created_at,updated_at"
          )
          .order("deck_id", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
      pageSize
    )
  ]);

  return { decks, deckLists, deckMatchups };
}

export async function runDeckCompatibilityAudit() {
  const client = createReadOnlyAuditClient();
  const rows = await readDeckCompatibilityRows(client);
  return buildDeckCompatibilityReport(aggregateDeckCompatibility(rows));
}

async function main() {
  try {
    const report = await runDeckCompatibilityAudit();
    process.stdout.write(`${formatDeckCompatibilityReport(report)}\n`);
    process.exitCode = report.safeToCutOver ? 0 : 2;
  } catch {
    process.stderr.write(
      `${JSON.stringify({
        safeToCutOver: false,
        reasons: ["The read-only audit could not complete. No cut-over should occur."],
        counts: {}
      }, null, 2)}\n`
    );
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  await main();
}
