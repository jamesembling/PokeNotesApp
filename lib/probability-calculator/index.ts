import {
  getDeckListCategoryFromLine,
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
const EXPORT_IMAGE_COLORS = {
  background: "#111111",
  panel: "#171717",
  panelBorder: "#2b2b2b",
  text: "#f2f2f2",
  mutedText: "#9a9a9a",
  cardPlaceholder: "#1f1f1f",
  cardPlaceholderBorder: "#2f2f2f",
  badgeBg: "rgba(15,15,15,0.86)",
  badgeBorder: "#3d3d3d",
  tableHeader: "#1e1e1e",
  tableHeaderText: "#b8b8b8",
  tableHeaderBorder: "#2d2d2d",
  tableRow: "#151515",
  tableRowBorder: "#242424"
} as const;

export const SAMPLE_DECKLIST = `Pokémon: 16
4 Munkidori ASC 99
3 Toedscool PAR 16
2 Stage 1 Toedscruel PAR 17
2 Mega Absol ex MEG 86
1 Stage 2 Garganacl PAL 123
2 Latias ex SSP 76
2 Bloodmoon Ursaluna ex TWM 141
Trainer: 34
4 Arven OBF 186
4 Buddy-Buddy Poffin TEF 144
4 Ultra Ball SVI 196
3 Nest Ball SVI 181
3 Iono PAL 185
3 Professor's Research SVI 189
3 Boss's Orders PAL 172
2 Rare Candy SVI 191
2 Switch SVI 194
2 Counter Catcher PAR 160
2 Earthen Vessel PAR 163
2 Night Stretcher SFA 61
Energy: 10
10 Darkness Energy SVE 7`;

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

type ExportReportModel = {
  cards: CalculatorCard[];
  totals: CalculatorTotals;
  mulliganProbability: number;
  setupRows: SetupRow[];
  prizingRows: PrizingRow[];
};

type ExportCardImage = {
  card: CalculatorCard;
  image: HTMLImageElement | null;
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
    const rawInStartingSeven = 1 - hypergeom(DECK_SIZE, card.count, OPENING_HAND, 0);
    const rawOnlyStarter = probabilityOnlyStarterCount(card.basicCount, basicPokemonCount);

    return {
      card,
      inStartingSeven: conditionalOnNonMulligan(rawInStartingSeven, mulliganProbability),
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

export function shouldRenderProbability(value: number) {
  return clamp01(value) >= 0.00005;
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

export function buildGalleryCardImageCandidates(set: string, number: string) {
  return [
    buildCardImageUrlFromValues(set, number, "XS", true),
    buildCardImageUrlFromValues(set, number, "SM", true),
    buildCardImageUrlFromValues(set, number, "XS", false),
    buildCardImageUrlFromValues(set, number, "SM", false)
  ];
}

export function getPokemonSpriteUrl(name: string, pokemonOptions?: PokemonOption[]) {
  return getSharedPokemonSpriteUrl(name, pokemonOptions);
}

export function reportTimestamp(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function buildReportPngBlob(analysis: CalculatorAnalysis) {
  const report = buildExportReportModel(analysis);
  const canvas = await drawExportReport(report);
  const blob = await canvasToBlob(canvas);

  if (!blob) {
    throw new Error("Could not encode PNG.");
  }

  return blob;
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

function buildExportReportModel(analysis: CalculatorAnalysis): ExportReportModel {
  return {
    cards: analysis.cards.slice(),
    totals: analysis.totals,
    mulliganProbability: analysis.mulliganProbability,
    setupRows: analysis.setupRows,
    prizingRows: analysis.prizingRows
  };
}

async function drawExportReport(report: ExportReportModel) {
  const width = 1560;
  const margin = 40;
  const contentWidth = width - margin * 2;
  const panelPad = 18;
  const cardWidth = 132;
  const cardHeight = 184;
  const cardGap = 10;
  const cardColumns = Math.max(
    4,
    Math.floor((contentWidth - panelPad * 2 + cardGap) / (cardWidth + cardGap))
  );
  const cardRows = Math.ceil(report.cards.length / cardColumns);
  const cardsGridHeight =
    cardRows > 0 ? cardRows * cardHeight + (cardRows - 1) * cardGap : 0;
  const cardsSectionHeight = 56 + cardsGridHeight + panelPad * 2;
  const setupRowHeight = 34;
  const setupSectionHeight = 56 + 40 + 30 + report.setupRows.length * setupRowHeight + panelPad;
  const prizeRowHeight = 34;
  const prizingSectionHeight =
    56 + 30 + report.prizingRows.length * prizeRowHeight + panelPad;
  const totalHeight =
    margin +
    64 +
    cardsSectionHeight +
    20 +
    setupSectionHeight +
    20 +
    prizingSectionHeight +
    margin;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = totalHeight;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not create drawing context.");
  }

  context.fillStyle = EXPORT_IMAGE_COLORS.background;
  context.fillRect(0, 0, canvas.width, canvas.height);

  let y = margin;
  context.fillStyle = EXPORT_IMAGE_COLORS.text;
  context.font = "700 36px 'Avenir Next','Segoe UI',sans-serif";
  context.fillText("Pokémon TCG Probability Report", margin, y + 34);
  y += 64;

  const cardsPanel = { x: margin, y, w: contentWidth, h: cardsSectionHeight };
  drawRoundedRect(
    context,
    cardsPanel.x,
    cardsPanel.y,
    cardsPanel.w,
    cardsPanel.h,
    12,
    EXPORT_IMAGE_COLORS.panel,
    EXPORT_IMAGE_COLORS.panelBorder
  );
  context.fillStyle = EXPORT_IMAGE_COLORS.text;
  context.font = "700 20px 'Avenir Next','Segoe UI',sans-serif";
  context.fillText("Card List", cardsPanel.x + panelPad, cardsPanel.y + 32);
  const cardDrawStartY = cardsPanel.y + 52;

  const cardImages = await loadExportCardImages(report.cards);
  cardImages.forEach((item, index) => {
    const column = index % cardColumns;
    const row = Math.floor(index / cardColumns);
    const x = cardsPanel.x + panelPad + column * (cardWidth + cardGap);
    const cardY = cardDrawStartY + row * (cardHeight + cardGap);

    drawRoundedRect(
      context,
      x,
      cardY,
      cardWidth,
      cardHeight,
      8,
      EXPORT_IMAGE_COLORS.cardPlaceholder,
      EXPORT_IMAGE_COLORS.cardPlaceholderBorder
    );
    if (item.image) {
      context.drawImage(item.image, x, cardY, cardWidth, cardHeight);
    } else {
      context.fillStyle = EXPORT_IMAGE_COLORS.mutedText;
      context.font = "500 13px 'Avenir Next','Segoe UI',sans-serif";
      context.fillText(`${item.card.set} ${item.card.number}`, x + 10, cardY + cardHeight / 2);
    }

    const badgeText = `x${item.card.count}`;
    const badgeWidth = 36;
    const badgeHeight = 24;
    const badgeX = x + cardWidth - badgeWidth - 6;
    const badgeY = cardY + cardHeight - badgeHeight - 6;

    drawRoundedRect(
      context,
      badgeX,
      badgeY,
      badgeWidth,
      badgeHeight,
      999,
      EXPORT_IMAGE_COLORS.badgeBg,
      EXPORT_IMAGE_COLORS.badgeBorder
    );
    context.fillStyle = EXPORT_IMAGE_COLORS.text;
    context.font = "700 13px 'Avenir Next','Segoe UI',sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(badgeText, badgeX + badgeWidth / 2, badgeY + badgeHeight / 2);
    context.textAlign = "left";
    context.textBaseline = "alphabetic";
  });

  y += cardsSectionHeight + 20;

  const setupPanel = { x: margin, y, w: contentWidth, h: setupSectionHeight };
  drawRoundedRect(
    context,
    setupPanel.x,
    setupPanel.y,
    setupPanel.w,
    setupPanel.h,
    12,
    EXPORT_IMAGE_COLORS.panel,
    EXPORT_IMAGE_COLORS.panelBorder
  );
  context.fillStyle = EXPORT_IMAGE_COLORS.text;
  context.font = "700 20px 'Avenir Next','Segoe UI',sans-serif";
  context.fillText("Setup Stats", setupPanel.x + panelPad, setupPanel.y + 32);

  context.fillStyle = EXPORT_IMAGE_COLORS.mutedText;
  context.font = "600 14px 'Avenir Next','Segoe UI',sans-serif";
  const setupSummary = `Pokémon ${report.totals.Pokemon}   Trainers ${report.totals.Trainer}   Energy ${report.totals.Energy}   Mulligan ${pct(report.mulliganProbability)}`;
  context.fillText(setupSummary, setupPanel.x + panelPad, setupPanel.y + 58);

  const setupTableX = setupPanel.x + panelPad;
  const setupTableY = setupPanel.y + 76;
  drawExportTableHeader(context, setupTableX, setupTableY, contentWidth - panelPad * 2, [
    "Pokémon",
    "In Starting 7",
    "Only Starter"
  ]);
  let setupRowY = setupTableY + 48;
  report.setupRows.forEach((row) => {
    drawExportRowBackground(
      context,
      setupTableX,
      setupRowY - 22,
      contentWidth - panelPad * 2,
      setupRowHeight
    );
    drawExportCell(
      context,
      `${row.card.count}x ${row.card.name}${row.card.stage ? ` (${row.card.stage})` : ""}`,
      setupTableX + 8,
      setupRowY,
      760
    );
    drawExportCell(
      context,
      shouldRenderProbability(row.inStartingSeven) ? pct(row.inStartingSeven) : "—",
      setupTableX + 860,
      setupRowY,
      220,
      true
    );
    drawExportCell(
      context,
      shouldRenderProbability(row.onlyStarter) ? pct(row.onlyStarter) : "—",
      setupTableX + 1120,
      setupRowY,
      220,
      true
    );
    setupRowY += setupRowHeight;
  });

  y += setupSectionHeight + 20;

  const prizingPanel = { x: margin, y, w: contentWidth, h: prizingSectionHeight };
  drawRoundedRect(
    context,
    prizingPanel.x,
    prizingPanel.y,
    prizingPanel.w,
    prizingPanel.h,
    12,
    EXPORT_IMAGE_COLORS.panel,
    EXPORT_IMAGE_COLORS.panelBorder
  );
  context.fillStyle = EXPORT_IMAGE_COLORS.text;
  context.font = "700 20px 'Avenir Next','Segoe UI',sans-serif";
  context.fillText("Prizing Stats", prizingPanel.x + panelPad, prizingPanel.y + 32);

  const prizingTableX = prizingPanel.x + panelPad;
  const prizingTableY = prizingPanel.y + 50;
  drawExportTableHeader(context, prizingTableX, prizingTableY, contentWidth - panelPad * 2, [
    "Card",
    "None",
    "1",
    "2",
    "3+"
  ]);
  let prizeRowY = prizingTableY + 48;
  report.prizingRows.forEach((row) => {
    drawExportRowBackground(
      context,
      prizingTableX,
      prizeRowY - 22,
      contentWidth - panelPad * 2,
      prizeRowHeight
    );
    drawExportCell(
      context,
      `${row.card.count}x ${row.card.name}${row.card.stage ? ` (${row.card.stage})` : ""}`,
      prizingTableX + 8,
      prizeRowY,
      720
    );
    drawExportCell(
      context,
      shouldRenderProbability(row.nonePrized) ? pct(row.nonePrized) : "—",
      prizingTableX + 820,
      prizeRowY,
      150,
      true
    );
    drawExportCell(
      context,
      shouldRenderProbability(row.onePrized) ? pct(row.onePrized) : "—",
      prizingTableX + 980,
      prizeRowY,
      150,
      true
    );
    drawExportCell(
      context,
      shouldRenderProbability(row.twoPrized) ? pct(row.twoPrized) : "—",
      prizingTableX + 1140,
      prizeRowY,
      150,
      true
    );
    drawExportCell(
      context,
      shouldRenderProbability(row.threePlusPrized) ? pct(row.threePlusPrized) : "—",
      prizingTableX + 1300,
      prizeRowY,
      150,
      true
    );
    prizeRowY += prizeRowHeight;
  });

  return canvas;
}

async function loadExportCardImages(cards: CalculatorCard[]): Promise<ExportCardImage[]> {
  const imagePromises = new Map<string, Promise<HTMLImageElement | null>>();

  cards.forEach((card) => {
    const key = `${String(card.set).toUpperCase()}::${String(card.number)}`;
    if (!imagePromises.has(key)) {
      imagePromises.set(key, loadBestCardImage(card));
    }
  });

  const imageMap = new Map<string, HTMLImageElement | null>();
  await Promise.all(
    Array.from(imagePromises.entries()).map(async ([key, promise]) => {
      imageMap.set(key, await promise);
    })
  );

  return cards.map((card) => {
    const key = `${String(card.set).toUpperCase()}::${String(card.number)}`;
    return {
      card,
      image: imageMap.get(key) ?? null
    };
  });
}

async function loadBestCardImage(card: CalculatorCard) {
  const directUrls = [
    buildCardImageUrlFromValues(card.set, card.number, "SM", true),
    buildCardImageUrlFromValues(card.set, card.number, "XS", true),
    buildCardImageUrlFromValues(card.set, card.number, "SM", false),
    buildCardImageUrlFromValues(card.set, card.number, "XS", false)
  ];
  const urls = directUrls.flatMap((url) => [corsProxyUrl(url), url]);

  for (const url of urls) {
    try {
      return await loadImage(url);
    } catch {
      // Try the next URL candidate.
    }
  }

  return null;
}

function corsProxyUrl(url: string) {
  const withoutProtocol = String(url).replace(/^https?:\/\//i, "");
  return `https://images.weserv.nl/?url=${encodeURIComponent(withoutProtocol)}`;
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Image load failed for ${url}`));
    image.src = url;
  });
}

function drawRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fill: string,
  stroke: string
) {
  const safeRadius = Math.max(0, Math.min(radius, Math.floor(Math.min(width, height) / 2)));
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();

  context.fillStyle = fill;
  context.fill();
  context.strokeStyle = stroke;
  context.lineWidth = 1;
  context.stroke();
}

function drawExportTableHeader(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  labels: string[]
) {
  drawRoundedRect(
    context,
    x,
    y,
    width,
    26,
    6,
    EXPORT_IMAGE_COLORS.tableHeader,
    EXPORT_IMAGE_COLORS.tableHeaderBorder
  );
  context.fillStyle = EXPORT_IMAGE_COLORS.tableHeaderText;
  context.font = "600 13px 'Avenir Next','Segoe UI',sans-serif";

  if (labels.length === 3) {
    context.fillText(labels[0], x + 8, y + 17);
    context.fillText(labels[1], x + 860, y + 17);
    context.fillText(labels[2], x + 1120, y + 17);
    return;
  }

  context.fillText(labels[0], x + 8, y + 17);
  context.fillText(labels[1], x + 820, y + 17);
  context.fillText(labels[2], x + 980, y + 17);
  context.fillText(labels[3], x + 1140, y + 17);
  context.fillText(labels[4], x + 1300, y + 17);
}

function drawExportRowBackground(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number
) {
  drawRoundedRect(
    context,
    x,
    y,
    width,
    height,
    6,
    EXPORT_IMAGE_COLORS.tableRow,
    EXPORT_IMAGE_COLORS.tableRowBorder
  );
}

function drawExportCell(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  alignRight = false
) {
  context.fillStyle = EXPORT_IMAGE_COLORS.text;
  context.font = "500 14px 'Avenir Next','Segoe UI',sans-serif";

  if (alignRight) {
    const clipped = clipTextToWidth(context, text, maxWidth);
    const textWidth = context.measureText(clipped).width;
    context.fillText(clipped, x + maxWidth - textWidth - 8, y);
    return;
  }

  context.fillText(clipTextToWidth(context, text, maxWidth), x, y);
}

function clipTextToWidth(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const value = String(text || "");
  if (context.measureText(value).width <= maxWidth) {
    return value;
  }

  const ellipsis = "...";
  let clipped = value;
  while (clipped.length > 0 && context.measureText(clipped + ellipsis).width > maxWidth) {
    clipped = clipped.slice(0, -1);
  }

  return `${clipped}${ellipsis}`;
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}
