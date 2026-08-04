import assert from "node:assert/strict";
import test from "node:test";
import {
  createDeckAggregateWriter,
  createServerDeckAggregateWriter,
  type CreateDeckMatchupCommand,
  type DeckAggregateCommitPlan,
  type DeckAggregateCommitResult,
  type DeckAggregateWriteAdapter,
  type SaveDeckListCommand,
  type UpdateDeckMatchupCommand
} from "@/lib/decks/deck-aggregate-writer";
import type { DeckCard } from "@/types/index";

const NOW = "2026-07-11T18:00:00.000Z";

type HarnessOptions = {
  commitError?: unknown;
  commitResult?: DeckAggregateCommitResult;
  commitResults?: DeckAggregateCommitResult[];
  lists?: unknown[] | null;
  matchups?: unknown[] | null;
  matchupReads?: Array<unknown[] | null>;
};

function createHarness(options: HarnessOptions = {}) {
  const calls: string[] = [];
  const commitPlans: DeckAggregateCommitPlan[] = [];
  let defaultFormatCalls = 0;
  let idCalls = 0;
  let commitCalls = 0;
  let matchupReadCalls = 0;

  const adapter: DeckAggregateWriteAdapter = {
    async commit(plan) {
      calls.push(`commit:${plan.kind}:${plan.operation}`);
      commitPlans.push(plan);
      if (options.commitError) {
        throw options.commitError;
      }
      const result = options.commitResults?.[commitCalls] ?? options.commitResult ?? "committed";
      commitCalls += 1;
      return result;
    },
    async loadLegacyChildren({ deckId, kind }) {
      calls.push(`load:${kind}:${deckId}`);
      if (kind === "deck-list") {
        return options.lists === undefined ? [] : options.lists;
      }
      const result =
        options.matchupReads?.[matchupReadCalls] ??
        (options.matchups === undefined ? [] : options.matchups);
      matchupReadCalls += 1;
      return result;
    }
  };

  const parsedCard: DeckCard = {
    count: 2,
    name: "Dragapult ex",
    number: "130",
    set: "TWM"
  };
  const sortedCard: DeckCard = {
    ...parsedCard,
    category: "Pokemon"
  };
  const writer = createDeckAggregateWriter({
    actor: {
      defaultCreatedBy: "Default Trainer",
      userId: "user-2"
    },
    adapter,
    createId: () => {
      idCalls += 1;
      return "new-list-id";
    },
    getDefaultFormat: async () => {
      defaultFormatCalls += 1;
      return "SVI-ASC";
    },
    now: () => NOW,
    parseCards: (rawList) => {
      assert.equal(rawList, "2 Dragapult ex TWM 130");
      return [parsedCard];
    },
    sortCards: async (cards) => {
      assert.deepEqual(cards, [parsedCard]);
      return [sortedCard];
    }
  });

  return {
    calls,
    commitPlans,
    get defaultFormatCalls() {
      return defaultFormatCalls;
    },
    get idCalls() {
      return idCalls;
    },
    writer
  };
}

function listCommand(overrides: Partial<SaveDeckListCommand> = {}): SaveDeckListCommand {
  return {
    createdBy: "",
    date: "",
    deckId: "deck-2",
    deckListId: "",
    format: "",
    name: "  League List  ",
    notes: "  Keep this plan  ",
    rawList: "  2 Dragapult ex TWM 130  ",
    submittedCreatedAt: "",
    ...overrides
  };
}

function createMatchupCommand(
  overrides: Partial<CreateDeckMatchupCommand> = {}
): CreateDeckMatchupCommand {
  return {
    deckId: "deck-2",
    deckName: "  Charizard  ",
    format: "  SVI-ASC  ",
    goPreference: "Second",
    idealBench: "  Keep spaces  ",
    matchupFavor: "  Even  ",
    matchupId: "matchup-new",
    matchupSprites: [" charizard ", "charizard", "pidgeot", "ignored-third"],
    techsNeeded: "  One tech  ",
    ...overrides
  };
}

function updateMatchupCommand(
  overrides: Partial<UpdateDeckMatchupCommand> = {}
): UpdateDeckMatchupCommand {
  return {
    ...createMatchupCommand({ matchupId: "matchup-existing" }),
    matchupPlan: "  Preserve plan whitespace  ",
    ...overrides
  };
}

