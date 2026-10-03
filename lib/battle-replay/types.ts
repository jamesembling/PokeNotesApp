import type { ReplayCondition } from "./conditions";
import type { LogSection } from "@/types/index";
import type { CardDefinition, CardDefinitionEvidence, CardDefinitionEvidenceByName } from "@/lib/card-definition-catalog/types";
import type { ReplayLinkedCardDefinitions } from "./linked-deck-list";

export type ReplayActor = "self" | "opponent";
type HandCard = ReplayZoneCard;

/** One entry per evidence query, shared by frames and preview surfaces. */
export type ReplayCardResolution = Pick<CardDefinitionEvidence, "coverage" | "generation" | "resolution" | "candidatePrintingIds" | "selectedPrinting" | "displayBasis" | "agreedFacts" | "formatBasis"> & {
  name: string;
  selectedDefinition: CardDefinition | null;
  evidenceBasis?: "linked_deck_list";
  printedHp?: number | null;
  hpBasis?: "known" | "probable" | "unknown";
  probableHpBasis?: "linked_deck_list" | "latest_format_candidate";
  artworkSource?: { provider: "limitless"; sourceUrl: string };
};

export type ReplayZoneCard = {
  id: string;
  name: string;
  imageUrl: string;
  artwork?: "representative";
  definitionKey?: string;
  setId?: string;
  localId?: string;
  observedEffects?: string[];
  definitionOwner?: ReplayActor;
  /** Recorded in-play component role; used when its catalogue entry is absent. */
  boardRole?: "tool" | "energy" | "evolution";
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
  /** Probable is a catalogue choice, never proof of the played printing. */
  hpBasis?: "known" | "probable" | "unknown";
  damage: number;
  /** A visible baseline whose recorded attachment effect is not verified. */
  hpModifierBasis?: "unverified_attachment";
  /** False when the accumulated total is not established by the source. */
  damageKnown?: boolean;
  /** A recorded top card whose physical copy cannot be assigned safely. */
  instanceUncertain?: boolean;
  /** A recorded HP-changing attachment has unresolved assignment to this copy. */
  hpModifierUncertain?: boolean;
  /** Independently known physical total, retained across copy-fact uncertainty. */
  knownStackSize?: number;
  abilityUsed?: boolean;
  /** Effects observed on this physical top card, never shared across namesakes. */
  observedEffects?: string[];
  conditions?: ReplayCondition[];
  energy: string[];
  underlying: ReplayZoneCard[];
  tool?: string;
  definitionKey?: string;
  setId?: string;
  localId?: string;
  definitionOwner?: ReplayActor;
};

/** Physical components in play whose assignment to namesake copies is unresolved.
 * Member evidence refers to the original tops and does not add physical cards. */
export type ReplayBoardPool = {
  id: string;
  memberIds: string[];
  cards: ReplayZoneCard[];
  memberEvidence?: ReplayZoneCard[];
  /** Recorded Evolution components whose location is either in play or in
   * their owner's hand. Excluded from confirmed board inventory and knownHand. */
  possiblyReturnedCards?: ReplayZoneCard[];
};

export type ReplaySide = {
  name: string;
  active: ReplayCard | null;
  bench: ReplayCard[];
  /** Surviving top cards evidenced in play, without a resolved Active/Bench position. */
  unplaced?: ReplayCard[];
  boardPools?: ReplayBoardPool[];
  activeUncertain?: boolean;
  /** False only when unseen board/attachment facts can change HP modifiers. */
  hpModifiersKnown?: boolean;
  deckCount: number | null;
  handCount: number | null;
  /** Physical cards in play, including evolution cards, attachments and owned Stadiums. */
  inPlayCount?: number | null;
  /** Whole pile size; discard contains only evidenced card identities. */
  discardCount?: number | null;
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
  stadium: { name: string; imageUrl: string; actor: ReplayActor; definitionKey?: string } | null;
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
  turnActor?: ReplayActor;
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
  /** User-selected owner list; it never constrains the opponent's printings. */
  selfCardDefinitions?: ReplayLinkedCardDefinitions;
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
  cardResolutions?: Record<string, ReplayCardResolution>;
};
