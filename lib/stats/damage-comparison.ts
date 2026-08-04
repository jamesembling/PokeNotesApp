export type DamageComparison = {
  difference: number;
  leader: "equal" | "opponent" | "self";
  percentage: number | null;
};

export function compareDamageTotals(
  attackDamage: number,
  opponentAttackDamage: number
): DamageComparison {
  const difference = attackDamage - opponentAttackDamage;

  if (difference === 0) {
    return {
      difference: 0,
      leader: "equal",
      percentage: 0
    };
  }

  const leader = difference > 0 ? "self" : "opponent";
  const comparisonBaseline = leader === "self" ? opponentAttackDamage : attackDamage;

  return {
    difference: Math.abs(difference),
    leader,
    percentage:
      comparisonBaseline > 0
        ? Math.round((Math.abs(difference) / comparisonBaseline) * 100)
        : null
  };
}
