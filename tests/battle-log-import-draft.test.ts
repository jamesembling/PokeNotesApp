import assert from "node:assert/strict";
import test from "node:test";
import {
  BattleLogImportDraftValidationError,
  buildBattleLogImportReviewProjection,
  buildBattleLogImportSaveFingerprint,
  consumeBattleLogImportDraft,
  createBattleLogImportDraft,
  evaluateBattleLogImportDraftSave,
  parseBattleLogImportSaveRequest,
  type BattleLogImportDraft,
  type BattleLogImportImmutableFacts,
  type BattleLogImportSaveRequest
} from "@/lib/log-import/import-draft";
import type { ParsedLogReview } from "@/types/index";

const CREATED_AT = "2026-08-21T10:00:00.000Z";
const EXPIRES_AT = "2026-08-21T11:00:00.000Z";
const USER_ID = "user-1";

function assertImmutableFactsAreReadonly(facts: BattleLogImportImmutableFacts) {
  // @ts-expect-error Parser-derived facts must not be assignable.
  facts.rawLog = "tampered";
  // @ts-expect-error Nested parser-derived details must not be assignable.
  facts.sections[0]!.actions[0]!.details[0] = "tampered";
  // @ts-expect-error Nested parser-derived prize counts must not be assignable.
  facts.sections[0]!.prizesAfterTurn.James = 0;
}

function assertDraftImmutablePropertyIsReadonly(draft: BattleLogImportDraft) {
  // @ts-expect-error The authoritative immutable property must not be replaceable.
  draft.immutable = draft.immutable;
}

void assertImmutableFactsAreReadonly;
void assertDraftImmutablePropertyIsReadonly;

function buildReview(): ParsedLogReview {
  return {
    selfPlayerName: "James",
    opponentPlayerName: "Opponent",
    selfDeckName: "Dragapult",
    opponentDeckName: "Charizard",
    selfSprites: ["dragapult", "dusknoir"],
    opponentSprites: ["charizard"],
    selfDeckSlug: "dragapult-dusknoir",
    opponentDeckSlug: "charizard-pidgeot",
    date: "2026-08-21",
    goOrder: "First",
    coinTossWon: true,
    result: "Win",
    language: "en",
    rawLog: "immutable raw log",
    sections: [
      {
        title: "Setup",
        player: "",
        actions: [{ title: "James drew 7 cards", details: ["Basic Pokemon"] }],
        prizesAfterTurn: { James: 6, Opponent: 6 }
      }
    ],
    totalTurns: 8,
    selfPrizesTaken: 6,
    opponentPrizesTaken: 2,
    selfAttackDamage: 420,
    opponentAttackDamage: 180,
    selfMulligans: 0,
    opponentMulligans: 1,
    reason: "Prizes"
  };
}

function buildDraft(): BattleLogImportDraft {
  return createBattleLogImportDraft({
    id: "draft-1",
    userId: USER_ID,
    createdAt: CREATED_AT,
    expiresAt: EXPIRES_AT,
    format: "Standard",
    review: buildReview()
  });
}

function buildRequest(overrides: Partial<BattleLogImportSaveRequest> = {}): BattleLogImportSaveRequest {
  const draft = buildDraft();
  return {
    draftId: draft.id,
    idempotencyKey: "save-1",
    editable: {
      ...draft.editable,
      selfDeckSprites: ["dragapult", "dusknoir"],
      opponentDeckSprites: ["charizard"],
      date: "2026-08-21",
      format: "Standard",
      linkedDeckId: null,
      linkedDeckListId: null,
      matchNotes: "Won the opening exchange."
    },
    ...overrides
  };
}

