import type { DeckCard } from "@/types/index";

const HEADER_PATTERNS = [
  { pattern: /^pok[eé]mon(?:\s+cards?)?(?::|\b)/i, category: "Pokemon" },
  { pattern: /^trainers?(?:\s+cards?)?(?::|\b)/i, category: "Trainer" },
  { pattern: /^energ(?:y|ies)(?:\s+cards?)?(?::|\b)/i, category: "Energy" }
] as const;

const COUNT_LINE_PATTERN = /^(\d+)\s*(?:x)?\s+(.+)$/i;

type DeckListCategory = "Pokemon" | "Trainer" | "Energy" | "";

export function parseLines(value: string) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
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

export function summarizeDeckList(rawList: string) {
  let total = 0;
  let matchedLines = 0;

  parseLines(rawList).forEach((line) => {
    const parsed = parseDeckListCountLine(line);
    if (!parsed) {
      return;
    }

    total += parsed.count;
    matchedLines += 1;
  });

  return {
    total: matchedLines > 0 ? total : null,
    matchedLines
  };
}

export function parseDeckList(rawList: string): DeckCard[] {
  const cards: DeckCard[] = [];
  let currentCategory: DeckListCategory = "";

  parseLines(rawList).forEach((line) => {
    const category = getDeckListCategoryFromLine(line);
    if (category) {
      currentCategory = category;
      return;
    }

    const parsedLine = parseDeckListCountLine(line);
    if (!parsedLine) {
      return;
    }

    const { name, set, number } = splitDeckListDescription(parsedLine.description);
    if (!name) {
      return;
    }

    cards.push({
      count: parsedLine.count,
      name,
      set,
      number,
      category: currentCategory || undefined
    });
  });

  return cards;
}
