import {
  getDeckListCategoryFromLine,
  isDeckListSummaryLine,
  parseDeckListCountLine,
  parseLines,
  splitDeckListDescription
} from "@/lib/decks/deck-list-parse";
import { normalizeLimitlessSetCode } from "@/lib/deck-lists/limitless";
import type { DeckCard, PokemonStage } from "@/types/index";
import {
  POKEMON_STAGE_COUNT,
  POKEMON_STAGE_MAP,
  POKEMON_VARIANT_STAGE_MAP
} from "@/lib/probability-calculator/stages";
import { getPokemonSpriteUrl as getSharedPokemonSpriteUrl } from "@/lib/pokemon/sprites";
import type { PokemonOption } from "@/types/index";

export const DECK_SIZE = 60;
export const OPENING_HAND = 7;
export const PRIZE_COUNT = 6;
const EXPECTED_STAGE_COUNT = 1025;
const logFactorialCache = [0];

export type CalculatorCardCategory = "Pokemon" | "Trainer" | "Energy";

export type CalculatorCard = Omit<DeckCard, "category"> & {
  category: CalculatorCardCategory;
  stage?: PokemonStage;
};

export type CalculatorTotals = {
  Pokemon: number;
  Trainer: number;
  Energy: number;
  deck: number;
};

export type CalculatorCardGroup = {
  category: CalculatorCardCategory;
  name: string;
  count: number;
  basicCount: number;
  stage?: PokemonStage;
  stageCounts: Record<PokemonStage, number>;
};

export type MulliganRow = {
  streak: number;
  exactThenPlayable: number;
  atLeast: number;
};

export type SetupRow = {
  card: CalculatorCardGroup;
  inStartingSeven: number;
  onlyStarter: number;
};

export type PrizingRow = {
  card: CalculatorCardGroup;
  nonePrized: number;
  onePrized: number;
  twoPrized: number;
  threePlusPrized: number;
};

export type CalculatorAnalysis = {
  cards: CalculatorCard[];
  totals: CalculatorTotals;
  warnings: string[];
  stageEntryCount: number;
  basicPokemonCount: number;
  mulliganProbability: number;
  exactlyOneBasicProbability: number;
  twoOrMoreBasicsProbability: number;
  mulliganRows: MulliganRow[];
  setupRows: SetupRow[];
  prizingRows: PrizingRow[];
};

type CardImageSize = "XS" | "SM";

export function analyzeDecklist(input: string): CalculatorAnalysis {
  const cards = parseCalculatorDecklist(input);
  const totals = computeTotals(cards);
  const warnings = buildWarnings(cards, totals, input);
  const basicPokemonCount = computeBasicPokemonCount(cards);
  const mulliganProbability = hypergeom(DECK_SIZE, basicPokemonCount, OPENING_HAND, 0);
  const exactlyOneBasicRaw = hypergeom(DECK_SIZE, basicPokemonCount, OPENING_HAND, 1);
  const twoOrMoreBasicsRaw = clamp01(1 - mulliganProbability - exactlyOneBasicRaw);
  const exactlyOneBasicProbability = conditionalOnNonMulligan(
    exactlyOneBasicRaw,
    mulliganProbability
  );
  const twoOrMoreBasicsProbability = conditionalOnNonMulligan(
    twoOrMoreBasicsRaw,
    mulliganProbability
  );

  const mulliganRows = [1, 2, 3, 4].map((streak) => ({
    streak,
    atLeast: Math.pow(mulliganProbability, streak),
    exactThenPlayable: Math.pow(mulliganProbability, streak) * clamp01(1 - mulliganProbability)
  }));

  const pokemonCards = aggregateCardsByName(cards.filter((card) => card.category === "Pokemon"));
  const setupRows = pokemonCards.map((card) => {
    const rawOnlyStarter = probabilityOnlyStarterCount(card.basicCount, basicPokemonCount);

    return {
      card,
      inStartingSeven: probabilityCardInPlayableOpeningHand(
        card.count,
        card.basicCount,
        basicPokemonCount
      ),
      onlyStarter: conditionalOnNonMulligan(rawOnlyStarter, mulliganProbability)
    };
  });

  const prizingRows = aggregateCardsByName(cards).map((card) => {
    const maxPrizable = Math.min(card.count, PRIZE_COUNT);
    let threePlusPrized = 0;

    for (let prizedCount = 3; prizedCount <= maxPrizable; prizedCount += 1) {
      threePlusPrized += hypergeom(DECK_SIZE, card.count, PRIZE_COUNT, prizedCount);
    }

    return {
      card,
      nonePrized: hypergeom(DECK_SIZE, card.count, PRIZE_COUNT, 0),
      onePrized: hypergeom(DECK_SIZE, card.count, PRIZE_COUNT, 1),
      twoPrized: hypergeom(DECK_SIZE, card.count, PRIZE_COUNT, 2),
      threePlusPrized
    };
  });

  return {
    cards,
    totals,
    warnings,
    stageEntryCount: POKEMON_STAGE_COUNT,
    basicPokemonCount,
    mulliganProbability,
    exactlyOneBasicProbability,
    twoOrMoreBasicsProbability,
    mulliganRows,
    setupRows,
    prizingRows
  };
}

