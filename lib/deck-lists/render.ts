export function formatDeckListCardNumber(number: string): string {
  const match = number.match(/^([A-Za-z]*)(\d+)([A-Za-z]*)$/);

  if (match) {
    const [, prefix, digits, suffix] = match;
    return `${prefix}${digits.padStart(3, "0")}${suffix}`;
  }

  return number;
}

export function buildDeckListCardImageUrl(set: string, number: string) {
  const formattedNumber = formatDeckListCardNumber(number);
  return `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/${set}/${set}_${formattedNumber}_R_EN_SM.png`;
}

export function buildDeckListCardUrl(set: string, number: string) {
  return `https://limitlesstcg.com/cards/${set}/${number}`;
}