test("list creation sends one normalized child to the transactional commit seam", async () => {
  const legacyOnlyList = {
    id: "shared-legacy-id",
    name: "Legacy-only list",
    rawList: "1 Old Card SET 1",
    parsedCards: [],
    sortedCards: [],
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-02T00:00:00.000Z",
    legacyOnlyMarker: "must survive"
  };
  const harness = createHarness({ lists: [legacyOnlyList] });

  const result = await harness.writer.saveList(listCommand());

  assert.deepEqual(result, {
    deckId: "deck-2",
    deckListId: "new-list-id"
  });
  assert.deepEqual(harness.calls, ["load:deck-list:deck-2", "commit:deck-list:create"]);
  assert.equal(harness.defaultFormatCalls, 1);
  assert.equal(harness.idCalls, 1);

  const commitPlan = harness.commitPlans[0];
  assert.deepEqual(commitPlan, {
    deckId: "deck-2",
    expectedChildUpdatedAt: null,
    kind: "deck-list",
    operation: "create",
    updatedAt: NOW,
    child: {
    id: "new-list-id",
    name: "League List",
    format: "SVI-ASC",
    date: "2026-07-11",
    createdBy: "Default Trainer",
    notes: "Keep this plan",
    rawList: "2 Dragapult ex TWM 130",
    parsedCards: [
      {
        count: 2,
        name: "Dragapult ex",
        number: "130",
        set: "TWM"
      }
    ],
    sortedCards: [
      {
        category: "Pokemon",
        count: 2,
        name: "Dragapult ex",
        number: "130",
        set: "TWM"
      }
    ],
    sortedCardsVersion: 2,
    createdAt: NOW,
    updatedAt: NOW
    }
  });
});

test("list edits retain creation time and carry the observed child version", async () => {
  const before = { id: "before", name: "Before", marker: "unchanged" };
  const existing = {
    id: "target",
    name: "Old name",
    createdAt: "2024-02-03T04:05:06.000Z",
    rawList: "1 Old Card SET 1",
    updatedAt: "2026-07-10T12:00:00.000Z"
  };
  const after = { id: "after", name: "After", marker: "unchanged" };
  const harness = createHarness({ lists: [before, existing, after] });

  await harness.writer.saveList(
    listCommand({
      createdBy: "  List Author  ",
      date: "2026-07-01",
      deckListId: "target",
      format: "Custom",
      name: "Updated"
    })
  );

  assert.deepEqual(harness.commitPlans[0], {
    deckId: "deck-2",
    expectedChildUpdatedAt: "2026-07-10T12:00:00.000Z",
    kind: "deck-list",
    operation: "update",
    updatedAt: NOW,
    child: {
    id: "target",
    name: "Updated",
    format: "Custom",
    date: "2026-07-01",
    createdBy: "List Author",
    notes: "Keep this plan",
    rawList: "2 Dragapult ex TWM 130",
    parsedCards: [
      {
        count: 2,
        name: "Dragapult ex",
        number: "130",
        set: "TWM"
      }
    ],
    sortedCards: [
      {
        category: "Pokemon",
        count: 2,
        name: "Dragapult ex",
        number: "130",
        set: "TWM"
      }
    ],
    sortedCardsVersion: 2,
    createdAt: "2024-02-03T04:05:06.000Z",
    updatedAt: NOW
    }
  });
  assert.equal(harness.defaultFormatCalls, 0);
  assert.equal(harness.idCalls, 0);
});

test("a missing legacy list edit target fails before field validation or writes", async () => {
  const harness = createHarness({ lists: [] });

  await assert.rejects(
    harness.writer.saveList(
      listCommand({
        deckListId: "missing",
        name: "",
        rawList: ""
      })
    ),
    { message: "Deck list could not be found." }
  );
  assert.deepEqual(harness.calls, ["load:deck-list:deck-2"]);
});

test("deck-list sort failures retain the current user-facing error and make no writes", async () => {
  const harness = createHarness();
  const writer = createDeckAggregateWriter({
    actor: {
      defaultCreatedBy: "Trainer",
      userId: "user-2"
    },
    adapter: {
      commit: async () => {
        assert.fail("Atomic commit must not run after sort failure.");
      },
      loadLegacyChildren: async ({ deckId, kind }) => {
        harness.calls.push(`load:${kind}:${deckId}`);
        return [];
      }
    },
    now: () => NOW,
    parseCards: () => [],
    sortCards: async () => {
      throw new Error("catalog unavailable");
    }
  });

  await assert.rejects(writer.saveList(listCommand()), {
    message:
      "We couldn't apply the canonical deck ordering right now. Please try saving again in a moment."
  });
});

