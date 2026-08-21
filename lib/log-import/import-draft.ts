import type { LogSection, ParsedLogReview } from "@/types/index";

const MAX_OPAQUE_REFERENCE_LENGTH = 128;
const MAX_EDITABLE_TEXT_LENGTH = 256;
const MAX_SPRITES = 2;

type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer U)[]
    ? ReadonlyArray<DeepReadonly<U>>
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T;

type BattleLogImportImmutableFactValues = {
  selfPlayerName: string;
  opponentPlayerName: string;
  result: ParsedLogReview["result"];
  goOrder: ParsedLogReview["goOrder"];
  coinTossWon: ParsedLogReview["coinTossWon"];
  language: ParsedLogReview["language"];
  rawLog: string;
  sections: LogSection[];
  totalTurns: number;
  selfPrizesTaken: number;
  opponentPrizesTaken: number;
  selfAttackDamage: number;
  opponentAttackDamage: number;
  selfMulligans: number;
  opponentMulligans: number;
  reason: string;
};

export type BattleLogImportImmutableFacts = DeepReadonly<
  BattleLogImportImmutableFactValues
>;

/**
 * These are the only values a review may change. Deck IDs stay opaque here on
 * purpose: ownership, compatibility, and persistence belong to the separate
 * first-class Deck List contract.
 */
export type BattleLogImportEditableFields = {
  selfDeckSlug: string;
  selfDeckSprites: string[];
  opponentDeckSlug: string;
  opponentDeckSprites: string[];
  date: string;
  format: string;
  linkedDeckId: string | null;
  linkedDeckListId: string | null;
  matchNotes: string | null;
};

export type BattleLogImportDraft = {
  id: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
  immutable: BattleLogImportImmutableFacts;
  editable: BattleLogImportEditableFields;
  consumed: BattleLogImportDraftConsumption | null;
};

export type BattleLogImportDraftConsumption = {
  idempotencyKey: string;
  fingerprint: string;
  battleLogId: string;
  consumedAt: string;
};

export type BattleLogImportReviewProjection = {
  draftId: string;
  expiresAt: string;
  immutable: BattleLogImportImmutableFacts;
  editable: BattleLogImportEditableFields;
};

export type BattleLogImportSaveRequest = {
  draftId: string;
  idempotencyKey: string;
  editable: BattleLogImportEditableFields;
};

export type BattleLogImportDraftSaveDecision =
  | {
      status: "ready";
      fingerprint: string;
      draft: BattleLogImportDraft;
    }
  | {
      status: "replay";
      battleLogId: string;
    }
  | {
      status: "rejected";
      code:
        | "DRAFT_NOT_FOUND"
        | "DRAFT_ACCOUNT_MISMATCH"
        | "DRAFT_EXPIRED"
        | "DRAFT_CONSUMED"
        | "IDEMPOTENCY_CONFLICT"
        | "INVALID_SERVER_TIMESTAMP";
      message: string;
    };

export class BattleLogImportDraftValidationError extends Error {
  code:
    | "INVALID_DRAFT_REFERENCE"
    | "INVALID_TIMESTAMP"
    | "INVALID_EXPIRY"
    | "INVALID_EDITABLE_FIELDS"
    | "INVALID_DATE"
    | "INVALID_TEXT"
    | "INVALID_SPRITES"
    | "INVALID_SAVE_IDENTITY";

  constructor(
    code: BattleLogImportDraftValidationError["code"],
    message: string
  ) {
    super(message);
    this.name = "BattleLogImportDraftValidationError";
    this.code = code;
  }
}

function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Reflect.ownKeys(value).forEach((key) => {
      const child = (value as Record<PropertyKey, unknown>)[key];
      if (child && typeof child === "object") {
        deepFreeze(child);
      }
    });
    Object.freeze(value);
  }

  return value as DeepReadonly<T>;
}

function cloneSections(sections: ReadonlyArray<DeepReadonly<LogSection>>): LogSection[] {
  return sections.map((section) => ({
    ...section,
    actions: section.actions.map((action) => ({
      ...action,
      details: [...action.details]
    })),
    prizesAfterTurn: { ...section.prizesAfterTurn }
  }));
}

