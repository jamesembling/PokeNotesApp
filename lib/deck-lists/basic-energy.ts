import type { DeckCard } from "@/types/index";

const BASIC_ENERGY_NAMES_BY_SYMBOL: Record<string, string> = {
  G: "Grass",
  R: "Fire",
  W: "Water",
  L: "Lightning",
  P: "Psychic",
  F: "Fighting",
  D: "Darkness",
  M: "Metal",
  Y: "Fairy"
};

const BASIC_ENERGY_NAMES = new Map(
  Object.values(BASIC_ENERGY_NAMES_BY_SYMBOL).map((name) => [name.toLowerCase(), name])
);

function getBasicEnergyName(value: string) {
  const trimmed = String(value ?? "").trim();
  const symbolMatch = trimmed.match(/^(?:basic\s+)?\{([A-Z])\}\s+energy$/i);

  if (symbolMatch) {
    return BASIC_ENERGY_NAMES_BY_SYMBOL[symbolMatch[1].toUpperCase()] ?? null;
  }

  const namedMatch = trimmed.match(/^(?:basic\s+)?(.+?)\s+energy$/i);
  if (!namedMatch) {
    return null;
  }

  return BASIC_ENERGY_NAMES.get(namedMatch[1].toLowerCase()) ?? null;
}

function isEnergyCard(card: DeckCard) {
  return String(card.category ?? "").trim().toLowerCase() === "energy";
}

export function normalizeDeckListCardNameForLookup(value: string) {
  const basicEnergyName = getBasicEnergyName(value);
  return basicEnergyName ? `${basicEnergyName} Energy` : String(value ?? "").trim();
}

export function prepareDeckListVisualCards(cards: DeckCard[]) {
  const combinedCards: DeckCard[] = [];
  const basicEnergyByName = new Map<string, DeckCard>();

  cards.forEach((card) => {
    const basicEnergyName = isEnergyCard(card) ? getBasicEnergyName(card.name) : null;
    if (!basicEnergyName) {
      combinedCards.push(card);
      return;
    }

    const key = basicEnergyName.toLowerCase();
    const existingCard = basicEnergyByName.get(key);
    if (existingCard) {
      existingCard.count += card.count;
      return;
    }

    const nextCard = { ...card };
    basicEnergyByName.set(key, nextCard);
    combinedCards.push(nextCard);
  });

  const sortedEnergyCards = combinedCards
    .filter(isEnergyCard)
    .toSorted((left, right) => right.count - left.count);
  let energyIndex = 0;

  return combinedCards.map((card) =>
    isEnergyCard(card) ? sortedEnergyCards[energyIndex++] : card
  );
}
