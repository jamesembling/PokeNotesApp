import type { ReplayCondition } from "./conditions";
import type { LogSection } from "@/types/index";

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
  hp: number | null;
  damage: number;
  abilityUsed?: boolean;
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

export type ReplayLogSource = {
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
