import { getDeckSelectionOptionsByIds } from "@/lib/db/decks";
import type { BattleLogSummary, DeckSelectionOption } from "@/types/index";

type LogWindowWithSummaries = {
  logs: BattleLogSummary[];
};

function getLinkedDeckIds(logs: BattleLogSummary[]) {
  return Array.from(new Set(logs.map((log) => log.linkedDeckId).filter(Boolean) as string[]));
}

function attachLinkedDeckListNames(
  logs: BattleLogSummary[],
  userDecks: DeckSelectionOption[]
) {
  const deckOptionsById = new Map(userDecks.map((deck) => [deck.id, deck] as const));

  return logs.map((log) => {
    if (!log.linkedDeckId || !log.linkedDeckListId) {
      return log;
    }

    const deck = deckOptionsById.get(log.linkedDeckId);
    const linkedDeckList = deck?.deckLists.find((deckList) => deckList.id === log.linkedDeckListId);

    return {
      ...log,
      linkedDeckListName: linkedDeckList?.name
    };
  });
}

export async function hydrateLogWindowDeckListNames<TWindow extends LogWindowWithSummaries>(
  userId: string,
  window: TWindow
) {
  const linkedDecks = await getDeckSelectionOptionsByIds(userId, getLinkedDeckIds(window.logs));

  return {
    ...window,
    logs: attachLinkedDeckListNames(window.logs, linkedDecks)
  };
}
