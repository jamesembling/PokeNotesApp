import type { DeckCard } from "@/types/index";
import { compactMap } from "@/lib/array";

const HEADER_PATTERNS = [
  { pattern: /^pok[eé]mon(?:\s+cards?)?(?::|\b)/i, category: "Pokemon" },
  { pattern: /^trainers?(?:\s+cards?)?(?::|\b)/i, category: "Trainer" },
  { pattern: /^energ(?:y|ies)(?:\s+cards?)?(?::|\b)/i, category: "Energy" }
] as const;

const COUNT_LINE_PATTERN = /^(\d+)\s*(?:x)?\s+(.+)$/i;
const SUMMARY_LINE_PATTERN = /^total\s+cards?\s*:\s*\d+\s*$/i;

type DeckListCategory = "Pokemon" | "Trainer" | "Energy" | "";

export type DeckListInterpretationLine = {
  card: DeckCard | null;
  category: DeckListCategory;
  count: number | null;
  description: string;
  kind: "card" | "header" | "malformed" | "summary";
  source: string;
};

export type DeckListInterpretation = {
  cards: DeckCard[];
  lines: DeckListInterpretationLine[];
  malformedCategorizedLineCount: number;
  summary: {
    matchedLines: number;
    total: number | null;
  };
};

export function parseLines(value: string) {
  return compactMap(String(value || "")
    .split(/\r?\n/), (line) => line.trim());
}

export function getDeckListCategoryFromLine(value: string): DeckListCategory {
  const trimmed = String(value || "").trim();

  for (const entry of HEADER_PATTERNS) {
    if (entry.pattern.test(trimmed)) {
      return entry.category;
    }
  }

  return "";
}

export function isDeckListSummaryLine(value: string) {
  return SUMMARY_LINE_PATTERN.test(String(value || "").trim());
}

export function parseDeckListCountLine(value: string) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return null;
  }

  const match = trimmed.match(COUNT_LINE_PATTERN);
  if (!match) {
    return null;
  }

  const count = Number.parseInt(match[1], 10);
  const description = String(match[2] || "").trim();

  if (!Number.isInteger(count) || count <= 0 || !description) {
    return null;
  }

  return {
    count,
    description
  };
}

export function splitDeckListDescription(description: string) {
  const text = String(description || "").trim();
  const parts = text.split(/\s+/).filter(Boolean);

  if (parts.length < 3) {
    return {
      name: text,
      set: "",
      number: ""
    };
  }

  const number = parts.at(-1) ?? "";
  const set = parts.at(-2) ?? "";

  if (/^[A-Z0-9-]+$/i.test(set) && /^[A-Z0-9/-]+$/i.test(number) && /\d/.test(number)) {
    return {
      name: parts.slice(0, -2).join(" "),
      set,
      number
    };
  }

  return {
    name: text,
    set: "",
    number: ""
  };
}

export function interpretDeckList(rawList: string): DeckListInterpretation {
  const cards: DeckCard[] = [];
  const lines: DeckListInterpretationLine[] = [];
  let currentCategory: DeckListCategory = "";
  let total = 0;
  let matchedLines = 0;
  let malformedCategorizedLineCount = 0;

  parseLines(rawList).forEach((line) => {
    const category = getDeckListCategoryFromLine(line);
    if (category) {
      currentCategory = category;
      lines.push({
        card: null,
        category,
        count: null,
        description: "",
        kind: "header",
        source: line
      });
      return;
    }

    if (isDeckListSummaryLine(line)) {
      lines.push({
        card: null,
        category: currentCategory,
        count: null,
        description: "",
        kind: "summary",
        source: line
      });
      return;
    }

    const parsed = parseDeckListCountLine(line);
    if (!parsed) {
      if (currentCategory) {
        malformedCategorizedLineCount += 1;
      }
      lines.push({
        card: null,
        category: currentCategory,
        count: null,
        description: "",
        kind: "malformed",
        source: line
      });
      return;
    }

    total += parsed.count;
    matchedLines += 1;
    const { name, set, number } = splitDeckListDescription(parsed.description);
    const card = name
      ? {
          count: parsed.count,
          name,
          set,
          number,
          category: currentCategory || undefined
        }
      : null;

    if (card) {
      cards.push(card);
    }
    if (currentCategory && (!card || !set || !number)) {
      malformedCategorizedLineCount += 1;
    }
    lines.push({
      card,
      category: currentCategory,
      count: parsed.count,
      description: parsed.description,
      kind: card ? "card" : "malformed",
      source: line
    });
  });

  return {
    cards,
    lines,
    malformedCategorizedLineCount,
    summary: {
      total: matchedLines > 0 ? total : null,
      matchedLines
    }
  };
}

export function parseDeckList(rawList: string): DeckCard[] {
  return interpretDeckList(rawList).cards;
}
