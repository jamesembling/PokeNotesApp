export const SITE_FORMAT_OPTIONS = [
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

export function isKnownSiteFormat(value: string) {
  return SITE_FORMAT_OPTIONS.includes(value as (typeof SITE_FORMAT_OPTIONS)[number]);
}

export function getDefaultSiteFormat() {
  return SITE_FORMAT_OPTIONS[0];
}
