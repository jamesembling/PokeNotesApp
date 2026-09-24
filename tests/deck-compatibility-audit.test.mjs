import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregateDeckCompatibility,
  buildDeckCompatibilityReport,
  fetchAllPages,
  formatDeckCompatibilityReport
} from "../scripts/audit-deck-compatibility.mjs";

const timestamp = "2026-07-11T12:00:00.000Z";

function matchingFixture() {
  return {
    decks: [
      {
        id: "private-deck-id",
        user_id: "private-user-id",
        deck_lists: [
          {
            id: "private-list-id",
            name: "Private deck list name",
            format: "FORMAT",
            date: "2026-07-11",
            createdBy: "Private person name",
            notes: "Private notes",
            rawList: "Private raw list",
            parsedCards: [{ name: "Private card", count: 1 }],
            sortedCards: [{ name: "Private card", count: 1 }],
            sortedCardsVersion: 1,
            createdAt: timestamp,
            updatedAt: timestamp
          }
        ],
        matchups: [
          {
            id: "private-matchup-id",
            deckName: "Private opponent deck",
            deckPokemon: ["private-pokemon"],
            format: "FORMAT",
            goPreference: "First",
            matchupFavor: "Even",
            idealBench: "Private bench",
            techsNeeded: "Private techs",
            matchupPlan: "Private plan",
            createdAt: timestamp,
            updatedAt: timestamp
          }
        ]
      }
    ],
    deckLists: [
      {
        id: "private-list-id",
        deck_id: "private-deck-id",
        user_id: "private-user-id",
        name: "Private deck list name",
        format: "FORMAT",
        date: "2026-07-11",
        created_by: "Private person name",
        notes: "Private notes",
        raw_list: "Private raw list",
        parsed_cards: [{ count: 1, name: "Private card" }],
        sorted_cards: [{ count: 1, name: "Private card" }],
        sorted_cards_version: 1,
        position: 0,
        created_at: "2026-07-11T12:00:00+00:00",
        updated_at: timestamp
      }
    ],
    deckMatchups: [
      {
        id: "private-matchup-id",
        deck_id: "private-deck-id",
        user_id: "private-user-id",
        deck_name: "Private opponent deck",
        deck_pokemon: ["private-pokemon"],
        format: "FORMAT",
        go_preference: "First",
        matchup_favor: "Even",
        ideal_bench: "Private bench",
        techs_needed: "Private techs",
        matchup_plan: "Private plan",
        position: 0,
        created_at: timestamp,
        updated_at: timestamp
      }
    ]
  };
}