function cloneEditable(editable: BattleLogImportEditableFields): BattleLogImportEditableFields {
  return {
    ...editable,
    selfDeckSprites: [...editable.selfDeckSprites],
    opponentDeckSprites: [...editable.opponentDeckSprites]
  };
}

function cloneImmutable(
  immutable: BattleLogImportImmutableFacts
): BattleLogImportImmutableFacts {
  return deepFreeze({
    ...immutable,
    sections: cloneSections(immutable.sections)
  });
}

function requireOpaqueReference(value: unknown, field: string) {
  const reference = String(value ?? "").trim();
  if (!reference || reference.length > MAX_OPAQUE_REFERENCE_LENGTH) {
    throw new BattleLogImportDraftValidationError(
      field === "idempotencyKey" ? "INVALID_SAVE_IDENTITY" : "INVALID_DRAFT_REFERENCE",
      `${field} is invalid.`
    );
  }

  return reference;
}

function requireTimestamp(value: unknown, field: string) {
  const timestamp = String(value ?? "").trim();
  if (!timestamp || !Number.isFinite(Date.parse(timestamp))) {
    throw new BattleLogImportDraftValidationError(
      "INVALID_TIMESTAMP",
      `${field} must be a valid timestamp.`
    );
  }

  return timestamp;
}

function requireDate(value: unknown) {
  const date = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new BattleLogImportDraftValidationError(
      "INVALID_DATE",
      "The battle log date must use YYYY-MM-DD."
    );
  }

  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (parsed.toISOString().slice(0, 10) !== date) {
    throw new BattleLogImportDraftValidationError(
      "INVALID_DATE",
      "The battle log date is not a real calendar date."
    );
  }

  return date;
}

function optionalText(value: unknown, field: string, maxLength = MAX_EDITABLE_TEXT_LENGTH) {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();
  if (text.length > maxLength) {
    throw new BattleLogImportDraftValidationError(
      "INVALID_TEXT",
      `${field} is too long.`
    );
  }

  return text || null;
}

function requiredText(value: unknown, field: string, maxLength = MAX_EDITABLE_TEXT_LENGTH) {
  const text = String(value ?? "").trim();
  if (text.length > maxLength) {
    throw new BattleLogImportDraftValidationError(
      "INVALID_TEXT",
      `${field} is too long.`
    );
  }

  return text;
}

