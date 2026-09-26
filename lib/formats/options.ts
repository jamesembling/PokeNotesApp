const FORMAT_CODE_PATTERN = /\b([A-Z0-9]{3}-[A-Z0-9]{3}(?:\/[A-Z0-9]{3})?)\b/g;

export const SITE_FORMAT_OPTIONS = [
  "TEF-30C",
  "TEF-PBL",
  "TEF-CRI",
  "TEF-POR",
  "SVI-ASC",
  "SVI-PFL",
  "SVI-MEG",
  "SVI-WHT/BLK",
  "SVI-DRI",
  "SVI-JTG",
  "BRS-PRE",
  "BRS-SSP",
  "BRS-SCR",
  "Expanded",
  "GLC",
  "PTCG Pocket"
] as const;

const NON_STANDARD_SITE_FORMATS = new Set<(typeof SITE_FORMAT_OPTIONS)[number]>([
  "Expanded",
  "GLC",
  "PTCG Pocket"
]);

export function isKnownSiteFormat(value: string) {
  return SITE_FORMAT_OPTIONS.includes(value as (typeof SITE_FORMAT_OPTIONS)[number]);
}

export function extractSiteFormatCodes(html: string) {
  // Set codes may contain digits (TEF-30C), but a purely numeric span is a count or range, not a format.
  return [...html.matchAll(FORMAT_CODE_PATTERN)].map((match) => match[1]).filter((code) => /[A-Z]/.test(code));
}

export function getDefaultSiteFormat(discoveredFormats: readonly string[] = []) {
  const fallback = SITE_FORMAT_OPTIONS.find((format) => !NON_STANDARD_SITE_FORMATS.has(format)) ?? SITE_FORMAT_OPTIONS[0];
  const discovered = discoveredFormats[0];
  if (!discovered) {
    return fallback;
  }

  const discoveredIndex = SITE_FORMAT_OPTIONS.indexOf(discovered as (typeof SITE_FORMAT_OPTIONS)[number]);
  return discoveredIndex > 0 ? fallback : discovered;
}