test("compatibility parity follows content and order, including standalone lists", () => {
  const fixture = matchingFixture();
  fixture.deckLists[0].position = 7;
  fixture.deckLists[0].updated_at = "2026-07-11T12:01:00.000Z";
  fixture.deckMatchups[0].position = 9;
  fixture.deckMatchups[0].updated_at = "2026-07-11T12:01:00.000Z";
  const standaloneList = {
    ...fixture.deckLists[0],
    id: "standalone-private-list-id",
    deck_id: null,
    name: "Standalone private list",
    position: 0
  };
  fixture.deckLists.push(standaloneList);

  const counts = aggregateDeckCompatibility(fixture);
  const report = buildDeckCompatibilityReport(counts);

  assert.equal(report.safeToCutOver, true);
  assert.deepEqual(report.reasons, ["No compatibility mismatches were detected."]);
  assert.equal(report.counts.decksAudited, 1);
  assert.equal(report.counts.overlappingListCompositeCount, 1);
  assert.equal(report.counts.overlappingMatchupCompositeCount, 1);
  assert.equal(report.counts.overlappingListScalarMismatchCount, 0);
  assert.equal(report.counts.overlappingListOrderMismatchCount, 0);
  assert.equal(report.counts.overlappingMatchupOrderMismatchCount, 0);
  assert.equal(report.counts.standaloneListRecordCount, 1);
  assert.equal(report.counts.standaloneListInvalidIdentityCount, 0);
  assert.equal(report.counts.standaloneListDuplicateIdentityCount, 0);
  assert.equal(report.counts.standaloneListLegacyCopyCount, 0);
  assert.equal(report.counts.overlappingListSortedCardsMismatchCount, 0);

  const secondListId = "second-private-list-id";
  const secondMatchupId = "second-private-matchup-id";
  fixture.decks[0].deck_lists.push({
    ...fixture.decks[0].deck_lists[0],
    id: secondListId,
    name: "Second private list",
    createdAt: "2026-07-11T12:01:00.000Z"
  });
  fixture.deckLists.push({
    ...fixture.deckLists[0],
    id: secondListId,
    name: "Second private list",
    position: 8,
    created_at: "2026-07-11T12:01:00.000Z"
  });
  fixture.deckLists[0].position = 1;
  fixture.decks[0].matchups.push({
    ...fixture.decks[0].matchups[0],
    id: secondMatchupId,
    deckName: "Second private matchup",
    createdAt: "2026-07-11T12:01:00.000Z"
  });
  fixture.deckMatchups.push({
    ...fixture.deckMatchups[0],
    id: secondMatchupId,
    deck_name: "Second private matchup",
    position: 10,
    created_at: "2026-07-11T12:01:00.000Z"
  });
  fixture.deckMatchups[0].position = 1;

  const sameOrderReport = buildDeckCompatibilityReport(aggregateDeckCompatibility(fixture));
  assert.equal(sameOrderReport.safeToCutOver, true);
  assert.equal(sameOrderReport.counts.overlappingListOrderMismatchCount, 0);
  assert.equal(sameOrderReport.counts.overlappingMatchupOrderMismatchCount, 0);

  fixture.deckLists[0].position = 8;
  fixture.deckLists[2].position = 7;
  fixture.deckMatchups[0].position = 10;
  fixture.deckMatchups[1].position = 9;
  const reversedOrderReport = buildDeckCompatibilityReport(aggregateDeckCompatibility(fixture));

  assert.equal(reversedOrderReport.safeToCutOver, false);
  assert.equal(reversedOrderReport.counts.overlappingListOrderMismatchCount, 1);
  assert.equal(reversedOrderReport.counts.overlappingMatchupOrderMismatchCount, 1);
  assert(reversedOrderReport.reasons.some((reason) => reason.includes("Deck List ordering")));
  assert(reversedOrderReport.reasons.some((reason) => reason.includes("Deck Matchup ordering")));

  fixture.deckLists[0].position = fixture.deckLists[2].position;
  fixture.deckLists[0].created_at = fixture.deckLists[2].created_at;
  fixture.deckMatchups[0].position = fixture.deckMatchups[1].position;
  fixture.deckMatchups[0].created_at = fixture.deckMatchups[1].created_at;
  const ambiguousOrderReport = buildDeckCompatibilityReport(aggregateDeckCompatibility(fixture));
  assert.equal(ambiguousOrderReport.safeToCutOver, false);
  assert.equal(ambiguousOrderReport.counts.overlappingListOrderMismatchCount, 1);
  assert.equal(ambiguousOrderReport.counts.overlappingMatchupOrderMismatchCount, 1);

  fixture.decks[0].deck_lists.push({
    ...standaloneList,
    createdAt: standaloneList.created_at,
    updatedAt: standaloneList.updated_at
  });
  const standaloneLegacyCopyReport = buildDeckCompatibilityReport(aggregateDeckCompatibility(fixture));
  assert.equal(standaloneLegacyCopyReport.safeToCutOver, false);
  assert.equal(standaloneLegacyCopyReport.counts.standaloneListLegacyCopyCount, 1);

  fixture.deckLists.push({ ...standaloneList });
  const duplicateStandaloneReport = buildDeckCompatibilityReport(aggregateDeckCompatibility(fixture));
  assert.equal(duplicateStandaloneReport.safeToCutOver, false);
  assert.equal(duplicateStandaloneReport.counts.standaloneListDuplicateIdentityCount, 1);

  fixture.deckLists.push({ ...standaloneList, id: "" });
  const invalidStandaloneReport = buildDeckCompatibilityReport(aggregateDeckCompatibility(fixture));
  assert.equal(invalidStandaloneReport.safeToCutOver, false);
  assert.equal(invalidStandaloneReport.counts.standaloneListInvalidIdentityCount, 1);
});

