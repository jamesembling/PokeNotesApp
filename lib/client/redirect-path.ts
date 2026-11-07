/** Drops the query string so a save result's redirect can be compared with the current pathname. */
export function normalizeRedirectPath(value: string) {
  return value.split("?")[0] || value;
}
