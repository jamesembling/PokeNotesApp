type DeckListRpcError = {
  code?: unknown;
  details?: unknown;
  hint?: unknown;
  message?: unknown;
};

function readError(error: unknown): DeckListRpcError | null {
  return error && typeof error === "object" ? (error as DeckListRpcError) : null;
}

function errorText(error: unknown) {
  const candidate = readError(error);
  return [candidate?.message, candidate?.details, candidate?.hint]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
}

export function isDeckListStaleVersionError(error: unknown) {
  const candidate = readError(error);
  if (String(candidate?.code || "") !== "P0001") {
    return false;
  }

  return /deck list (?:association )?changed; refresh-and-retry/i.test(errorText(error));
}

export function getDeckListStaleVersionMessage(error: unknown) {
  const text = errorText(error);
  return /association changed/i.test(text)
    ? "This Deck List association changed in another tab. Refresh the Deck List and try again."
    : "This Deck List changed in another tab. Refresh the Deck List and try again.";
}
