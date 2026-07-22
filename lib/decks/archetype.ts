import { compactMap } from "@/lib/array";
function normalizeSpriteSlug(value: string) {
  return String(value || "").trim().toLowerCase();
}

export function normalizeDeckArchetypeSprites(values: string[]) {
  return Array.from(
    new Set(
      compactMap(values, (value) => normalizeSpriteSlug(value))
    )
  ).sort((left, right) => left.localeCompare(right));
}

export function buildDeckArchetypeId(values: string[]) {
  const normalizedSprites = normalizeDeckArchetypeSprites(values);
  return normalizedSprites.join("+");
}