export function pct(value: number) {
  const clamped = clamp01(value);
  const percent = clamped * 100;

  if (clamped === 0) {
    return "0.00%";
  }
  if (clamped === 1) {
    return "100.00%";
  }
  if (percent < 0.01) {
    return "<0.01%";
  }
  if (percent > 99.99) {
    return ">99.99%";
  }

  return `${percent.toFixed(2)}%`;
}

export function buildLimitlessCardUrl(card: Pick<DeckCard, "set" | "number">) {
  return `https://limitlesstcg.com/cards/${normalizeLimitlessSetCode(card.set)}/${card.number}`;
}

export function buildCardImageUrlFromValues(
  set: string,
  number: string,
  size: CardImageSize = "XS",
  withRarity = true
) {
  const cleanSet = normalizeLimitlessSetCode(set);
  const cleanNumber = formatCardNumberForImage(number);
  const raritySegment = withRarity ? "_R" : "";

  return `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/${cleanSet}/${cleanSet}_${cleanNumber}${raritySegment}_EN_${size}.png`;
}

export function getPokemonSpriteUrl(name: string, pokemonOptions?: PokemonOption[]) {
  return getSharedPokemonSpriteUrl(name, pokemonOptions);
}

function parseCalculatorDecklist(input: string) {
  const cards: CalculatorCard[] = [];
  let currentCategory: CalculatorCardCategory | null = null;

  parseLines(input).forEach((line) => {
    const category = getDeckListCategoryFromLine(line);
    if (category) {
      currentCategory = category as CalculatorCardCategory;
      return;
    }

    if (!currentCategory) {
      return;
    }

    const parsedLine = parseDeckListCountLine(line);
    if (!parsedLine) {
      return;
    }

    const { name, set, number } = splitDeckListDescription(parsedLine.description);
    if (!name || !set || !number) {
      return;
    }

    const card: CalculatorCard = {
      count: parsedLine.count,
      name,
      set,
      number,
      category: currentCategory
    };

    if (currentCategory === "Pokemon") {
      card.stage = resolvePokemonStage(name);
    }

    cards.push(card);
  });

  return cards;
}

function computeTotals(cards: CalculatorCard[]): CalculatorTotals {
  return cards.reduce<CalculatorTotals>(
    (totals, card) => {
      totals[card.category] += card.count;
      totals.deck += card.count;
      return totals;
    },
    {
      Pokemon: 0,
      Trainer: 0,
      Energy: 0,
      deck: 0
    }
  );
}

function buildWarnings(cards: CalculatorCard[], totals: CalculatorTotals, input: string) {
  const warnings: string[] = [];
  let malformedLines = 0;
  let currentCategory: CalculatorCardCategory | null = null;

  parseLines(input).forEach((line) => {
    const category = getDeckListCategoryFromLine(line);
    if (category) {
      currentCategory = category as CalculatorCardCategory;
      return;
    }

    if (!currentCategory) {
      return;
    }

    if (isDeckListSummaryLine(line)) {
      return;
    }

    const parsedLine = parseDeckListCountLine(line);
    if (!parsedLine) {
      malformedLines += 1;
      return;
    }

    const { name, set, number } = splitDeckListDescription(parsedLine.description);
    if (!name || !set || !number) {
      malformedLines += 1;
    }
  });

  if (malformedLines > 0) {
    warnings.push(
      `Skipped ${malformedLines} malformed card line${malformedLines === 1 ? "" : "s"}.`
    );
  }
  if (cards.length === 0) {
    warnings.push(
      "No parseable cards found. Include category headers and card lines in Limitless format."
    );
  }
  if (totals.deck !== DECK_SIZE) {
    warnings.push(
      `Deck count is ${totals.deck}; expected ${DECK_SIZE}. Calculations still assume a ${DECK_SIZE}-card deck.`
    );
  }
  if (POKEMON_STAGE_COUNT !== EXPECTED_STAGE_COUNT) {
    warnings.push(
      `Stage DB loaded ${POKEMON_STAGE_COUNT} entries; expected ${EXPECTED_STAGE_COUNT}.`
    );
  }

  return warnings;
}

function deriveInitialStage(name: string): PokemonStage {
  const text = String(name).trim();

  if (/^Stage\s*1\b/i.test(text)) {
    return "Stage 1";
  }
  if (/^Stage\s*2\b/i.test(text)) {
    return "Stage 2";
  }

  return "Basic";
}

