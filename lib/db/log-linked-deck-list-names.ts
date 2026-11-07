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

/**
 * Accepts the window or a pending window: the account Deck List read does not
 * depend on it, so it starts immediately instead of after the window resolves.
 */
export async function hydrateLogWindowDeckListNames<TWindow extends LogWindowWithSummaries>(
  userId: string,
  windowOrPromise: TWindow | Promise<TWindow>
) {
  const accountDeckListsPromise = getDeckListSelectionOptions(userId);
  // Mark handled so a failed window read does not also surface as an
  // unhandled rejection; the result is still awaited below.
  accountDeckListsPromise.catch(() => undefined);
  const window = await windowOrPromise;
  const [linkedDecks, accountDeckLists] = await Promise.all([
    getDeckSelectionOptionsByIds(userId, getLinkedDeckIds(window.logs)),
    accountDeckListsPromise
  ]);

  return {
    ...window,
    logs: attachLinkedDeckListNames(window.logs, linkedDecks, accountDeckLists)
  };
}
