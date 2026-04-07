export const DECK_FORMAT_OPTIONS = [
  "SVI-ASC",
  "SVI-POR",
  "SVI-SSP",
  "SVI-TWM",
  "SVI-SFA",
  "SVI-OBF",
  "SVI-PAR",
  "SVI-PAL",
  "SVI-MEW",
  "SVI-TEF",
  "SVI-BRS"
] as const;

export function getDefaultDeckFormat() {
  return DECK_FORMAT_OPTIONS[0];
}
