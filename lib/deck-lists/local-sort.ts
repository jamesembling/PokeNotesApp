import type { DeckCard } from "@/types/index";

const CATEGORY_ORDER: Record<string, number> = {
  pokemon: 0,
  trainer: 1,
  energy: 2
};

const TRAINER_TYPE_ORDER: Record<string, number> = {
  supporter: 0,
  item: 1,
  tool: 2,
  stadium: 3
};

function getCategoryRank(card: DeckCard) {
  const normalizedCategory = String(card.category || "")
    .trim()
    .toLowerCase();

  return CATEGORY_ORDER[normalizedCategory] ?? 3;
}

function getTrainerTypeRank(card: DeckCard) {
  const normalizedTrainerType = String(card.trainerType || "")
    .trim()
    .toLowerCase();

  return TRAINER_TYPE_ORDER[normalizedTrainerType] ?? 4;
}

export function hasCanonicalDeckListVisualGrouping(cards: DeckCard[]) {
  let previousCategoryRank = -1;
  let previousTrainerTypeRank = -1;

  for (const card of cards) {
    const categoryRank = getCategoryRank(card);
    if (categoryRank < previousCategoryRank) {
      return false;
    }

    if (categoryRank !== previousCategoryRank) {
      previousCategoryRank = categoryRank;
      previousTrainerTypeRank = -1;
    }

    if (String(card.category || "").trim().toLowerCase() !== "trainer") {
      continue;
    }

    const trainerTypeRank = getTrainerTypeRank(card);
    if (trainerTypeRank < previousTrainerTypeRank) {
      return false;
    }

    previousTrainerTypeRank = trainerTypeRank;
  }

  return true;
}

export function sortDeckListCardsLocally(cards: DeckCard[]) {
  return cards.toSorted((left, right) => {
    const categoryDifference = getCategoryRank(left) - getCategoryRank(right);
    if (categoryDifference !== 0) {
      return categoryDifference;
    }

    if (getCategoryRank(left) === CATEGORY_ORDER.trainer) {
      const trainerTypeDifference = getTrainerTypeRank(left) - getTrainerTypeRank(right);
      if (trainerTypeDifference !== 0) {
        return trainerTypeDifference;
      }
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
