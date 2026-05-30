import { getDeckSelectionOptionsByIds } from "@/lib/db/decks";
import type { BattleLogSummary, DeckSelectionOption } from "@/types/index";
import { compactMap } from "@/lib/array";

type LogWindowWithSummaries = {
  logs: BattleLogSummary[];
};

function getLinkedDeckIds(logs: BattleLogSummary[]) {
  return Array.from(new Set(compactMap(logs, (log) => log.linkedDeckId) as string[]));
}

function attachLinkedDeckListNames(
  logs: BattleLogSummary[],
  userDecks: DeckSelectionOption[]
) {
  const deckListNamesByKey = new Map<string, string>();

  userDecks.forEach((deck) => {
    deck.deckLists.forEach((deckList) => {
      deckListNamesByKey.set(`${deck.id}:${deckList.id}`, deckList.name);
    });
  });

  return logs.map((log) => {
    if (!log.linkedDeckId || !log.linkedDeckListId) {
      return log;
    }

    return {
      ...log,
      linkedDeckListName: deckListNamesByKey.get(`${log.linkedDeckId}:${log.linkedDeckListId}`)
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