function preferredPokemonStage(stageCounts: Record<PokemonStage, number>): PokemonStage {
  const order: PokemonStage[] = ["Stage 2", "Stage 1", "Basic"];
  let bestStage: PokemonStage = "Basic";
  let bestCount = -1;

  order.forEach((stage) => {
    const count = stageCounts[stage] ?? 0;
    if (count > bestCount) {
      bestStage = stage;
      bestCount = count;
    }
  });

  return bestStage;
}

function normalizePokemonNameKey(name: string) {
  const base = String(name || "")
    .normalize("NFKC")
    .replace(/^Stage\s*[12]\s+/i, "")
    .replace(/^Basic\s+/i, "")
    .replace(/\b(ex|gx|vmax|vstar|v-union|v)\b/gi, " ")
    .replace(/[’']/g, "")
    .replace(/\./g, " ")
    .replace(/:/g, " ")
    .replace(/♀/g, " f ")
    .replace(/♂/g, " m ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  if (!base) {
    return "";
  }

  const explicitMap: Record<string, string> = {
    "mr mime": "mr-mime",
    "mr rime": "mr-rime",
    "mime jr": "mime-jr",
    "type null": "type-null",
    "ho oh": "ho-oh",
    "porygon z": "porygon-z",
    "jangmo o": "jangmo-o",
    "hakamo o": "hakamo-o",
    "kommo o": "kommo-o",
    "wo chien": "wo-chien",
    "chien pao": "chien-pao",
    "ting lu": "ting-lu",
    "chi yu": "chi-yu",
    "nidoran f": "nidoran-f",
    "nidoran m": "nidoran-m"
  };

  if (explicitMap[base]) {
    return explicitMap[base];
  }

  let tokens = base.split(" ").filter(Boolean);
  if (tokens.length === 0) {
    return "";
  }

  if (tokens[0] === "mega" && tokens.length > 1) {
    tokens = tokens.slice(1);
  }
  if (tokens[0] === "radiant" && tokens.length > 1) {
    tokens = tokens.slice(1);
  }

  return tokens.join("-").replace(/[^a-z0-9-]/g, "");
}

function pokemonNameCandidates(name: string) {
  const baseKey = normalizePokemonNameKey(name);
  if (!baseKey) {
    return [];
  }

  const candidates = [baseKey];
  const parts = baseKey.split("-");
  if (parts.length > 1) {
    const formMap: Record<string, string> = {
      alolan: "alola",
      galarian: "galar",
      hisuian: "hisui",
      paldean: "paldea",
      bloodmoon: "bloodmoon"
    };
    const maybeFormPrefix = formMap[parts[0]];

    if (maybeFormPrefix) {
      const root = parts.slice(1).join("-");
      if (root) {
        candidates.unshift(`${root}-${maybeFormPrefix}`);
        candidates.push(root);
      }
    }
  }

  return Array.from(new Set(candidates));
}

function resolvePokemonStage(name: string): PokemonStage {
  const prefixedStage = deriveInitialStage(name);
  if (prefixedStage !== "Basic") {
    return prefixedStage;
  }

  const keys = pokemonNameCandidates(name);
  for (const key of keys) {
    const variantMapped = POKEMON_VARIANT_STAGE_MAP[key];
    if (variantMapped) {
      return variantMapped;
    }

    const mapped = POKEMON_STAGE_MAP[key];
    if (mapped) {
      return mapped;
    }
  }

  return "Basic";
}

function aggregateCardsByName(cards: CalculatorCard[]) {
  const groups = new Map<string, CalculatorCardGroup>();
  const orderedGroups: CalculatorCardGroup[] = [];

  cards.forEach((card) => {
    const key = `${card.category}::${String(card.name).toLowerCase()}`;
    const existing =
      groups.get(key) ??
      (() => {
        const nextGroup: CalculatorCardGroup = {
          category: card.category,
          name: card.name,
          count: 0,
          basicCount: 0,
          stage: undefined,
          stageCounts: {
            Basic: 0,
            "Stage 1": 0,
            "Stage 2": 0
          }
        };

        groups.set(key, nextGroup);
        orderedGroups.push(nextGroup);
        return nextGroup;
      })();

    existing.count += card.count;

    if (card.category === "Pokemon") {
      if (card.stage === "Basic") {
        existing.basicCount += card.count;
      }
      if (card.stage) {
        existing.stageCounts[card.stage] += card.count;
      }
    }
  });

  orderedGroups.forEach((group) => {
    if (group.category === "Pokemon") {
      group.stage = preferredPokemonStage(group.stageCounts);
    }
  });

  return orderedGroups;
}

function computeBasicPokemonCount(cards: CalculatorCard[]) {
  return cards.reduce((total, card) => {
    if (card.category === "Pokemon" && card.stage === "Basic") {
      return total + card.count;
    }

    return total;
  }, 0);
}

function conditionalOnNonMulligan(unconditionalProb: number, mulliganProb: number) {
  const nonMulligan = 1 - clamp01(mulliganProb);
  if (nonMulligan <= 0) {
    return 0;
  }

  return clamp01(unconditionalProb / nonMulligan);
}

export function probabilityCardInPlayableOpeningHand(
  targetCopies: number,
  targetBasicCopies: number,
  basicPokemonCount: number
) {
  if (
    ![targetCopies, targetBasicCopies, basicPokemonCount].every(Number.isInteger) ||
    targetCopies < 0 ||
    targetBasicCopies < 0 ||
    basicPokemonCount <= 0 ||
    targetBasicCopies > targetCopies ||
    targetBasicCopies > basicPokemonCount
  ) {
    return 0;
  }

  const targetOrBasicCopies = targetCopies + basicPokemonCount - targetBasicCopies;
  if (targetOrBasicCopies > DECK_SIZE) {
    return 0;
  }

  const noTarget = hypergeom(DECK_SIZE, targetCopies, OPENING_HAND, 0);
  const mulliganProbability = hypergeom(DECK_SIZE, basicPokemonCount, OPENING_HAND, 0);
  const noTargetOrBasic = hypergeom(
    DECK_SIZE,
    targetOrBasicCopies,
    OPENING_HAND,
    0
  );
  const targetAndPlayable = clamp01(
    1 - noTarget - mulliganProbability + noTargetOrBasic
  );

  return conditionalOnNonMulligan(targetAndPlayable, mulliganProbability);
}

function probabilityOnlyStarterCount(targetBasicCopies: number, basicPokemonCount: number) {
  if (!Number.isFinite(targetBasicCopies) || targetBasicCopies <= 0) {
    return 0;
  }

  const targetCopies = Math.floor(targetBasicCopies);
  const otherBasics = basicPokemonCount - targetCopies;
  const nonBasicCards = DECK_SIZE - targetCopies - otherBasics;
  const denominator = choose(DECK_SIZE, OPENING_HAND);

  if (denominator === 0) {
    return 0;
  }

  let probability = 0;
  const maxTargetInHand = Math.min(targetCopies, OPENING_HAND);

  for (let copiesInHand = 1; copiesInHand <= maxTargetInHand; copiesInHand += 1) {
    const remainingCards = OPENING_HAND - copiesInHand;
    const term =
      (choose(targetCopies, copiesInHand) *
        choose(otherBasics, 0) *
        choose(nonBasicCards, remainingCards)) /
      denominator;
    probability += term;
  }

  return clamp01(probability);
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value < 0 && value > -1e-12) {
    return 0;
  }
  if (value > 1 && value < 1 + 1e-12) {
    return 1;
  }

  return Math.max(0, Math.min(1, value));
}

function ensureLogFactorial(n: number) {
  for (let index = logFactorialCache.length; index <= n; index += 1) {
    logFactorialCache[index] = logFactorialCache[index - 1] + Math.log(index);
  }
}

function logChoose(n: number, k: number) {
  if (!Number.isInteger(n) || !Number.isInteger(k) || n < 0 || k < 0 || k > n) {
    return -Infinity;
  }

  const kk = Math.min(k, n - k);
  ensureLogFactorial(n);

  return logFactorialCache[n] - logFactorialCache[kk] - logFactorialCache[n - kk];
}

function choose(n: number, k: number) {
  const logValue = logChoose(n, k);
  return Number.isFinite(logValue) ? Math.exp(logValue) : 0;
}

function hypergeom(N: number, K: number, n: number, k: number) {
  if (![N, K, n, k].every(Number.isInteger)) {
    return 0;
  }
  if (N <= 0 || K < 0 || n < 0 || k < 0 || K > N || n > N || k > K || k > n) {
    return 0;
  }

  const failures = N - K;
  const drawsFromFailures = n - k;
  if (drawsFromFailures < 0 || drawsFromFailures > failures) {
    return 0;
  }

  const denominatorLog = logChoose(N, n);
  const numeratorLog = logChoose(K, k) + logChoose(failures, drawsFromFailures);
  if (!Number.isFinite(denominatorLog) || !Number.isFinite(numeratorLog)) {
    return 0;
  }

  return Math.exp(numeratorLog - denominatorLog);
}

function formatCardNumberForImage(number: string) {
  const compact = String(number).trim().replace(/\s+/g, "");
  const numericMatch = compact.match(/^(\d+)([A-Za-z]*)$/);

  if (numericMatch) {
    return `${numericMatch[1].padStart(3, "0")}${numericMatch[2].toUpperCase()}`;
  }

  return compact.toUpperCase();
}