function parseSprites(value: unknown, field: string) {
  if (!Array.isArray(value)) {
    throw new BattleLogImportDraftValidationError(
      "INVALID_SPRITES",
      `${field} must be an array of at most ${MAX_SPRITES} sprites.`
    );
  }

  const sprites = Array.from(
    new Set(
      value.map((entry) => String(entry ?? "").trim()).filter(Boolean)
    )
  );

  if (sprites.length > MAX_SPRITES || sprites.some((sprite) => sprite.length > MAX_EDITABLE_TEXT_LENGTH)) {
    throw new BattleLogImportDraftValidationError(
      "INVALID_SPRITES",
      `${field} must contain at most ${MAX_SPRITES} short sprite identifiers.`
    );
  }

  return sprites;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseEditableFields(value: unknown): BattleLogImportEditableFields {
  if (!isRecord(value)) {
    throw new BattleLogImportDraftValidationError(
      "INVALID_EDITABLE_FIELDS",
      "Editable review values are missing."
    );
  }

  const allowedFields = new Set([
    "selfDeckSlug",
    "selfDeckSprites",
    "opponentDeckSlug",
    "opponentDeckSprites",
    "date",
    "format",
    "linkedDeckId",
    "linkedDeckListId",
    "matchNotes"
  ]);
  const unexpectedFields = Object.keys(value).filter((field) => !allowedFields.has(field));
  if (unexpectedFields.length > 0) {
    throw new BattleLogImportDraftValidationError(
      "INVALID_EDITABLE_FIELDS",
      "The save request contains fields outside the review contract."
    );
  }

  return {
    selfDeckSlug: requiredText(value.selfDeckSlug, "selfDeckSlug"),
    selfDeckSprites: parseSprites(value.selfDeckSprites, "selfDeckSprites"),
    opponentDeckSlug: requiredText(value.opponentDeckSlug, "opponentDeckSlug"),
    opponentDeckSprites: parseSprites(value.opponentDeckSprites, "opponentDeckSprites"),
    date: requireDate(value.date),
    format: requiredText(value.format, "format"),
    linkedDeckId: optionalText(value.linkedDeckId, "linkedDeckId"),
    linkedDeckListId: optionalText(value.linkedDeckListId, "linkedDeckListId"),
    matchNotes: optionalText(value.matchNotes, "matchNotes", 10_000)
  };
}

export function createBattleLogImportDraft(args: {
  id: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
  review: ParsedLogReview;
  format?: string;
}): BattleLogImportDraft {
  const id = requireOpaqueReference(args.id, "draftId");
  const userId = requireOpaqueReference(args.userId, "userId");
  const createdAt = requireTimestamp(args.createdAt, "createdAt");
  const expiresAt = requireTimestamp(args.expiresAt, "expiresAt");

  if (Date.parse(expiresAt) <= Date.parse(createdAt)) {
    throw new BattleLogImportDraftValidationError(
      "INVALID_EXPIRY",
      "A draft must expire after it is created."
    );
  }

  const review = args.review;
  const immutable = deepFreeze({
    selfPlayerName: review.selfPlayerName,
    opponentPlayerName: review.opponentPlayerName,
    result: review.result,
    goOrder: review.goOrder,
    coinTossWon: review.coinTossWon,
    language: review.language,
    rawLog: review.rawLog,
    sections: cloneSections(review.sections),
    totalTurns: review.totalTurns,
    selfPrizesTaken: review.selfPrizesTaken,
    opponentPrizesTaken: review.opponentPrizesTaken,
    selfAttackDamage: review.selfAttackDamage,
    opponentAttackDamage: review.opponentAttackDamage,
    selfMulligans: review.selfMulligans,
    opponentMulligans: review.opponentMulligans,
    reason: review.reason
  });

  const editable = parseEditableFields({
    selfDeckSlug: review.selfDeckSlug,
    selfDeckSprites: review.selfSprites,
    opponentDeckSlug: review.opponentDeckSlug,
    opponentDeckSprites: review.opponentSprites,
    date: review.date,
    format: args.format ?? "",
    linkedDeckId: null,
    linkedDeckListId: null,
    matchNotes: null
  });

  return {
    id,
    userId,
    createdAt,
    expiresAt,
    immutable,
    editable,
    consumed: null
  };
}

export function buildBattleLogImportReviewProjection(
  draft: BattleLogImportDraft
): BattleLogImportReviewProjection {
  return {
    draftId: draft.id,
    expiresAt: draft.expiresAt,
    immutable: cloneImmutable(draft.immutable),
    editable: cloneEditable(draft.editable)
  };
}

export function parseBattleLogImportSaveRequest(input: unknown): BattleLogImportSaveRequest {
  if (!isRecord(input)) {
    throw new BattleLogImportDraftValidationError(
      "INVALID_SAVE_IDENTITY",
      "The battle-log save request is invalid."
    );
  }

  const allowedFields = new Set(["draftId", "idempotencyKey", "editable"]);
  if (Object.keys(input).some((field) => !allowedFields.has(field))) {
    throw new BattleLogImportDraftValidationError(
      "INVALID_EDITABLE_FIELDS",
      "The save request contains fields outside the review contract."
    );
  }

  const draftId = requireOpaqueReference(input.draftId, "draftId");
  const idempotencyKey = requireOpaqueReference(input.idempotencyKey, "idempotencyKey");

  return {
    draftId,
    idempotencyKey,
    editable: parseEditableFields(input.editable)
  };
}

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalize(entry)).join(",")}]`;
  }

  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

export function buildBattleLogImportSaveFingerprint(request: BattleLogImportSaveRequest) {
  return canonicalize({
    draftId: request.draftId,
    editable: request.editable
  });
}

/**
 * Internal transition helper. Callers must pass a draft resolved from
 * server-owned state. A later server wrapper must resolve the opaque draftId
 * before calling this helper; client review projections are never authority.
 */
export function evaluateBattleLogImportDraftSave(args: {
  draft: BattleLogImportDraft | null;
  userId: string;
  request: BattleLogImportSaveRequest;
  now: string;
}): BattleLogImportDraftSaveDecision {
  if (!args.draft) {
    return {
      status: "rejected",
      code: "DRAFT_NOT_FOUND",
      message: "This battle-log review has expired or is unavailable. Import the complete log again."
    };
  }

  if (args.draft.userId !== args.userId) {
    return {
      status: "rejected",
      code: "DRAFT_ACCOUNT_MISMATCH",
      message: "This battle-log review belongs to a different account. Import the complete log again."
    };
  }

  if (args.draft.id !== args.request.draftId) {
    return {
      status: "rejected",
      code: "DRAFT_NOT_FOUND",
      message: "This battle-log review has expired or is unavailable. Import the complete log again."
    };
  }

  let now: string;
  try {
    now = requireTimestamp(args.now, "now");
  } catch {
    return {
      status: "rejected",
      code: "INVALID_SERVER_TIMESTAMP",
      message: "The server clock timestamp is invalid."
    };
  }

  const fingerprint = buildBattleLogImportSaveFingerprint(args.request);
  if (args.draft.consumed) {
    if (args.draft.consumed.idempotencyKey === args.request.idempotencyKey) {
      if (args.draft.consumed.fingerprint !== fingerprint) {
        return {
          status: "rejected",
          code: "IDEMPOTENCY_CONFLICT",
          message: "That save identity was already used with different review values."
        };
      }

      return {
        status: "replay",
        battleLogId: args.draft.consumed.battleLogId
      };
    }

    return {
      status: "rejected",
      code: "DRAFT_CONSUMED",
      message: "This battle-log review has already been saved."
    };
  }

  if (Date.parse(now) >= Date.parse(args.draft.expiresAt)) {
    return {
      status: "rejected",
      code: "DRAFT_EXPIRED",
      message: "This battle-log review has expired. Import the complete log again."
    };
  }

  return {
    status: "ready",
    fingerprint,
    draft: args.draft
  };
}

export function consumeBattleLogImportDraft(args: {
  draft: BattleLogImportDraft;
  userId: string;
  request: BattleLogImportSaveRequest;
  battleLogId: string;
  consumedAt: string;
}): BattleLogImportDraft {
  // Internal transition helper: `draft` must already be resolved from
  // server-owned state. A later server wrapper must resolve the opaque draftId
  // before calling this helper; client review projections are never authority.
  const decision = evaluateBattleLogImportDraftSave({
    draft: args.draft,
    userId: args.userId,
    request: args.request,
    now: args.consumedAt
  });

  if (decision.status === "replay") {
    return {
      ...args.draft,
      immutable: cloneImmutable(args.draft.immutable),
      editable: cloneEditable(args.draft.editable)
    };
  }

  if (decision.status !== "ready") {
    throw new BattleLogImportDraftValidationError(
      decision.code === "IDEMPOTENCY_CONFLICT"
        ? "INVALID_SAVE_IDENTITY"
        : decision.code === "INVALID_SERVER_TIMESTAMP"
          ? "INVALID_TIMESTAMP"
        : "INVALID_DRAFT_REFERENCE",
      decision.message
    );
  }

  return {
    ...args.draft,
    immutable: cloneImmutable(args.draft.immutable),
    editable: cloneEditable(args.draft.editable),
    consumed: {
      idempotencyKey: args.request.idempotencyKey,
      fingerprint: decision.fingerprint,
      battleLogId: requireOpaqueReference(args.battleLogId, "battleLogId"),
      consumedAt: requireTimestamp(args.consumedAt, "consumedAt")
    }
  };
}
