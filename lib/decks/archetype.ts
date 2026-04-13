function normalizeSpriteSlug(value: string) {
  return String(value || "").trim().toLowerCase();
}

export function normalizeDeckArchetypeSprites(values: string[]) {
  return Array.from(
    new Set(
      values
        .map((value) => normalizeSpriteSlug(value))
        .filter(Boolean)
    )
  ).sort((left, right) => left.localeCompare(right));
}

export function buildDeckArchetypeId(values: string[]) {
  const normalizedSprites = normalizeDeckArchetypeSprites(values);
  return normalizedSprites.join("+");
}

export function deckArchetypeMatchesSprites(archetypeId: string, values: string[]) {
  return buildDeckArchetypeId(values) === String(archetypeId || "").trim().toLowerCase();
}
