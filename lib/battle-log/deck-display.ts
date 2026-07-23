import { compactMap } from "@/lib/array";

export function prettifyPokemonSlug(slug: string) {
  const parts = slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1));

  const megaIndex = parts.findIndex((part) => part === "Mega");
  if (megaIndex >= 0) {
    const megaParts = parts.filter((part) => part !== "Mega");
    return ["Mega", ...megaParts].join(" ");
  }

  return parts.join(" ");
}

function getVisibleSprites(sprites: string[]) {
  return Array.from(
    new Set(
      compactMap(sprites, (sprite) => String(sprite || "").trim())
    )
  );
}

export function getBattleLogSpriteDisplayName(sprites: string[], separator = " / ") {
  const visibleSprites = getVisibleSprites(sprites);

  if (visibleSprites.length === 0) {
    return "";
  }

  return visibleSprites.map(prettifyPokemonSlug).join(separator);
}

export function getBattleLogDeckDisplayName(deckName: string, sprites: string[]) {
  const normalizedDeckName = String(deckName || "").trim();

  if (normalizedDeckName && normalizedDeckName.toLowerCase() !== "unknown deck") {
    return normalizedDeckName;
  }

  const spriteDisplayName = getBattleLogSpriteDisplayName(sprites);
  if (spriteDisplayName) {
    return spriteDisplayName;
  }

  return "Unknown Deck";
}

export function getBattleLogOpponentDisplayName(deckName: string, sprites: string[]) {
  const spriteDisplayName = getBattleLogSpriteDisplayName(sprites, "/");
  if (spriteDisplayName) {
    return spriteDisplayName;
  }

  return getBattleLogDeckDisplayName(deckName, sprites);
}
