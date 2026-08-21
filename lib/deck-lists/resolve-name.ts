import type {
  DeckListSelectionOption,
  DeckSelectionOption
} from "@/types/index";

function nameOptionIdentity(option: DeckListSelectionOption) {
  return [
    option.source ?? "legacy",
    option.id,
    option.deckId ?? null,
    option.name,
    option.deckName ?? null
  ].join("\u0000");
}

/**
 * Compose account-owned relational/legacy options with the strategy payload
 * used by older callers. The account option list already contains any legacy
 * fallback, so an identical raw strategy copy is only a duplicate transport
 * representation. Distinct names or identities remain separate so genuine
 * legacy ambiguity still fails closed in resolveDeckListName.
 */
export function composeDeckListNameOptions(
  accountDeckLists: DeckListSelectionOption[],
  userDecks: DeckSelectionOption[]
) {
  const options = [...accountDeckLists];
  const accountOptionIdentities = new Set(accountDeckLists.map(nameOptionIdentity));

  for (const deck of userDecks) {
    for (const deckList of deck.deckLists) {
      const option: DeckListSelectionOption = {
        deckId: deck.id,
        deckName: deck.deckName,
        id: deckList.id,
        name: deckList.name,
        source: "legacy"
      };
      if (!accountOptionIdentities.has(nameOptionIdentity(option))) {
        options.push(option);
      }
    }
  }

  return options;
}

/**
 * Resolve a display name using the same composite identity as a persisted
 * reference. Exact legacy identity wins because it is the only safe fallback
 * for an ADR 0001 reference. If it is absent or ambiguous, an account-owned
 * relational row may satisfy the list id independently of its current
 * strategy association.
 */
export function resolveDeckListName(
  options: DeckListSelectionOption[],
  linkedDeckId: string | null | undefined,
  linkedDeckListId: string | null | undefined
) {
  const listId = String(linkedDeckListId || "").trim();
  if (!listId) {
    return undefined;
  }

  const strategyId = String(linkedDeckId || "").trim() || null;
  const matching = options.filter((option) => option.id === listId);
  const exactLegacy = matching.filter(
    (option) => option.source === "legacy" && option.deckId === strategyId
  );
  const relational = matching.filter((option) => option.source === "relational");

  if (exactLegacy.length === 1) {
    return exactLegacy[0]?.name;
  }

  if (relational.length === 1) {
    return relational[0]?.name;
  }

  // Options created before provenance was exposed still carry the composite
  // identity. Preserve that behavior, but never guess among multiple rows.
  if (exactLegacy.length === 0) {
    const exact = matching.filter(
      (option) => !option.source && option.deckId === strategyId
    );
    if (exact.length === 1) {
      return exact[0]?.name;
    }
  }

  if (matching.length === 1 && !matching[0]?.source) {
    return matching[0]?.name;
  }

  return undefined;
}
