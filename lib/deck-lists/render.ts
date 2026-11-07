import { normalizeLimitlessSetCode } from "@/lib/deck-lists/limitless";

export type DeckListCardImageSize = "XS" | "SM" | "MD" | "LG";

function formatDeckListCardNumber(number: string): string {
  const match = number.match(/^([A-Za-z]*)(\d+)([A-Za-z]*)$/);

  if (match) {
    const [, prefix, digits, suffix] = match;
    return `${prefix}${digits.padStart(3, "0")}${suffix}`;
  }

  return number;
}

export function buildDeckListCardImageUrl(
  set: string,
  number: string,
  size: DeckListCardImageSize = "SM"
) {
  const normalizedSet = normalizeLimitlessSetCode(set);
  const formattedNumber = formatDeckListCardNumber(number);
  return `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/${normalizedSet}/${normalizedSet}_${formattedNumber}_R_EN_${size}.png`;
}

export function buildDeckListCardUrl(set: string, number: string) {
  return `https://limitlesstcg.com/cards/${normalizeLimitlessSetCode(set)}/${number}`;
}
