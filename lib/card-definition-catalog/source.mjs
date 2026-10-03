/** TCGdex is a community-maintained source, not an official Pokémon rules authority. */
export function normalizeCardDefinitionName(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "'").toLowerCase().replace(/[^a-z0-9'+-]+/g, " ")
    .replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
}
const text = (value) => typeof value === "string" && value.trim() ? value.trim() : null;
const strings = (value) => Array.isArray(value) && value.every((v) => typeof v === "string") ? value : null;
function cardImageUrl(prefix) {
  if (typeof prefix !== "string" || prefix.includes("\\")) return undefined;
  try {
    const url = new URL(prefix);
    if (url.origin !== "https://assets.tcgdex.net" || url.username || url.password || url.search || url.hash
      || !/^\/en\/[^/]+\/[^/]+\/[^/]+$/.test(url.pathname)) return undefined;
    return `${url.href}/high.webp`;
  } catch { return undefined; }
}
export function normalizeTcgdexCard(card, set, syncedAt) {
  const localId = Number.isSafeInteger(card?.localId) && card.localId >= 0 ? String(card.localId) : text(card?.localId);
  if (!card || !text(card.id) || !text(card.name) || !localId || !text(set?.id) || card.set?.id !== set.id || !["Pokemon", "Trainer", "Energy"].includes(card.category)) {
    throw new Error("TCGdex returned an invalid card identity or category.");
  }
  const effects = (items, kind) => {
    if (items === undefined) return [];
    if (!Array.isArray(items) || items.some((item) => !item || typeof item !== "object")) throw new Error(`TCGdex returned malformed ${kind} for ${card.id}.`);
    return items;
  };
  const imageUrl = cardImageUrl(card.image);
  return {
    ...(imageUrl ? { imageUrl } : {}),
    source: "tcgdex", sourceCardId: card.id, name: card.name, setId: set.id, localId,
    setReleaseDate: text(set.releaseDate), hp: Number.isSafeInteger(card.hp) && card.hp > 0 ? card.hp : null,
    category: card.category, trainerType: text(card.trainerType), stage: text(card.stage), types: strings(card.types),
    evolvesFrom: text(card.evolveFrom), regulationMark: text(card.regulationMark),
    // Trainer/Energy effect is supplied verbatim. Generic ex/ACE SPEC rules are NOT fabricated.
    rules: text(card.effect) ? [card.effect] : strings(card.rules),
    abilities: effects(card.abilities, "abilities").map((a) => ({ name: text(a.name) ?? "", text: text(a.effect), type: text(a.type) })),
    attacks: effects(card.attacks, "attacks").map((a) => ({ name: text(a.name) ?? "", text: typeof a.effect === "string" ? a.effect : null,
      damage: typeof a.damage === "number" || typeof a.damage === "string" ? String(a.damage) : null, cost: strings(a.cost) })),
    sourceUrl: `https://api.tcgdex.net/v2/en/cards/${encodeURIComponent(card.id)}`,
    sourceUpdatedAt: text(card.updated), syncedAt
  };
}

export function isCardDefinition(card) {
  const nullableText = (v) => v === null || typeof v === "string";
  const nullableStrings = (v) => v === null || (Array.isArray(v) && v.every((item) => typeof item === "string"));
  return Boolean(card && card.source === "tcgdex" && ["sourceCardId", "name", "setId", "localId", "sourceUrl", "syncedAt"].every((k) => text(card[k]))
    && ["Pokemon", "Trainer", "Energy"].includes(card.category)
    && (card.hp === null || (Number.isSafeInteger(card.hp) && card.hp > 0))
    && ["setReleaseDate", "trainerType", "stage", "evolvesFrom", "regulationMark", "sourceUpdatedAt"].every((k) => nullableText(card[k]))
    && (card.effectProvenance === undefined || (card.effectProvenance
      && ["pokemontcg-historical", "reviewed-printing"].includes(card.effectProvenance.provider)
      && ["revision", "sourceCardId", "sourceUrl"].every((k) => text(card.effectProvenance[k]))
      && Array.isArray(card.effectProvenance.fields) && card.effectProvenance.fields.length > 0
      && card.effectProvenance.fields.every((field) => ["abilities", "attacks", "trainerType", "rules"].includes(field))
      && (card.effectProvenance.reviewUrl === undefined || text(card.effectProvenance.reviewUrl))))
    && (card.imageUrl === undefined || typeof card.imageUrl === "string" && card.imageUrl.endsWith("/high.webp")
      && cardImageUrl(card.imageUrl.slice(0, -10)) === card.imageUrl)
    && nullableStrings(card.types) && nullableStrings(card.rules)
    && Array.isArray(card.abilities) && card.abilities.every((a) => a && typeof a.name === "string" && nullableText(a.text) && nullableText(a.type))
    && Array.isArray(card.attacks) && card.attacks.every((a) => a && typeof a.name === "string" && nullableText(a.text) && nullableText(a.damage) && nullableStrings(a.cost)));
}
