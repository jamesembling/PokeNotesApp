import { sortDeckListCardsLocally } from "@/lib/deck-lists/local-sort";
import { interpretDeckList } from "@/lib/decks/deck-list-parse";
import type {
  BattleLogSharePayload,
  PublicBattleLog
} from "@/lib/db/log-shares";
import type { BattleLog, DeckCard } from "@/types/index";

export type BattleLogDetailProjection = {
  linkedDeckList: {
    format?: string;
    name?: string;
    notes?: string;
    rawList?: string;
    sortedCards: DeckCard[];
  };
  linkedStrategyLabel: string;
  log: BattleLog;
  privacy: "owner" | "public";
};

export function projectOwnerBattleLogDetail(args: {
  linkedDeckList?: BattleLogDetailProjection["linkedDeckList"];
  linkedStrategyLabel: string;
  log: BattleLog;
}): BattleLogDetailProjection {
  return {
    linkedDeckList: args.linkedDeckList ?? { sortedCards: [] },
    linkedStrategyLabel: args.linkedStrategyLabel,
    log: args.log,
    privacy: "owner"
  };
}

function projectPublicLog(log: PublicBattleLog): BattleLog {
  return {
    ...log,
    matchNotes: null
  };
}

export function projectPublicBattleLogDetail(
  payload: BattleLogSharePayload
): BattleLogDetailProjection {
  const sortedCards =
    payload.linkedDeckListSortedCards && payload.linkedDeckListSortedCards.length > 0
      ? payload.linkedDeckListSortedCards
      : payload.linkedDeckListRawList?.trim()
        ? sortDeckListCardsLocally(interpretDeckList(payload.linkedDeckListRawList).cards)
        : [];

  return {
    linkedDeckList: {
      format: payload.linkedDeckListFormat,
      name: payload.linkedDeckListName,
      notes: payload.linkedDeckListNotes,
      rawList: payload.linkedDeckListRawList,
      sortedCards
    },
    linkedStrategyLabel: payload.linkedStrategyLabel,
    log: projectPublicLog(payload.log),
    privacy: "public"
  };
}
