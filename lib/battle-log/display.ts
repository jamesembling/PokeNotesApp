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

export function getBattleLogDeckDisplayName(deckName: string, sprites: string[]) {
  const normalizedDeckName = String(deckName || "").trim();

  if (normalizedDeckName && normalizedDeckName.toLowerCase() !== "unknown deck") {
    return normalizedDeckName;
  }

  const visibleSprites = Array.from(
    new Set(
      sprites
        .map((sprite) => String(sprite || "").trim())
        .filter(Boolean)
    )
  );

  if (visibleSprites.length > 0) {
    return visibleSprites.map(prettifyPokemonSlug).join(" / ");
  }

  return "Unknown Deck";
}