test("missing IDs and overlapping scalar/card differences block cut-over by category", () => {
  const fixture = matchingFixture();
  fixture.decks[0].deck_lists.push({
    id: "legacy-only-list-id",
    name: "Legacy only",
    sortedCards: []
  });
  fixture.deckLists[0].notes = "Relational notes changed";
  fixture.deckLists[0].sorted_cards = [{ count: 2, name: "Different private card" }];
  fixture.deckLists.push({
    ...fixture.deckLists[0],
    id: "relational-only-list-id",
    position: 2
  });
  fixture.decks[0].matchups = [];

  const report = buildDeckCompatibilityReport(aggregateDeckCompatibility(fixture));

  assert.equal(report.safeToCutOver, false);
  assert.equal(report.counts.legacyOnlyListCompositeCount, 1);
  assert.equal(report.counts.legacyOnlyListGlobalIdAbsentCount, 1);
  assert.equal(report.counts.legacyOnlyListIdAtDifferentParentCount, 0);
  assert.equal(report.counts.relationalOnlyListCompositeCount, 1);
  assert.equal(report.counts.relationalOnlyListGlobalIdAbsentCount, 1);
  assert.equal(report.counts.overlappingListScalarMismatchCount, 1);
  assert.equal(report.counts.overlappingListSortedCardsMismatchCount, 1);
  assert.equal(report.counts.relationalOnlyMatchupCompositeCount, 1);
  assert.equal(report.counts.relationalOnlyMatchupGlobalIdAbsentCount, 1);
  assert(report.reasons.some((reason) => reason.includes("absent from all relational list rows")));
  assert(report.reasons.some((reason) => reason.includes("different scalar fields")));
  assert(report.reasons.some((reason) => reason.includes("different sorted-card data")));
});

test("same IDs under different parent decks are collisions rather than globally missing data", () => {
  const fixture = matchingFixture();
  fixture.decks.push({
    ...structuredClone(fixture.decks[0]),
    id: "second-private-deck-id",
    user_id: "second-private-user-id"
  });

  const report = buildDeckCompatibilityReport(aggregateDeckCompatibility(fixture));

  assert.equal(report.safeToCutOver, false);
  assert.equal(report.counts.legacyListCrossParentIdReuseCount, 1);
  assert.equal(report.counts.legacyOnlyListCompositeCount, 1);
  assert.equal(report.counts.legacyOnlyListIdAtDifferentParentCount, 1);
  assert.equal(report.counts.legacyOnlyListGlobalIdAbsentCount, 0);
  assert.equal(report.counts.legacyMatchupCrossParentIdReuseCount, 1);
  assert.equal(report.counts.legacyOnlyMatchupCompositeCount, 1);
  assert.equal(report.counts.legacyOnlyMatchupIdAtDifferentParentCount, 1);
  assert.equal(report.counts.legacyOnlyMatchupGlobalIdAbsentCount, 0);
  assert(
    report.reasons.some((reason) =>
      reason.includes("found relationally under a different parent deck")
    )
  );
  assert.equal(report.reasons.some((reason) => reason.includes("absent from all")), false);
});

test("formatted reports cannot expose source records or personal deck content", () => {
  const fixture = matchingFixture();
  fixture.deckLists[0].raw_list = "TOP-SECRET-RAW-LIST-CANARY";
  const report = buildDeckCompatibilityReport(aggregateDeckCompatibility(fixture));
  const output = formatDeckCompatibilityReport(report);

  [
    "private-deck-id",
    "private-user-id",
    "private-list-id",
    "Private deck list name",
    "Private person name",
    "Private card",
    "TOP-SECRET-RAW-LIST-CANARY"
  ].forEach((secret) => assert.equal(output.includes(secret), false));
  assert.equal(JSON.parse(output).safeToCutOver, false);
});

test("pagination reads every full page and stops after the first short page", async () => {
  const calls = [];
  const pages = [[{ row: 1 }, { row: 2 }], [{ row: 3 }, { row: 4 }], [{ row: 5 }]];

  const rows = await fetchAllPages(async (from, to) => {
    calls.push([from, to]);
    return { data: pages[calls.length - 1], error: null };
  }, 2);

  assert.deepEqual(calls, [[0, 1], [2, 3], [4, 5]]);
  assert.deepEqual(rows, [{ row: 1 }, { row: 2 }, { row: 3 }, { row: 4 }, { row: 5 }]);
});

test("pagination stops without returning partial data when a page fails", async () => {
  await assert.rejects(
    fetchAllPages(async () => ({ data: [{ row: 1 }], error: new Error("read failed") }), 2),
    /read failed/
  );
});
