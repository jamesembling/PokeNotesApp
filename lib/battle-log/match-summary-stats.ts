export const MATCH_SUMMARY_STAT_MAX = {
  attackDamage: 1000,
  mulligans: 5,
  prizes: 6,
  turns: 10
} as const;

export function getStatBarHalfWidth(value: number, maxValue: number) {
  if (maxValue <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(50, (value / maxValue) * 50));
}
