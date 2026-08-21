import { getDeckSelectionOptionsByIds } from "@/lib/db/decks";
import { getDeckListSelectionOptions } from "@/lib/db/deck-lists";
import { resolveDeckListName } from "@/lib/deck-lists/resolve-name";
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
  const options: DeckListSelectionOption[] = [
    ...accountDeckLists,
    ...userDecks.flatMap((deck) =>
      deck.deckLists.map((deckList) => ({
        id: deckList.id,
        name: deckList.name,
        deckId: deck.id,
        deckName: deck.deckName
      }))
    )
  ];

  return logs.map((log) => {
    if (!log.linkedDeckListId) {
      return log;
    }

    return {
      ...log,
      linkedDeckListName:
        resolveDeckListName(options, log.linkedDeckId, log.linkedDeckListId) ??
        log.linkedDeckListName
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