test("global-id storage collisions remain explicit through the atomic commit", async () => {
  const collision = Object.assign(new Error("duplicate key value violates unique constraint"), {
    code: "23505"
  });
  const harness = createHarness({
    lists: [{ id: "reused-across-users", name: "Existing", rawList: "" }],
    commitError: collision
  });

  await assert.rejects(
    harness.writer.saveList(listCommand()),
    (error) => error === collision
  );
  assert.deepEqual(harness.calls, ["load:deck-list:deck-2", "commit:deck-list:create"]);
});

test("a parent disappearing before the locked commit retains the deck-not-found error", async () => {
  const harness = createHarness({ commitResult: "deck-not-found" });

  await assert.rejects(harness.writer.saveList(listCommand()), {
    message: "Deck could not be found."
  });
  assert.deepEqual(harness.calls, ["load:deck-list:deck-2", "commit:deck-list:create"]);
});

test("an atomic commit failure remains explicit without a second write stage", async () => {
  const commitError = new Error("atomic deck aggregate commit failed");
  const harness = createHarness({ commitError });

  await assert.rejects(
    harness.writer.saveList(listCommand()),
    (error) => error === commitError
  );

  assert.deepEqual(harness.calls, ["load:deck-list:deck-2", "commit:deck-list:create"]);
  assert.equal(harness.commitPlans.length, 1);
});

test("a same-child concurrency conflict gives an actionable user-facing error", async () => {
  const harness = createHarness({
    commitResult: "conflict",
    lists: [
      {
        id: "target",
        name: "Existing",
        rawList: "1 Old Card SET 1",
        updatedAt: "2026-07-11T17:00:00.000Z"
      }
    ]
  });

  await assert.rejects(
    harness.writer.saveList(listCommand({ deckListId: "target" })),
    {
      message: "This deck list changed in another tab. Refresh the page and try again."
    }
  );
  assert.equal(
    harness.commitPlans[0]?.expectedChildUpdatedAt,
    "2026-07-11T17:00:00.000Z"
  );
});

test("the server adapter fails a blank legacy update version before calling the RPC", async () => {
  let rpcCalls = 0;
  const query = {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    async maybeSingle() {
      return {
        data: {
          id: "deck-2",
          matchups: [
            {
              createdAt: "2026-07-10T12:00:00.000Z",
              deckName: "Charizard",
              deckPokemon: ["charizard"],
              format: "SVI-ASC",
              id: "matchup-existing",
              updatedAt: "   "
            }
          ]
        },
        error: null
      };
    }
  };
  const writer = createServerDeckAggregateWriter({
    actor: {
      defaultCreatedBy: "Trainer",
      userId: "user-2"
    },
    supabase: {
      from() {
        return query;
      },
      async rpc() {
        rpcCalls += 1;
        return { data: "committed", error: null };
      }
    } as never
  });

  await assert.rejects(writer.updateMatchup(updateMatchupCommand()), {
    message: "This matchup changed in another tab. Refresh the page and try again."
  });
  assert.equal(rpcCalls, 0);
});

test("a list removed after the initial read retains the list-not-found error", async () => {
  const harness = createHarness({
    commitResult: "child-not-found",
    lists: [
      {
        id: "target",
        name: "Existing",
        rawList: "1 Old Card SET 1",
        updatedAt: "2026-07-10T12:00:00.000Z"
      }
    ]
  });

  await assert.rejects(
    harness.writer.saveList(listCommand({ deckListId: "target" })),
    { message: "Deck list could not be found." }
  );
  assert.deepEqual(harness.calls, ["load:deck-list:deck-2", "commit:deck-list:update"]);
});