test("drafts retain parser-derived facts separately from editable review values", () => {
  const draft = buildDraft();
  const projection = buildBattleLogImportReviewProjection(draft);

  assert.deepEqual(draft.immutable.result, "Win");
  assert.deepEqual(draft.immutable.sections[0]?.actions[0]?.details, ["Basic Pokemon"]);
  assert.deepEqual(draft.editable.selfDeckSprites, ["dragapult", "dusknoir"]);
  assert.deepEqual(projection, {
    draftId: "draft-1",
    expiresAt: EXPIRES_AT,
    immutable: draft.immutable,
    editable: draft.editable
  });
  assert.equal("userId" in projection, false);

  assert.equal(Object.isFrozen(draft), true);
  assert.throws(
    () =>
      Object.assign(draft, {
        immutable: { ...draft.immutable, rawLog: "forged facts" }
      }),
    TypeError
  );
  assert.equal(draft.immutable.rawLog, "immutable raw log");
  assert.equal(Object.isFrozen(draft.immutable), true);
  assert.equal(Object.isFrozen(draft.immutable.sections), true);
  assert.equal(Object.isFrozen(draft.immutable.sections[0]), true);
  assert.equal(Object.isFrozen(draft.immutable.sections[0]?.actions), true);
  assert.equal(Object.isFrozen(draft.immutable.sections[0]?.actions[0]), true);
  assert.equal(
    Object.isFrozen(draft.immutable.sections[0]?.actions[0]?.details),
    true
  );
  assert.equal(Object.isFrozen(draft.immutable.sections[0]?.prizesAfterTurn), true);

  assert.throws(
    () => Object.assign(projection.immutable, { rawLog: "tampered" }),
    TypeError
  );
  assert.throws(
    () =>
      Object.assign(projection.immutable.sections[0]!.actions[0]!.details, {
        0: "tampered"
      }),
    TypeError
  );
  assert.throws(
    () =>
      Object.assign(projection.immutable.sections[0]!.prizesAfterTurn, {
        James: 0
      }),
    TypeError
  );
  projection.editable.selfDeckSprites.push("extra");
  assert.deepEqual(draft.immutable.sections[0]?.actions[0]?.details, ["Basic Pokemon"]);
  assert.deepEqual(draft.editable.selfDeckSprites, ["dragapult", "dusknoir"]);
});

test("save requests accept only opaque identity plus the agreed editable fields", () => {
  const draft = buildDraft();
  const request = parseBattleLogImportSaveRequest({
    draftId: draft.id,
    idempotencyKey: "save-1",
    editable: {
      ...draft.editable,
      date: "2026-08-22",
      matchNotes: "Updated note"
    }
  });

  assert.equal(request.editable.date, "2026-08-22");
  assert.equal(request.editable.matchNotes, "Updated note");

  assert.throws(
    () =>
      parseBattleLogImportSaveRequest({
        draftId: draft.id,
        idempotencyKey: "save-1",
        editable: {
          ...draft.editable,
          result: "Loss"
        }
      }),
    (error: unknown) =>
      error instanceof BattleLogImportDraftValidationError &&
      error.code === "INVALID_EDITABLE_FIELDS"
  );

  assert.throws(
    () =>
      parseBattleLogImportSaveRequest({
        draftId: draft.id,
        idempotencyKey: "save-1",
        rawLog: "tampered immutable log",
        editable: draft.editable
      }),
    (error: unknown) =>
      error instanceof BattleLogImportDraftValidationError &&
      error.code === "INVALID_EDITABLE_FIELDS"
  );
});

test("ownership and expiry failures are recoverable and never consume a draft", () => {
  const draft = buildDraft();
  const request = buildRequest();

  assert.deepEqual(
    evaluateBattleLogImportDraftSave({
      draft,
      userId: "other-user",
      request,
      now: "2026-08-21T10:30:00.000Z"
    }),
    {
      status: "rejected",
      code: "DRAFT_ACCOUNT_MISMATCH",
      message: "This battle-log review belongs to a different account. Import the complete log again."
    }
  );

  assert.deepEqual(
    evaluateBattleLogImportDraftSave({
      draft,
      userId: USER_ID,
      request,
      now: EXPIRES_AT
    }),
    {
      status: "rejected",
      code: "DRAFT_EXPIRED",
      message: "This battle-log review has expired. Import the complete log again."
    }
  );

  assert.deepEqual(
    evaluateBattleLogImportDraftSave({
      draft,
      userId: USER_ID,
      request,
      now: "not-a-timestamp"
    }),
    {
      status: "rejected",
      code: "INVALID_SERVER_TIMESTAMP",
      message: "The server clock timestamp is invalid."
    }
  );

  assert.throws(
    () =>
      consumeBattleLogImportDraft({
        draft,
        userId: USER_ID,
        request,
        battleLogId: "log-invalid-clock",
        consumedAt: "not-a-timestamp"
      }),
    (error: unknown) =>
      error instanceof BattleLogImportDraftValidationError &&
      error.code === "INVALID_TIMESTAMP"
  );

  assert.throws(
    () =>
      consumeBattleLogImportDraft({
        draft,
        userId: USER_ID,
        request,
        battleLogId: "log-expired",
        consumedAt: EXPIRES_AT
      }),
    (error: unknown) =>
      error instanceof BattleLogImportDraftValidationError &&
      error.code === "INVALID_DRAFT_REFERENCE"
  );
  assert.equal(draft.consumed, null);
});

