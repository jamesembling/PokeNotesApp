import { getDeckSelectionOptionsByIds } from "@/lib/db/decks";
import { getDeckListSelectionOptions } from "@/lib/db/deck-lists";
import {
  composeDeckListNameOptions,
  resolveDeckListName
} from "@/lib/deck-lists/resolve-name";
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
  const options = composeDeckListNameOptions(accountDeckLists, userDecks);

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