test("matchup creation preserves normalization at the transactional commit seam", async () => {
  const existing = {
    id: "matchup-existing",
    deckName: "Existing",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-02T00:00:00.000Z",
    marker: "must survive"
  };
  const harness = createHarness({ matchups: [existing] });

  const result = await harness.writer.createMatchup(createMatchupCommand());

  assert.deepEqual(result, {
    deckId: "deck-2",
    matchupId: "matchup-new"
  });
  assert.deepEqual(harness.calls, ["load:matchup:deck-2", "commit:matchup:create"]);
  assert.deepEqual(harness.commitPlans[0], {
    deckId: "deck-2",
    expectedChildUpdatedAt: null,
    kind: "matchup",
    operation: "create",
    updatedAt: NOW,
    child: {
      id: "matchup-new",
      deckName: "Charizard",
      deckPokemon: ["charizard", "pidgeot"],
      format: "SVI-ASC",
      goPreference: "Second",
      matchupFavor: "Even",
      idealBench: "  Keep spaces  ",
      techsNeeded: "  One tech  ",
      matchupPlan: "",
      createdAt: NOW,
      updatedAt: NOW
    }
  });
});

test("matchup updates retain creation time and untrimmed strategy fields", async () => {
  const before = { id: "before", deckName: "Before" };
  const existing = {
    id: "matchup-existing",
    deckName: "Old",
    createdAt: "2025-03-04T05:06:07.000Z",
    matchupPlan: "Old plan",
    updatedAt: "2026-07-10T12:00:00.000Z"
  };
  const after = { id: "after", deckName: "After" };
  const harness = createHarness({ matchups: [before, existing, after] });

  await harness.writer.updateMatchup(updateMatchupCommand());

  assert.deepEqual(harness.commitPlans[0], {
    deckId: "deck-2",
    expectedChildUpdatedAt: "2026-07-10T12:00:00.000Z",
    kind: "matchup",
    operation: "update",
    updatedAt: NOW,
    child: {
      id: "matchup-existing",
      deckName: "Charizard",
      createdAt: "2025-03-04T05:06:07.000Z",
      matchupPlan: "  Preserve plan whitespace  ",
      deckPokemon: ["charizard", "pidgeot"],
      format: "SVI-ASC",
      goPreference: "Second",
      matchupFavor: "Even",
      idealBench: "  Keep spaces  ",
      techsNeeded: "  One tech  ",
      updatedAt: NOW
    }
  });
});

test("matchup plan autosaves preserve concurrently managed header fields", async () => {
  const existing = {
    id: "matchup-existing",
    deckName: "Charizard",
    deckPokemon: ["charizard", "pidgeot"],
    format: "SVI-ASC",
    goPreference: "First",
    matchupFavor: "Even",
    idealBench: "Old bench",
    techsNeeded: "Old tech",
    matchupPlan: "Old plan",
    createdAt: "2025-03-04T05:06:07.000Z",
    updatedAt: "2026-07-10T12:00:00.000Z"
  };
  const harness = createHarness({ matchups: [existing] });

  await harness.writer.updateMatchupFields({
    deckId: "deck-2",
    fields: {
      idealBench: "New bench",
      matchupPlan: "New plan",
      techsNeeded: "New tech"
    },
    matchupId: "matchup-existing",
    scope: "plan"
  });

  assert.deepEqual(harness.commitPlans[0]?.child, {
    ...existing,
    idealBench: "New bench",
    matchupPlan: "New plan",
    techsNeeded: "New tech",
    updatedAt: NOW
  });
});

test("matchup header autosaves preserve the newest planning fields", async () => {
  const existing = {
    id: "matchup-existing",
    deckName: "Charizard",
    deckPokemon: ["charizard", "pidgeot"],
    format: "SVI-ASC",
    goPreference: "First",
    matchupFavor: "Even",
    idealBench: "Newest bench",
    techsNeeded: "Newest tech",
    matchupPlan: "Newest plan",
    createdAt: "2025-03-04T05:06:07.000Z",
    updatedAt: "2026-07-10T12:00:00.000Z"
  };
  const harness = createHarness({ matchups: [existing] });

  await harness.writer.updateMatchupFields({
    deckId: "deck-2",
    fields: {
      format: "Expanded",
      goPreference: "Second",
      matchupFavor: "Slightly Favoured"
    },
    matchupId: "matchup-existing",
    scope: "header"
  });

  assert.deepEqual(harness.commitPlans[0]?.child, {
    ...existing,
    format: "Expanded",
    goPreference: "Second",
    matchupFavor: "Slightly Favoured",
    updatedAt: NOW
  });
});