test("a request cannot be evaluated against a different draft", () => {
  const draft = buildDraft();
  const request = buildRequest({ draftId: "another-draft" });

  assert.deepEqual(
    evaluateBattleLogImportDraftSave({
      draft,
      userId: USER_ID,
      request,
      now: "2026-08-21T10:30:00.000Z"
    }),
    {
      status: "rejected",
      code: "DRAFT_NOT_FOUND",
      message: "This battle-log review has expired or is unavailable. Import the complete log again."
    }
  );
});

test("validation and temporary persistence failures leave the draft available for retry", () => {
  const draft = buildDraft();
  const request = buildRequest();
  assert.throws(
    () => Object.assign(draft.immutable, { rawLog: "tampered" }),
    TypeError
  );

  const initialDecision = evaluateBattleLogImportDraftSave({
    draft,
    userId: USER_ID,
    request,
    now: "2026-08-21T10:30:00.000Z"
  });

  assert.equal(initialDecision.status, "ready");
  assert.equal(draft.consumed, null);

  const retryDecision = evaluateBattleLogImportDraftSave({
    draft,
    userId: USER_ID,
    request,
    now: "2026-08-21T10:31:00.000Z"
  });
  assert.equal(retryDecision.status, "ready");

  const consumed = consumeBattleLogImportDraft({
    draft,
    userId: USER_ID,
    request,
    battleLogId: "log-1",
    consumedAt: "2026-08-21T10:32:00.000Z"
  });
  assert.equal(consumed.consumed?.battleLogId, "log-1");
  assert.notEqual(consumed, draft);
  assert.equal(Object.isFrozen(consumed), true);
  assert.throws(
    () =>
      Object.assign(consumed, {
        immutable: { ...consumed.immutable, rawLog: "forged after save" }
      }),
    TypeError
  );
  assert.equal(Object.isFrozen(consumed.immutable), true);
  assert.throws(
    () => Object.assign(consumed.immutable, { rawLog: "tampered after save" }),
    TypeError
  );
  assert.deepEqual(consumed.immutable, draft.immutable);
});

test("a successful save replays identically and rejects identity reuse with different values", () => {
  const draft = buildDraft();
  const request = buildRequest();
  const consumed = consumeBattleLogImportDraft({
    draft,
    userId: USER_ID,
    request,
    battleLogId: "log-1",
    consumedAt: "2026-08-21T10:32:00.000Z"
  });

  const replay = evaluateBattleLogImportDraftSave({
    draft: consumed,
    userId: USER_ID,
    request,
    now: "2026-08-21T12:33:00.000Z"
  });
  assert.deepEqual(replay, { status: "replay", battleLogId: "log-1" });

  const changedRequest = buildRequest({
    editable: {
      ...request.editable,
      matchNotes: "Different permitted value"
    }
  });
  const conflict = evaluateBattleLogImportDraftSave({
    draft: consumed,
    userId: USER_ID,
    request: changedRequest,
    now: "2026-08-21T10:34:00.000Z"
  });
  assert.deepEqual(conflict, {
    status: "rejected",
    code: "IDEMPOTENCY_CONFLICT",
    message: "That save identity was already used with different review values."
  });
  assert.equal(consumed.consumed?.battleLogId, "log-1");
});

test("fingerprints are stable when object key order differs", () => {
  const left = buildRequest();
  const right = {
    ...left,
    editable: {
      matchNotes: left.editable.matchNotes,
      linkedDeckListId: left.editable.linkedDeckListId,
      linkedDeckId: left.editable.linkedDeckId,
      format: left.editable.format,
      date: left.editable.date,
      opponentDeckSprites: left.editable.opponentDeckSprites,
      opponentDeckSlug: left.editable.opponentDeckSlug,
      selfDeckSprites: left.editable.selfDeckSprites,
      selfDeckSlug: left.editable.selfDeckSlug
    }
  };

  assert.equal(
    buildBattleLogImportSaveFingerprint(left),
    buildBattleLogImportSaveFingerprint(right)
  );
});
