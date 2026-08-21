import { getDeckSelectionOptionsByIds } from "@/lib/db/decks";
import { getDeckListSelectionOptions } from "@/lib/db/deck-lists";
import type { BattleLogSummary, DeckSelectionOption } from "@/types/index";
import type { DeckListSelectionOption } from "@/types/index";
import { compactMap } from "@/lib/array";

type LogWindowWithSummaries = {
  logs: BattleLogSummary[];
};

function getLinkedDeckIds(logs: BattleLogSummary[]) {
  return Array.from(new Set(compactMap(logs, (log) => log.linkedDeckId) as string[]));
}

function attachLinkedDeckListNames(
  logs: BattleLogSummary[],
  userDecks: DeckSelectionOption[],
  accountDeckLists: DeckListSelectionOption[]
) {
  const deckListNamesByKey = new Map<string, string>();
  const deckListNamesById = new Map<string, string>();

  accountDeckLists.forEach((deckList) => {
    deckListNamesById.set(deckList.id, deckList.name);
  });

  userDecks.forEach((deck) => {
    deck.deckLists.forEach((deckList) => {
      deckListNamesByKey.set(`${deck.id}:${deckList.id}`, deckList.name);
    });
  });

  return logs.map((log) => {
    if (!log.linkedDeckListId) {
      return log;
    }

    return {
      ...log,
      linkedDeckListName: log.linkedDeckId
        ? deckListNamesByKey.get(`${log.linkedDeckId}:${log.linkedDeckListId}`) ??
          log.linkedDeckListName
        : deckListNamesById.get(log.linkedDeckListId) ?? log.linkedDeckListName
    };
  });
}

export async function hydrateLogWindowDeckListNames<TWindow extends LogWindowWithSummaries>(
  userId: string,
  window: TWindow
) {
  const [linkedDecks, accountDeckLists] = await Promise.all([
    getDeckSelectionOptionsByIds(userId, getLinkedDeckIds(window.logs)),
    getDeckListSelectionOptions(userId)
  ]);

  return {
    ...window,
    logs: attachLinkedDeckListNames(window.logs, linkedDecks, accountDeckLists)
  };
}