test("a concurrent header commit is reloaded before retrying a planning-field patch", async () => {
  const initial = {
    id: "matchup-existing",
    deckName: "Charizard",
    deckPokemon: ["charizard", "pidgeot"],
    format: "SVI-ASC",
    goPreference: "First",
    matchupFavor: "Even",
    idealBench: "Old bench",
    techsNeeded: "Old tech",
    matchupPlan: "Old plan",
    updatedAt: "2026-07-10T12:00:00.000Z"
  };
  const afterHeaderCommit = {
    ...initial,
    format: "Expanded",
    goPreference: "Second",
    matchupFavor: "Slightly Favoured",
    updatedAt: "2026-07-11T17:59:00.000Z"
  };
  const harness = createHarness({
    commitResults: ["conflict", "committed"],
    matchupReads: [[initial], [afterHeaderCommit]]
  });

  await harness.writer.updateMatchupFields({
    deckId: "deck-2",
    fields: {
      idealBench: "New bench",
      matchupPlan: "New plan",
      techsNeeded: "New tech"
    },
    matchupId: "matchup-existing",
    scope: "plan"
  });

  assert.deepEqual(harness.calls, [
    "load:matchup:deck-2",
    "commit:matchup:update",
    "load:matchup:deck-2",
    "commit:matchup:update"
  ]);
  assert.equal(
    harness.commitPlans[0]?.expectedChildUpdatedAt,
    "2026-07-10T12:00:00.000Z"
  );
  assert.deepEqual(harness.commitPlans[1]?.child, {
    ...afterHeaderCommit,
    idealBench: "New bench",
    matchupPlan: "New plan",
    techsNeeded: "New tech",
    updatedAt: NOW
  });
  assert.equal(
    harness.commitPlans[1]?.expectedChildUpdatedAt,
    "2026-07-11T17:59:00.000Z"
  );
});

test("a full matchup edit fails closed instead of reapplying stale fields after conflict", async () => {
  const initial = {
    id: "matchup-existing",
    deckName: "Charizard",
    deckPokemon: ["charizard", "pidgeot"],
    format: "SVI-ASC",
    goPreference: "First",
    matchupFavor: "Even",
    idealBench: "Old bench",
    techsNeeded: "Old tech",
    matchupPlan: "Old plan",
    updatedAt: "2026-07-10T12:00:00.000Z"
  };
  const concurrentEdit = {
    ...initial,
    matchupPlan: "Concurrent plan that must not be overwritten",
    updatedAt: "2026-07-11T17:59:00.000Z"
  };
  const harness = createHarness({
    commitResults: ["conflict", "committed"],
    matchupReads: [[initial], [concurrentEdit]]
  });

  await assert.rejects(
    harness.writer.updateMatchup(
      updateMatchupCommand({
        matchupPlan: "Stale full-dialog plan"
      })
    ),
    { message: "This matchup changed in another tab. Refresh the page and try again." }
  );

  assert.deepEqual(harness.calls, [
    "load:matchup:deck-2",
    "commit:matchup:update"
  ]);
  assert.equal(harness.commitPlans.length, 1);
  assert.equal(
    harness.commitPlans[0]?.expectedChildUpdatedAt,
    "2026-07-10T12:00:00.000Z"
  );
});

test("matchup field validation retains its existing order and messages", async (t) => {
  const cases: Array<{
    command: CreateDeckMatchupCommand;
    message: string;
  }> = [
    {
      command: createMatchupCommand({ deckName: "", format: "", matchupSprites: [] }),
      message: "Enter a matchup deck name before saving."
    },
    {
      command: createMatchupCommand({ format: "", matchupSprites: [] }),
      message: "Choose a format before saving this matchup."
    },
    {
      command: createMatchupCommand({ matchupSprites: [] }),
      message: "Pick at least one Pokemon sprite for the matchup."
    }
  ];

  for (const current of cases) {
    await t.test(current.message, async () => {
      const harness = createHarness();
      await assert.rejects(harness.writer.createMatchup(current.command), {
        message: current.message
      });
      assert.deepEqual(harness.calls, ["load:matchup:deck-2"]);
    });
  }
});

test("a missing matchup edit target fails before matchup field validation", async () => {
  const harness = createHarness({ matchups: [] });

  await assert.rejects(
    harness.writer.updateMatchup(
      updateMatchupCommand({
        deckName: "",
        format: "",
        matchupId: "missing",
        matchupSprites: []
      })
    ),
    { message: "That matchup could not be found." }
  );
  assert.deepEqual(harness.calls, ["load:matchup:deck-2"]);
});
