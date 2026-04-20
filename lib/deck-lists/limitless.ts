const LIMITLESS_SET_CODE_ALIASES: Record<string, string> = {
  "PR-HS": "HSP",
  "PR-BLW": "BWP",
  "PR-XY": "XYP",
  "PR-SM": "SMP",
  "PR-SW": "SP",
  "PR-SV": "SVP"
};

export function normalizeLimitlessSetCode(value: string | null | undefined) {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase();

  return LIMITLESS_SET_CODE_ALIASES[normalized] ?? normalized;
}
