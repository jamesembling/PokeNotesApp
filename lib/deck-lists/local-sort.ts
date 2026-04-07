import type { DeckCard } from "@/types/index";

const CATEGORY_ORDER: Record<string, number> = {
  pokemon: 0,
  trainer: 1,
  energy: 2
};

function getCategoryRank(card: DeckCard) {
  const normalizedCategory = String(card.category || "")
    .trim()
    .toLowerCase();

  return CATEGORY_ORDER[normalizedCategory] ?? 3;
}

export function sortDeckListCardsLocally(cards: DeckCard[]) {
  return [...cards].sort((left, right) => {
    const categoryDifference = getCategoryRank(left) - getCategoryRank(right);
    if (categoryDifference !== 0) {
      return categoryDifference;
    }

    if (left.count !== right.count) {
      return right.count - left.count;
    }

    const nameDifference = left.name.localeCompare(right.name);
    if (nameDifference !== 0) {
      return nameDifference;
    }

    const setDifference = left.set.localeCompare(right.set);
    if (setDifference !== 0) {
      return setDifference;
    }

    return left.number.localeCompare(right.number, undefined, {
      numeric: true,
      sensitivity: "base"
    });
  });
}
