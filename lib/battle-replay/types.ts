import type { ReplayCondition } from "./conditions";
import type { LogSection } from "@/types/index";
import type { CardDefinitionEvidenceByName } from "@/lib/card-definition-catalog/types";

export type ReplayActor = "self" | "opponent";
type HandCard = { id: string; name: string; imageUrl: string };

export type ReplayZoneCard = {
  id: string;
  name: string;
  imageUrl: string;
  artwork?: "representative";
};

export type ReplayCard = {
  id: string;
  name: string;
  imageUrl: string;
  /** Compatibility alias for effective maxHp, never printed HP. */
  hp: number | null;
  baseHp?: number | null;
  maxHp?: number | null;
  remainingHp?: number | null;
  damage: number;
  /** False when the accumulated total is not established by the source. */
  damageKnown?: boolean;
  abilityUsed?: boolean;
  /** Effects observed on this physical top card, never shared across namesakes. */
  observedEffects?: string[];
  conditions?: ReplayCondition[];
  energy: string[];
  underlying: ReplayZoneCard[];
  tool?: string;
};

export type ReplaySide = {
  name: string;
  active: ReplayCard | null;
  bench: ReplayCard[];
  deckCount: number | null;
  handCount: number | null;
  knownHand: HandCard[];
  discard: ReplayZoneCard[];
  prizesRemaining: number | null;
  itemLocked?: boolean;
  uncertainZones?: Array<"hand" | "deck" | "board" | "discard" | "prizes">;
};

export type ReplayState = {
  partial?: boolean;
  self: ReplaySide;
  opponent: ReplaySide;
  stadium: { name: string; imageUrl: string; actor: ReplayActor } | null;
  playedCard: {
    actor: ReplayActor;
    card: ReplayZoneCard;
  } | null;
};

export type ReplayTransactionStage = {
  kind: "play" | "ability" | "attack" | "before" | "damage" | "discard" | "find" | "draw" | "attach" | "move" | "shuffle" | "bench" | "evolve" | "return" | "heal" | "stadium";
  label: string;
  cards: ReplayZoneCard[];
  hiddenCount?: number;
  detail?: string;
  damageModifier?: {
    kind: "weakness";
    type: string;
    baseDamage: number;
    bonusDamage: number;
    multiplier?: number;
  };
  scope?: "both";
  actorCounts?: Partial<Record<ReplayActor, number>>;
  actorCards?: Partial<Record<ReplayActor, ReplayZoneCard[]>>;
  targetResolved?: boolean;
  actor?: ReplayActor;
};

export type ReplayTransaction = {
  actor: ReplayActor;
  title: string;
  stages: ReplayTransactionStage[];
};

export type ReplayEvent = {
  actor: ReplayActor;
  sourceSectionIndex: number;
  label: string;
  sourceTitle: string;
  sourceDetails: string[];
  summary: string;
  turn: number;
  transaction?: ReplayTransaction;
  unresolved?: string[];
};

export type ReplayEffectKind = "ability" | "attack" | "item" | "supporter" | "tool" | "stadium";

export type ReplayLogSource = {
  /** Complete printing candidates resolved independently from representative artwork. */
  cardDefinitions?: CardDefinitionEvidenceByName;
  /** Unambiguous catalog evidence keyed by the exact original title/detail. */
  effectTags?: Record<string, ReplayEffectKind>;
  /** Origins established by validated effect text, never inferred from a card name. */
  effectOrigins?: Record<string, "hand" | "deck" | "discard">;
  /** Context-specific detail evidence keyed by zero-based actionIndex:detailIndex. */
  effectDetailOrigins?: Record<string, "hand" | "deck" | "discard">;
  id: string;
  date: string;
  result: string;
  format: string;
  selfPlayerName: string;
  opponentPlayerName: string;
  selfDeckName: string;
  opponentDeckName: string;
  selfPrizesTaken: number;
  opponentPrizesTaken: number;
  totalTurns: number;
  sections: LogSection[];
};

export type ReplayProgram = {
  id: string;
  label: string;
  source: {
    logId: string;
    playedOn: string;
    result: string;
    format: string;
    selfDeck: string;
    opponentDeck: string;
    selfPrizesTaken: number;
    opponentPrizesTaken: number;
    turns: number;
  };
  events: ReplayEvent[];
  frames: ReplayState[];
  diagnostics: {
    evidencedActions: number;
    unresolvedMutations: number;
    unresolvedActions: number[];
    messages: string[];
  };
  status: "supported" | "partial" | "unsupported";
};
